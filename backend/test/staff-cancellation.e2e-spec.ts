import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { StaffGuard } from '../src/auth/staff.guard.js';
import { OrdersController } from '../src/orders/orders.controller.js';
import { StaffOrdersController } from '../src/orders/staff-orders.controller.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PaymentsController } from '../src/payments/payments.controller.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PromotionsService } from '../src/promotions/promotions.service.js';
import {
  createTestProduct,
  deleteTestProduct,
} from './helpers/ingredient-inventory.js';

describe('Staff cancellation with Gateway Sandbox and simulated refunds', () => {
  const db = new PrismaClient();
  const secret = 'staff-cancellation-test-ipn';
  let app: INestApplication<App>;
  let fixture: string;
  let staffId: string;
  let staffToken: string;
  let customerToken: string;
  let baseIngredientId: string;
  let toppingIngredientId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'staff-cancellation-test-jwt' })],
      controllers: [
        OrdersController,
        StaffOrdersController,
        PaymentsController,
      ],
      providers: [
        OrdersService,
        PromotionsService,
        PaymentsService,
        JwtAuthGuard,
        StaffGuard,
        { provide: PrismaService, useValue: db },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            SEPAY_ENV: 'sandbox',
            SEPAY_MERCHANT_ID: 'test-merchant',
            SEPAY_SECRET_KEY: 'test-merchant-secret',
            SEPAY_IPN_SECRET_KEY: secret,
          }),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  beforeEach(async () => {
    fixture = `cancel-${randomUUID()}`;
    staffId = `${fixture}-staff`;
    await db.user.createMany({
      data: [
        {
          id: fixture,
          email: `${fixture}@example.invalid`,
          passwordHash: 'unused',
          loyaltyPoints: 100,
        },
        {
          id: staffId,
          email: `${staffId}@example.invalid`,
          passwordHash: 'unused',
          role: 'STAFF',
        },
      ],
    });
    ({ baseIngredientId, toppingIngredientId } = await createTestProduct(db, {
      id: fixture,
      name: 'Cancellation test drink',
      price: 25000,
      stock: 20,
    }));
    staffToken = app.get(JwtService).sign({ sub: staffId });
    customerToken = app.get(JwtService).sign({ sub: fixture });
  });

  afterEach(async () => {
    await db.payment.deleteMany({ where: { order: { userId: fixture } } });
    await db.order.deleteMany({ where: { userId: fixture } });
    await db.promotion.deleteMany({ where: { code: fixture.toUpperCase() } });
    await db.user.deleteMany({ where: { id: { in: [fixture, staffId] } } });
    await deleteTestProduct(db, fixture, [
      baseIngredientId,
      toppingIngredientId,
    ]);
  });
  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });

  const balance = async () =>
    (await db.user.findUniqueOrThrow({ where: { id: fixture } })).loyaltyPoints;
  const stock = async () =>
    Number(
      (
        await db.ingredient.findUniqueOrThrow({
          where: { id: baseIngredientId },
        })
      ).stock,
    );
  const cancel = (orderCode: string, expectedStatus = 'PAID') =>
    request(app.getHttpServer())
      .patch(`/staff/orders/${orderCode}/status`)
      .auth(staffToken, { type: 'bearer' })
      .send({
        status: 'CANCELLED',
        expectedStatus,
        reason: 'Khách yêu cầu hủy',
      });
  const payload = (orderCode: string, amount: number) => ({
    notification_type: 'ORDER_PAID',
    order: {
      order_invoice_number: orderCode,
      order_status: 'CAPTURED',
      order_currency: 'VND',
      order_amount: String(amount),
    },
    transaction: {
      transaction_status: 'APPROVED',
      transaction_currency: 'VND',
      transaction_amount: String(amount),
    },
  });
  const notify = (orderCode: string, amount: number) =>
    request(app.getHttpServer())
      .post('/payments/ipn')
      .set('X-Secret-Key', secret)
      .send(payload(orderCode, amount));

  async function checkout(
    options: { paid?: boolean; points?: number; promotion?: boolean } = {},
  ) {
    if (options.promotion)
      await db.promotion.create({
        data: {
          code: fixture.toUpperCase(),
          discountType: 'FIXED',
          value: 1000,
          usageLimit: 1,
          startsAt: new Date(Date.now() - 60000),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
    const { body } = await request(app.getHttpServer())
      .post('/orders')
      .auth(customerToken, { type: 'bearer' })
      .send({
        items: [
          {
            productId: fixture,
            quantity: 1,
            sizeId: 'S',
            toppingIds: ['white_pearl'],
          },
        ],
        pointsToRedeem: options.points ?? 20,
        ...(options.promotion ? { promotionCode: fixture.toUpperCase() } : {}),
      })
      .expect(201);
    if (body.totalAmount > 0) {
      const payment = await request(app.getHttpServer())
        .post('/payments')
        .auth(customerToken, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .send({ orderCode: body.orderCode })
        .expect(201);
      expect(payment.body.checkoutUrl).toBe(
        'https://pay-sandbox.sepay.vn/v1/checkout/init',
      );
      if (options.paid !== false)
        await notify(body.orderCode, body.totalAmount).expect(200);
    }
    return body as { orderCode: string; totalAmount: number };
  }

  it('requires a valid staff account and checks role revocation immediately', async () => {
    await request(app.getHttpServer()).get('/staff/orders').expect(401);
    await request(app.getHttpServer())
      .get('/staff/orders')
      .auth(customerToken, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/staff/orders/unknown/status')
      .auth(customerToken, { type: 'bearer' })
      .send({
        status: 'CANCELLED',
        expectedStatus: 'PAID',
        reason: 'Khách tự gọi API',
      })
      .expect(403);
    await request(app.getHttpServer())
      .get('/staff/orders')
      .auth(staffToken, { type: 'bearer' })
      .expect(200);
    await db.user.update({
      where: { id: staffId },
      data: { role: 'CUSTOMER' },
    });
    await request(app.getHttpServer())
      .get('/staff/orders')
      .auth(staffToken, { type: 'bearer' })
      .expect(403);
  });

  it('refunds the net paid amount, restores snapshot inventory, promotion use and points exactly once', async () => {
    const order = await checkout({ promotion: true });
    const earned = Math.floor(order.totalAmount / 1000);
    expect(await stock()).toBe(19);
    expect(await balance()).toBe(80 + earned);
    // Recipes may change after checkout. Return the original consumed amount.
    await db.productRecipeIngredient.updateMany({
      where: { productId: fixture },
      data: { quantity: 9 },
    });
    await Promise.all([
      cancel(order.orderCode).expect(200),
      cancel(order.orderCode).expect(200),
    ]);
    expect(await stock()).toBe(20);
    expect(
      Number(
        (
          await db.ingredient.findUniqueOrThrow({
            where: { id: toppingIngredientId },
          })
        ).stock,
      ),
    ).toBe(10000);
    expect(await balance()).toBe(100);
    expect(
      (
        await db.promotion.findUniqueOrThrow({
          where: { code: fixture.toUpperCase() },
        })
      ).usedCount,
    ).toBe(0);
    const persisted = await db.order.findUniqueOrThrow({
      where: { orderCode: order.orderCode },
      include: { refund: true, payments: true },
    });
    expect(persisted).toMatchObject({
      status: 'CANCELLED',
      cancelledById: staffId,
      cancellationReason: 'Khách yêu cầu hủy',
      inventoryRestoreStatus: 'RESTORED',
    });
    expect(persisted.refund).toMatchObject({
      mode: 'SIMULATED',
      status: 'SUCCEEDED',
    });
    expect(Number(persisted.refund!.amount)).toBe(order.totalAmount);
    expect(persisted.payments[0].status).toBe('SUCCEEDED');
    expect(await db.refund.count({ where: { orderId: persisted.id } })).toBe(1);
    await notify(order.orderCode, order.totalAmount).expect(200);
    expect(await balance()).toBe(100);
    const list = await request(app.getHttpServer())
      .get('/staff/orders?status=CANCELLED')
      .auth(staffToken, { type: 'bearer' })
      .expect(200);
    expect(list.body.orders).toContainEqual(
      expect.objectContaining({
        orderCode: order.orderCode,
        refund: expect.objectContaining({
          mode: 'SIMULATED',
          amount: order.totalAmount,
        }),
      }),
    );
    const history = await request(app.getHttpServer())
      .get('/orders/history')
      .auth(customerToken, { type: 'bearer' })
      .expect(200);
    expect(history.body[0]).toMatchObject({
      status: 'CANCELLED',
      pointsRefunded: true,
      pointsReversed: true,
      refund: { amount: order.totalAmount, mode: 'SIMULATED' },
    });
    const status = await request(app.getHttpServer())
      .get(`/payments/status?orderCode=${order.orderCode}`)
      .auth(customerToken, { type: 'bearer' })
      .expect(200);
    expect(status.body).toMatchObject({
      orderStatus: 'CANCELLED',
      refund: { mode: 'SIMULATED', amount: order.totalAmount },
    });
  });

  it('cancels an unpaid order with no refund, then refunds duplicate late captures once', async () => {
    const order = await checkout({ paid: false });
    await cancel(order.orderCode, 'PENDING').expect(200);
    expect(
      await db.refund.count({
        where: { order: { orderCode: order.orderCode } },
      }),
    ).toBe(0);
    expect(await balance()).toBe(100);
    await Promise.all([
      notify(order.orderCode, order.totalAmount).expect(200),
      notify(order.orderCode, order.totalAmount).expect(200),
    ]);
    expect(
      await db.refund.count({
        where: { order: { orderCode: order.orderCode } },
      }),
    ).toBe(1);
    expect(
      (
        await db.order.findUniqueOrThrow({
          where: { orderCode: order.orderCode },
        })
      ).status,
    ).toBe('CANCELLED');
    expect(await balance()).toBe(100);
    expect(await stock()).toBe(20);
    await request(app.getHttpServer())
      .post('/payments')
      .auth(customerToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ orderCode: order.orderCode })
      .expect(400);
  });

  it('serializes cancellation racing a successful payment without reviving the order', async () => {
    const order = await checkout({ paid: false });
    const [cancelResult, ipnResult] = await Promise.all([
      cancel(order.orderCode, 'PENDING'),
      notify(order.orderCode, order.totalAmount),
    ]);
    expect(ipnResult.status).toBe(200);
    expect([200, 409]).toContain(cancelResult.status);
    if (cancelResult.status === 409)
      await cancel(order.orderCode, 'PAID').expect(200);
    expect(await balance()).toBe(100);
    expect(await stock()).toBe(20);
    expect(
      await db.refund.count({
        where: { order: { orderCode: order.orderCode } },
      }),
    ).toBe(1);
  });

  it('returns all redeemed points for a fully points-funded order without making a cash refund', async () => {
    await db.user.update({
      where: { id: fixture },
      data: { loyaltyPoints: 4000 },
    });
    // 25,000 base + 5,000 topping, funded entirely by points.
    const topping = await db.topping.findUniqueOrThrow({
      where: { id: 'white_pearl' },
    });
    const points = (25000 + topping.extraPrice) / 10;
    const order = await checkout({ points });
    expect(order.totalAmount).toBe(0);
    await cancel(order.orderCode).expect(200);
    expect(await balance()).toBe(4000);
    expect(await stock()).toBe(20);
    expect(
      await db.refund.count({
        where: { order: { orderCode: order.orderCode } },
      }),
    ).toBe(0);
  });

  it('keeps a reward debt when earned points have already been spent elsewhere', async () => {
    const order = await checkout({ points: 0 });
    await db.user.update({
      where: { id: fixture },
      data: { loyaltyPoints: 0 },
    });
    await cancel(order.orderCode).expect(200);
    expect(await balance()).toBe(0);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: fixture } })).loyaltyDebt,
    ).toBe(Math.floor(order.totalAmount / 1000));
    await cancel(order.orderCode).expect(200);
    expect(await balance()).toBe(0);
    // A future successful purchase pays the debt before adding spendable points.
    await checkout({ points: 0 });
    expect(await balance()).toBe(0);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: fixture } })).loyaltyDebt,
    ).toBe(0);
  });

  it('requires a reason and rejects stale or forbidden transitions without changing business data', async () => {
    const order = await checkout();
    const patch = (body: object) =>
      request(app.getHttpServer())
        .patch(`/staff/orders/${order.orderCode}/status`)
        .auth(staffToken, { type: 'bearer' })
        .send(body);
    await patch({
      status: 'CANCELLED',
      expectedStatus: 'PAID',
      reason: '  ',
    }).expect(400);
    await patch({ status: 'PAID', expectedStatus: 'PAID' }).expect(400);
    await patch({
      status: 'CANCELLED',
      expectedStatus: 'PENDING',
      reason: 'Hủy đơn',
    }).expect(409);
    await patch({ status: 'PREPARING', expectedStatus: 'PAID' }).expect(200);
    await cancel(order.orderCode, 'PREPARING').expect(400);
    await patch({ status: 'READY', expectedStatus: 'PREPARING' }).expect(200);
    await patch({ status: 'COMPLETED', expectedStatus: 'READY' }).expect(200);
    await cancel(order.orderCode, 'COMPLETED').expect(400);
    expect(await stock()).toBe(19);
    expect(
      await db.refund.count({
        where: { order: { orderCode: order.orderCode } },
      }),
    ).toBe(0);
  });

  it('flags legacy orders for manual inventory review instead of guessing from current recipes', async () => {
    const order = await checkout();
    await db.orderItem.updateMany({
      where: { order: { orderCode: order.orderCode } },
      data: { snapshot: {} },
    });
    await cancel(order.orderCode).expect(200);
    expect(
      (
        await db.order.findUniqueOrThrow({
          where: { orderCode: order.orderCode },
        })
      ).inventoryRestoreStatus,
    ).toBe('NEEDS_REVIEW');
    expect(await stock()).toBe(19);
    expect(
      await db.refund.count({
        where: { order: { orderCode: order.orderCode } },
      }),
    ).toBe(1);
  });

  it('allows only one winner when accepting and cancelling the same paid order concurrently', async () => {
    const order = await checkout();
    const [accepted, cancelled] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/staff/orders/${order.orderCode}/status`)
        .auth(staffToken, { type: 'bearer' })
        .send({ status: 'PREPARING', expectedStatus: 'PAID' }),
      cancel(order.orderCode),
    ]);
    expect([accepted.status, cancelled.status].sort((a, b) => a - b)).toEqual([200, 409]);
    const final = await db.order.findUniqueOrThrow({
      where: { orderCode: order.orderCode },
    });
    if (accepted.status === 200) {
      expect(final.status).toBe('PREPARING');
      expect(await stock()).toBe(19);
      expect(await db.refund.count({ where: { orderId: final.id } })).toBe(0);
    } else {
      expect(final.status).toBe('CANCELLED');
      expect(await stock()).toBe(20);
      expect(await db.refund.count({ where: { orderId: final.id } })).toBe(1);
    }
  });

  it('rolls back cancellation, inventory, points and promotion if refund persistence fails', async () => {
    const order = await checkout({ promotion: true });
    const previousBalance = await balance();
    const service = new OrdersService(
      {
        $transaction: (run: (tx: unknown) => unknown) =>
          db.$transaction(async (tx) =>
            run({
              ...tx,
              refund: {
                ...tx.refund,
                upsert: () => {
                  throw new Error('Refund storage unavailable');
                },
              },
            }),
          ),
      } as unknown as PrismaService,
      app.get(PromotionsService),
    );
    await expect(
      service.updateStatus(order.orderCode, 'CANCELLED'),
    ).rejects.toThrow('Refund storage unavailable');
    expect(
      (
        await db.order.findUniqueOrThrow({
          where: { orderCode: order.orderCode },
        })
      ).status,
    ).toBe('PAID');
    expect(await stock()).toBe(19);
    expect(await balance()).toBe(previousBalance);
    expect(
      (
        await db.promotion.findUniqueOrThrow({
          where: { code: fixture.toUpperCase() },
        })
      ).usedCount,
    ).toBe(1);
  });

  it('validates the transaction and callback secret before settling or refunding a cancelled order', async () => {
    const order = await checkout({ paid: false });
    await cancel(order.orderCode, 'PENDING').expect(200);
    for (const transaction of [
      undefined,
      {
        transaction_status: 'DECLINED',
        transaction_currency: 'VND',
        transaction_amount: String(order.totalAmount),
      },
      {
        transaction_status: 'APPROVED',
        transaction_currency: 'USD',
        transaction_amount: String(order.totalAmount),
      },
      {
        transaction_status: 'APPROVED',
        transaction_currency: 'VND',
        transaction_amount: '1',
      },
    ]) {
      await request(app.getHttpServer())
        .post('/payments/ipn')
        .set('X-Secret-Key', secret)
        .send({ ...payload(order.orderCode, order.totalAmount), transaction })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/payments/ipn')
      .set('X-Secret-Key', 'wrong')
      .send(payload(order.orderCode, order.totalAmount))
      .expect(401);
    expect(
      await db.refund.count({
        where: { order: { orderCode: order.orderCode } },
      }),
    ).toBe(0);
    expect(await balance()).toBe(100);
  });
});
