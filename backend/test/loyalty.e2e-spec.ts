import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { OrdersController } from '../src/orders/orders.controller.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PaymentsController } from '../src/payments/payments.controller.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PromotionsService } from '../src/promotions/promotions.service.js';

describe('Loyalty points persisted in PostgreSQL', () => {
  const db = new PrismaClient();
  const ipnSecret = 'local-loyalty-test-ipn';
  let app: INestApplication<App>;
  let fixture: string;
  let token: string;

  beforeAll(async () => {
    // Use fake payment credentials and local HTTP only. No request is sent to SePay.
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'local-loyalty-test-jwt' })],
      controllers: [AuthController, OrdersController, PaymentsController],
      providers: [
        AuthService,
        OrdersService,
        PromotionsService,
        JwtAuthGuard,
        { provide: PrismaService, useValue: db },
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
        PaymentsService,
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
    fixture = `loyalty-test-${randomUUID()}`;
    await db.user.create({
      data: {
        id: fixture,
        email: `${fixture}@example.invalid`,
        passwordHash: 'not-a-login',
        loyaltyPoints: 100,
      },
    });
    await db.product.create({
      data: { id: fixture, name: 'Loyalty fixture', price: 25000, stock: 20 },
    });
    token = app.get(JwtService).sign({ sub: fixture });
  });

  afterEach(async () => {
    await db.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { order: { userId: fixture } } });
      await tx.order.deleteMany({ where: { userId: fixture } });
      await tx.promotion.deleteMany({ where: { code: fixture.toUpperCase() } });
      await tx.product.deleteMany({ where: { id: fixture } });
      await tx.user.deleteMany({ where: { id: fixture } });
    });
  });

  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });

  const items = () => [
    { productId: fixture, quantity: 1, sizeId: 'S', toppingIds: [] },
  ];
  const balance = async () =>
    (await db.user.findUniqueOrThrow({ where: { id: fixture } })).loyaltyPoints;
  const create = (pointsToRedeem: number, extra = {}) =>
    request(app.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({ items: items(), pointsToRedeem, ...extra });
  const notify = (orderCode: string, amount: number) =>
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
        transaction: {
          transaction_status: 'APPROVED',
          transaction_currency: 'VND',
          transaction_amount: String(amount),
        },
      });
  async function checkout(points = 20) {
    const { body } = await create(points).expect(201);
    await request(app.getHttpServer())
      .post('/payments')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ orderCode: body.orderCode })
      .expect(201);
    return body as { orderCode: string; totalAmount: number };
  }

  it('deducts redeemed points, then awards points on the actual amount paid and refreshes the profile', async () => {
    const order = await checkout();
    expect(order.totalAmount).toBe(24800);
    expect(await balance()).toBe(80);
    await notify(order.orderCode, 24800).expect(200);
    expect(await balance()).toBe(104);
    const saved = await db.order.findUniqueOrThrow({
      where: { orderCode: order.orderCode },
    });
    expect(saved).toMatchObject({
      status: 'PAID',
      pointsRedeemed: 20,
      pointsEarned: 24,
    });
    expect(Number(saved.pointsDiscount)).toBe(200);
    expect(saved.pointsAwardedAt).toBeInstanceOf(Date);
    const { body } = await request(app.getHttpServer())
      .get('/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(body).toMatchObject({
      loyaltyPoints: 104,
      loyaltyPolicy: { spendPerPoint: 1000, pointValue: 10 },
    });
    expect(body.passwordHash).toBeUndefined();
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('credits an order once when two successful callbacks arrive together or are replayed later', async () => {
    const order = await checkout();
    const responses = await Promise.all([
      notify(order.orderCode, 24800),
      notify(order.orderCode, 24800),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await balance()).toBe(104);
    await app.get(OrdersService).updateStatus(order.orderCode, 'PREPARING');
    await notify(order.orderCode, 24800).expect(200, {
      received: true,
      alreadyProcessed: true,
    });
    expect(await balance()).toBe(104);
    expect(
      (
        await db.order.findUniqueOrThrow({
          where: { orderCode: order.orderCode },
        })
      ).status,
    ).toBe('PREPARING');
  });

  it('rolls back stock, promotion usage and points when the balance is insufficient', async () => {
    await db.promotion.create({
      data: {
        code: fixture.toUpperCase(),
        discountType: 'PERCENTAGE',
        value: 10,
        startsAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await create(101, { promotionCode: fixture.toUpperCase() }).expect(400);
    expect(await balance()).toBe(100);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: fixture } })).stock,
    ).toBe(20);
    expect(
      (
        await db.promotion.findUniqueOrThrow({
          where: { code: fixture.toUpperCase() },
        })
      ).usedCount,
    ).toBe(0);
    expect(await db.order.count({ where: { userId: fixture } })).toBe(0);
  });

  it('prevents two concurrent orders from spending the same points', async () => {
    const results = await Promise.all([create(80), create(80)]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 400,
    ]);
    expect(await balance()).toBe(20);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: fixture } })).stock,
    ).toBe(19);
  });

  it('applies a promotion before the points discount', async () => {
    await db.promotion.create({
      data: {
        code: fixture.toUpperCase(),
        discountType: 'PERCENTAGE',
        value: 10,
        startsAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const { body } = await create(20, {
      promotionCode: fixture.toUpperCase(),
    }).expect(201);
    expect(body).toMatchObject({
      subtotalAmount: 25000,
      discountAmount: 2500,
      pointsDiscount: 200,
      totalAmount: 22300,
    });
  });

  it('completes an order paid entirely with points without sending a zero-amount checkout to a gateway', async () => {
    await db.user.update({
      where: { id: fixture },
      data: { loyaltyPoints: 3000 },
    });
    const { body } = await create(2500).expect(201);
    expect(body).toMatchObject({
      status: 'PAID',
      totalAmount: 0,
      pointsRedeemed: 2500,
      pointsEarned: 0,
    });
    expect(await balance()).toBe(500);
    const status = await request(app.getHttpServer())
      .get('/payments/status')
      .query({ orderCode: body.orderCode })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(status.body).toMatchObject({
      orderStatus: 'PAID',
      paymentStatus: 'SUCCEEDED',
      pointsEarned: 0,
    });
  });

  it('returns reserved points once when an unpaid order is cancelled and rejects a late payment callback', async () => {
    const order = await checkout();
    await app.get(OrdersService).updateStatus(order.orderCode, 'CANCELLED');
    expect(await balance()).toBe(100);
    await expect(
      app.get(OrdersService).updateStatus(order.orderCode, 'CANCELLED'),
    ).rejects.toThrow();
    expect(await balance()).toBe(100);
    await notify(order.orderCode, 24800).expect(400);
    expect(await balance()).toBe(100);
  });

  it('awards points through the order status transition service as well', async () => {
    const { body } = await create(0).expect(201);
    await app.get(OrdersService).updateStatus(body.orderCode, 'PAID');
    expect(await balance()).toBe(125);
    await expect(
      app.get(OrdersService).updateStatus(body.orderCode, 'PAID'),
    ).rejects.toThrow();
    expect(await balance()).toBe(125);
  });

  it('does not award points for a failed amount validation', async () => {
    const order = await checkout();
    await notify(order.orderCode, 1).expect(400);
    expect(await balance()).toBe(80);
    expect(
      (
        await db.order.findUniqueOrThrow({
          where: { orderCode: order.orderCode },
        })
      ).pointsAwardedAt,
    ).toBeNull();
  });
});
