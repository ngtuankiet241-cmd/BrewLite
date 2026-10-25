import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { OrdersController } from '../src/orders/orders.controller.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { OrderSizeId } from '../src/orders/order.types.js';
import { PaymentsController } from '../src/payments/payments.controller.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PromotionsService } from '../src/promotions/promotions.service.js';

describe('Idempotent checkout retries in PostgreSQL', () => {
  const db = new PrismaClient();
  const firstDb = new PrismaClient();
  const secondDb = new PrismaClient();
  const ipnSecret = 'idempotency-test-ipn';
  let first: INestApplication<App>;
  let second: INestApplication<App>;
  let fixture: string;
  let token: string;
  let otherToken: string;

  async function application(client: PrismaClient) {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'idempotency-test-jwt' })],
      controllers: [OrdersController, PaymentsController],
      providers: [
        OrdersService,
        PromotionsService,
        PaymentsService,
        { provide: PrismaService, useValue: client },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            SEPAY_ENV: 'sandbox',
            SEPAY_MERCHANT_ID: 'local-test-merchant',
            SEPAY_SECRET_KEY: 'local-test-secret',
            SEPAY_IPN_SECRET_KEY: ipnSecret,
            FRONTEND_URL: 'http://localhost:3000',
          }),
        },
      ],
    }).compile();
    const app = module.createNestApplication();
    await app.init();
    return app;
  }

  beforeAll(async () => {
    // Separate apps verify that a later retry uses the persisted result.
    // SePay only signs fields locally; tests never contact the payment gateway.
    first = await application(firstDb);
    second = await application(secondDb);
  });

  beforeEach(async () => {
    fixture = `idempotency-test-${randomUUID()}`;
    await db.user.createMany({
      data: [fixture, `${fixture}-other`].map((id) => ({
        id,
        email: `${id}@example.invalid`,
        passwordHash: 'not-a-login',
        loyaltyPoints: 100,
      })),
    });
    await db.product.create({
      data: {
        id: fixture,
        name: 'Idempotency coffee',
        price: 25000,
        stock: 20,
      },
    });
    token = first.get(JwtService).sign({ sub: fixture });
    otherToken = first.get(JwtService).sign({ sub: `${fixture}-other` });
  });

  afterEach(async () => {
    const userIds = [fixture, `${fixture}-other`];
    await db.$transaction(async (tx) => {
      await tx.payment.deleteMany({
        where: { order: { userId: { in: userIds } } },
      });
      await tx.order.deleteMany({ where: { userId: { in: userIds } } });
      await tx.promotion.deleteMany({ where: { code: fixture.toUpperCase() } });
      await tx.product.deleteMany({ where: { id: { in: userIds } } });
      // Idempotency records belong to these unique users and cascade on delete.
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    });
  });

  afterAll(async () => {
    await first?.close();
    await second?.close();
    await Promise.all([
      db.$disconnect(),
      firstDb.$disconnect(),
      secondDb.$disconnect(),
    ]);
  });

  const items = (quantity = 1) => [
    { productId: fixture, quantity, sizeId: OrderSizeId.Small, toppingIds: [] },
  ];
  const order = (
    app: INestApplication<App>,
    key: string,
    extra = {},
    auth = token,
  ) =>
    request(app.getHttpServer())
      .post('/orders')
      .auth(auth, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send({ items: items(), ...extra });
  const pay = (
    app: INestApplication<App>,
    key: string,
    orderCode: string,
    auth = token,
  ) =>
    request(app.getHttpServer())
      .post('/payments')
      .auth(auth, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send({ orderCode });
  const stock = async () =>
    (await db.product.findUniqueOrThrow({ where: { id: fixture } })).stock;
  const balance = async () =>
    (await db.user.findUniqueOrThrow({ where: { id: fixture } })).loyaltyPoints;
  const orderCount = () => db.order.count({ where: { userId: fixture } });
  const notify = (
    app: INestApplication<App>,
    orderCode: string,
    amount: number,
  ) =>
    request(app.getHttpServer())
      .post('/payments/ipn')
      .set('X-Secret-Key', ipnSecret)
      .send({
        notification_type: 'ORDER_PAID',
        order: {
          order_invoice_number: orderCode,
          order_status: 'CAPTURED',
          order_currency: 'VND',
          order_amount: String(amount),
        },
      });

  it('creates exactly one order when the same Idempotency-Key and body are sent twice', async () => {
    const promotionCode = fixture.toUpperCase();
    await db.promotion.create({
      data: {
        code: promotionCode,
        discountType: 'FIXED',
        value: 1000,
        usageLimit: 1,
        startsAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const key = randomUUID();
    const payload = { promotionCode, pointsToRedeem: 20 };
    const initial = await order(first, key, payload).expect(201);
    const retry = await order(second, key, payload).expect(201);

    expect(retry.body).toEqual(initial.body);
    expect(retry.body.orderCode).toBe(initial.body.orderCode);
    expect(initial.body.totalAmount).toBe(23800);
    expect(await orderCount()).toBe(1);
    expect(await db.orderItem.count({ where: { productId: fixture } })).toBe(1);
    expect(await stock()).toBe(19);
    expect(await balance()).toBe(80);
    expect(
      (await db.promotion.findUniqueOrThrow({ where: { code: promotionCode } }))
        .usedCount,
    ).toBe(1);
    expect(
      await db.idempotencyRequest.count({
        where: { userId: fixture, operation: 'orders.create', key },
      }),
    ).toBe(1);
  });

  it('returns the original order for a retry after restart and catalog changes', async () => {
    const key = randomUUID();
    const initial = await order(first, key).expect(201);

    // Replay must precede price and stock validation, even after restart.
    await db.product.update({
      where: { id: fixture },
      data: { price: 90000, stock: 0 },
    });
    await second.close();
    second = await application(secondDb);
    const replay = await order(second, key).expect(201);
    expect(replay.body).toEqual(initial.body);
    expect(await orderCount()).toBe(1);
    expect(await balance()).toBe(100);
  });

  it('returns 409 when an order key is reused with changed items, promotion or points', async () => {
    const key = randomUUID();
    await order(first, key).expect(201);
    for (const change of [
      { items: items(2) },
      { items: [{ ...items()[0], sizeId: 'M' }] },
      { items: [{ ...items()[0], toppingIds: ['cheese'] }] },
      { promotionCode: 'ANOTHER' },
      { pointsToRedeem: 20 },
    ]) {
      await order(second, key, change).expect(409);
    }
    expect(await orderCount()).toBe(1);
    expect(await stock()).toBe(19);
    expect(await balance()).toBe(100);
  });

  it('rolls back business writes if saving the idempotency result fails, then allows a retry', async () => {
    const key = randomUUID();
    const failingDb = firstDb.$extends({
      query: {
        idempotencyRequest: {
          create: () => {
            throw new Error('write failed');
          },
        },
      },
    }) as unknown as PrismaService;
    const service = new OrdersService(
      failingDb,
      new PromotionsService(failingDb),
    );
    await expect(
      service.create({ items: items(), pointsToRedeem: 20 }, fixture, key),
    ).rejects.toThrow('write failed');
    expect(await orderCount()).toBe(0);
    expect(await stock()).toBe(20);
    expect(await balance()).toBe(100);
    expect(
      await db.idempotencyRequest.count({ where: { userId: fixture } }),
    ).toBe(0);
    await order(second, key, { pointsToRedeem: 20 }).expect(201);
    expect(await stock()).toBe(19);
    expect(await balance()).toBe(80);
  });

  it('allows a retry with the same key after an insufficient-stock failure', async () => {
    const key = randomUUID();
    await db.product.update({ where: { id: fixture }, data: { stock: 0 } });
    await order(first, key).expect(400);
    expect(
      await db.idempotencyRequest.count({ where: { userId: fixture } }),
    ).toBe(0);
    await db.product.update({ where: { id: fixture }, data: { stock: 1 } });
    await order(second, key).expect(201);
    expect(await stock()).toBe(0);
    expect(await orderCount()).toBe(1);
  });

  it('creates one payment when the same Idempotency-Key and body are sent twice', async () => {
    const key = randomUUID();
    const created = await order(first, key, { pointsToRedeem: 20 }).expect(201);
    const code = created.body.orderCode as string;
    // The same client key is independent between POST /orders and POST /payments.
    const initial = await pay(first, key, code).expect(201);
    const retry = await pay(second, key, code).expect(201);

    expect(retry.body).toEqual(initial.body);
    // The order of signed form fields survives storage and replay.
    expect(Object.keys(retry.body.formFields)).toEqual(
      Object.keys(initial.body.formFields),
    );
    expect(await db.payment.count({ where: { orderId: code } })).toBe(1);
    expect(await orderCount()).toBe(1);
    expect(await stock()).toBe(19);
    expect(await balance()).toBe(80);
  });

  it('replays payment initialization after settlement without resetting payment or crediting points twice', async () => {
    const created = await order(first, randomUUID(), {
      pointsToRedeem: 20,
    }).expect(201);
    const code = created.body.orderCode as string;
    const key = randomUUID();
    const initial = await pay(first, key, code).expect(201);
    await notify(first, code, 24800).expect(200);
    expect(await balance()).toBe(104);
    await first.get(OrdersService).updateStatus(code, 'PREPARING');
    const replay = await pay(second, key, code).expect(201);
    expect(replay.body).toEqual(initial.body);
    expect(await balance()).toBe(104);
    expect(await db.payment.count({ where: { orderId: code } })).toBe(1);
    expect(
      (await db.payment.findFirstOrThrow({ where: { orderId: code } })).status,
    ).toBe('SUCCEEDED');
    expect(
      (await db.order.findUniqueOrThrow({ where: { orderCode: code } })).status,
    ).toBe('PREPARING');
  });

  it('rejects a payment key reused for another order without creating a second payment', async () => {
    const one = await order(first, randomUUID()).expect(201);
    const two = await order(second, randomUUID()).expect(201);
    const key = randomUUID();
    await pay(first, key, one.body.orderCode as string).expect(201);
    await pay(second, key, two.body.orderCode as string).expect(409);
    expect(
      await db.payment.count({ where: { order: { userId: fixture } } }),
    ).toBe(1);
  });

  it('scopes keys to the authenticated user and never replays another user payment', async () => {
    const key = randomUUID();
    const one = await order(first, key).expect(201);
    const two = await order(second, key, {}, otherToken).expect(201);
    expect(two.body.orderCode).not.toBe(one.body.orderCode);
    await pay(first, key, one.body.orderCode as string).expect(201);
    await pay(second, key, one.body.orderCode as string, otherToken).expect(
      400,
    );
    await pay(second, key, two.body.orderCode as string, otherToken).expect(
      201,
    );
    expect(
      await db.payment.count({
        where: { order: { userId: { in: [fixture, `${fixture}-other`] } } },
      }),
    ).toBe(2);
  });

  it('requires authentication and a valid payment key', async () => {
    const created = await order(first, randomUUID()).expect(201);
    await request(first.getHttpServer())
      .post('/payments')
      .auth(token, { type: 'bearer' })
      .send({ orderCode: created.body.orderCode })
      .expect(400);
    await pay(first, ' ', created.body.orderCode as string).expect(400);
    await order(first, 'a'.repeat(201)).expect(400);
    await request(first.getHttpServer())
      .post('/orders')
      .set('Idempotency-Key', randomUUID())
      .send({ items: items() })
      .expect(401);
    expect(
      await db.payment.count({ where: { order: { userId: fixture } } }),
    ).toBe(0);
  });
});
