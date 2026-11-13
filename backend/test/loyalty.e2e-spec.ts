import {
  bankNotification,
  mockV2Api,
  v2TestConfig,
} from './sepay-v2.fixture.js';
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
import { StaffOrdersController } from '../src/orders/staff-orders.controller.js';
import { StaffOrdersService } from '../src/orders/staff-orders.service.js';
import { StaffGuard } from '../src/auth/staff.guard.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PaymentsController } from '../src/payments/payments.controller.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PromotionsService } from '../src/promotions/promotions.service.js';
import {
  createTestProduct,
  deleteTestProduct,
  getTestProductInventory,
} from './helpers/ingredient-inventory.js';
import { RefundsWorker } from '../src/payments/refunds.worker.js';
import { SePayRefundClient } from '../src/payments/sepay-refund.client.js';
import { vi } from 'vitest';

describe('Loyalty points persisted in PostgreSQL', () => {
  const db = new PrismaClient();
  const ipnSecret = 'local-loyalty-test-ipn';
  let app: INestApplication<App>;
  let fixture: string;
  let baseIngredientId: string;
  let toppingIngredientId: string;
  let token: string;
  let staffToken: string;
  let staffId: string;

  beforeAll(async () => {
    // Use fake payment credentials and local HTTP only. No request is sent to SePay.
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'local-loyalty-test-jwt' })],
      controllers: [
        AuthController,
        OrdersController,
        PaymentsController,
        StaffOrdersController,
      ],
      providers: [
        AuthService,
        OrdersService,
        StaffOrdersService,
        StaffGuard,
        PromotionsService,
        JwtAuthGuard,
        { provide: PrismaService, useValue: db },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            ...v2TestConfig,
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
    mockV2Api(db);
    fixture = `loyalty-test-${randomUUID()}`;
    await db.user.create({
      data: {
        id: fixture,
        email: `${fixture}@example.invalid`,
        passwordHash: 'not-a-login',
        loyaltyPoints: 100,
      },
    });
    const inventory = await createTestProduct(db, {
      id: fixture,
      name: 'Loyalty fixture',
      price: 25000,
      stock: 20,
    });
    baseIngredientId = inventory.baseIngredientId;
    toppingIngredientId = inventory.toppingIngredientId;
    token = app.get(JwtService).sign({ sub: fixture });
    staffId = fixture + '-staff';
    await db.user.create({
      data: {
        id: staffId,
        email: staffId + '@example.invalid',
        passwordHash: 'not-a-login',
        role: 'STAFF',
      },
    });
    staffToken = app.get(JwtService).sign({ sub: staffId });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { order: { userId: fixture } } });
      await tx.order.deleteMany({ where: { userId: fixture } });
      await tx.promotion.deleteMany({ where: { code: fixture.toUpperCase() } });
      await tx.user.deleteMany({ where: { id: { in: [fixture, staffId] } } });
    });
    await deleteTestProduct(db, fixture, [
      baseIngredientId,
      toppingIngredientId,
    ]);
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
  const notify = async (orderCode: string, amount: number, status = 200) => {
    const payload = await bankNotification(db, orderCode, amount);
    return request(app.getHttpServer())
      .post('/payments/webhook')
      .set('Authorization', 'Apikey test-webhook-key')
      .send(payload)
      .expect(status);
  };

  async function checkout(points = 20, extra = {}) {
    const { body } = await create(points, extra).expect(201);
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
    await notify(order.orderCode, 24800);
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
    await notify(order.orderCode, 24800);
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
      (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
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
      (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
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

  it('returns reserved points once and refunds money arriving after cancellation without reopening the order', async () => {
    const order = await checkout();
    await app.get(OrdersService).updateStatus(order.orderCode, 'CANCELLED');
    expect(await balance()).toBe(100);
    await expect(
      app.get(OrdersService).updateStatus(order.orderCode, 'CANCELLED'),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(await balance()).toBe(100);
    await notify(order.orderCode, 24800);
    await notify(order.orderCode, 24800);
    expect(await balance()).toBe(100);
    expect(
      await db.refund.count({
        where: { payment: { orderId: order.orderCode } },
      }),
    ).toBe(1);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.orderCode } }))
        .status,
    ).toBe('CANCELLED');
  });

  const cancel = (
    orderCode: string,
    body: Record<string, unknown> = { reason: 'Test cancellation' },
    auth = staffToken,
  ) =>
    request(app.getHttpServer())
      .post(`/staff/orders/${orderCode}/cancel`)
      .auth(auth, { type: 'bearer' })
      .send(body);

  it('cancels a paid order atomically, restores inventory/promotion/points and queues only the actual money paid', async () => {
    await db.productRecipeIngredient.updateMany({
      where: { productId: fixture },
      data: { quantity: 1.25 },
    });
    await db.toppingRecipeIngredient.updateMany({
      where: { ingredientId: toppingIngredientId },
      data: { quantity: 0.5 },
    });
    await db.promotion.create({
      data: {
        code: fixture.toUpperCase(),
        discountType: 'PERCENTAGE',
        value: 10,
        startsAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const order = await checkout(20, {
      promotionCode: fixture.toUpperCase(),
      items: [
        ...items(),
        {
          productId: fixture,
          quantity: 2,
          sizeId: 'M',
          toppingIds: ['cheese'],
        },
      ],
    });
    expect(
      (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
    ).toBe(16.25);
    expect(
      (await getTestProductInventory(db, toppingIngredientId)).stock.toNumber(),
    ).toBe(9999);
    // Recipe edits after checkout must not change the quantities restored.
    await db.productRecipeIngredient.updateMany({
      where: { productId: fixture },
      data: { quantity: 25 },
    });
    await db.toppingRecipeIngredient.updateMany({
      where: { ingredientId: toppingIngredientId },
      data: { quantity: 50 },
    });
    await notify(order.orderCode, order.totalAmount);
    const { body } = await cancel(order.orderCode, {
      reason: 'Đổi kế hoạch',
    }).expect(200);
    expect(body).toMatchObject({
      status: 'CANCELLED',
      refundStatus: 'PENDING',
      refundAmount: order.totalAmount,
    });
    expect(await balance()).toBe(100);
    expect(
      (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
    ).toBe(20);
    expect(
      (
        await db.promotion.findUniqueOrThrow({
          where: { code: fixture.toUpperCase() },
        })
      ).usedCount,
    ).toBe(0);
    const saved = await db.order.findUniqueOrThrow({
      where: { id: order.orderCode },
      include: { payments: { include: { refund: true } } },
    });
    expect(saved.cancelledAt).toBeInstanceOf(Date);
    expect(saved.pointsReversedAt).toBeInstanceOf(Date);
    expect(saved.pointsRefundedAt).toBeInstanceOf(Date);
    expect(
      (await getTestProductInventory(db, toppingIngredientId)).stock.toNumber(),
    ).toBe(10000);
    expect(saved.cancellationReason).toBe('Đổi kế hoạch');
    expect(saved.payments[0].status).toBe('REFUND_PENDING');
    expect(Number(saved.payments[0].refund?.amount)).toBe(order.totalAmount);
    await Promise.all([
      cancel(order.orderCode).expect(200),
      cancel(order.orderCode).expect(200),
    ]);
    expect(await balance()).toBe(100);
    expect(
      (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
    ).toBe(20);
    expect(
      (await getTestProductInventory(db, baseIngredientId)).stockVersion,
    ).toBe(2);
    expect(
      (await getTestProductInventory(db, toppingIngredientId)).stock.toNumber(),
    ).toBe(10000);
    expect(
      await db.refund.count({ where: { paymentId: saved.payments[0].id } }),
    ).toBe(1);
    const history = await request(app.getHttpServer())
      .get('/orders/history')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(history.body[0]).toMatchObject({
      pointsReversed: true,
      pointsRefunded: true,
      refundStatus: 'PENDING',
    });
  });

  it('serializes simultaneous first cancellation requests', async () => {
    const order = await checkout();
    await notify(order.orderCode, order.totalAmount);
    await Promise.all([
      cancel(order.orderCode).expect(200),
      cancel(order.orderCode).expect(200),
    ]);
    expect(await balance()).toBe(100);
    expect(
      (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
    ).toBe(20);
    expect(
      await db.refund.count({
        where: { payment: { orderId: order.orderCode } },
      }),
    ).toBe(1);
  });

  it('rejects unauthenticated, foreign-owner and malformed cancellation requests', async () => {
    const order = await checkout();
    await request(app.getHttpServer())
      .post(`/orders/${order.orderCode}/cancel`)
      .send({})
      .expect(401);
    const foreign = app.get(JwtService).sign({ sub: `${fixture}-other` });
    await cancel(order.orderCode, {}, foreign).expect(403);
    await cancel(order.orderCode, { reason: null }).expect(400);
    await cancel(order.orderCode, { reason: 'x'.repeat(501) }).expect(400);
    await cancel(order.orderCode, { userId: fixture }).expect(400);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.orderCode } }))
        .status,
    ).toBe('PENDING');
  });

  it.each(['PREPARING', 'READY', 'COMPLETED'])(
    'rejects cancellation of a %s order without changing balances',
    async (status) => {
      const order = await checkout();
      await notify(order.orderCode, order.totalAmount);
      await db.order.update({
        where: { id: order.orderCode },
        data: { status },
      });
      await cancel(order.orderCode).expect(400);
      expect(await balance()).toBe(104);
      expect(
        (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
      ).toBe(19);
      expect(
        await db.refund.count({
          where: { payment: { orderId: order.orderCode } },
        }),
      ).toBe(0);
    },
  );

  it('cancels an order covered entirely by points locally without a cash refund', async () => {
    await db.user.update({
      where: { id: fixture },
      data: { loyaltyPoints: 2500 },
    });
    const { body } = await create(2500).expect(201);
    await cancel(body.orderCode)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          refundStatus: 'SUCCEEDED',
          refundAmount: 0,
        });
      });
    expect(await balance()).toBe(2500);
    const refund = await db.refund.findFirstOrThrow({
      where: { payment: { orderId: body.orderCode } },
    });
    expect(refund).toMatchObject({
      method: 'LOCAL',
      status: 'SUCCEEDED',
      transactionId: null,
    });
  });

  it('records already-spent rewards as debt and nets later awards and returned points against it', async () => {
    const first = await checkout(0);
    await notify(first.orderCode, first.totalAmount);
    const { body: second } = await create(125).expect(201);
    expect(await balance()).toBe(0);
    await cancel(first.orderCode).expect(200);
    expect(
      await db.user.findUniqueOrThrow({ where: { id: fixture } }),
    ).toMatchObject({ loyaltyPoints: 0, loyaltyDebt: 25 });
    const third = await checkout(0);
    await notify(third.orderCode, third.totalAmount);
    expect(
      await db.user.findUniqueOrThrow({ where: { id: fixture } }),
    ).toMatchObject({ loyaltyPoints: 0, loyaltyDebt: 0 });
    await cancel(second.orderCode).expect(200);
    expect(await balance()).toBe(125);
  });

  it('keeps cancellation terminal when capture races with cancellation', async () => {
    const order = await checkout();
    await Promise.all([
      notify(order.orderCode, order.totalAmount),
      cancel(order.orderCode).expect(200),
    ]);
    expect(await balance()).toBe(100);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.orderCode } }))
        .status,
    ).toBe('CANCELLED');
    expect(
      await db.refund.count({
        where: { payment: { orderId: order.orderCode } },
      }),
    ).toBe(1);
  });

  it('lets only cancellation or preparation win their race', async () => {
    const order = await checkout();
    await notify(order.orderCode, order.totalAmount);
    await Promise.allSettled([
      app
        .get(OrdersService)
        .cancelForStaff(order.orderCode, staffId, 'Test cancellation'),
      app.get(OrdersService).updateStatus(order.orderCode, 'PREPARING'),
    ]);
    const saved = await db.order.findUniqueOrThrow({
      where: { id: order.orderCode },
    });
    expect(['CANCELLED', 'PREPARING']).toContain(saved.status);
    const cancelled = saved.status === 'CANCELLED';
    expect(await balance()).toBe(cancelled ? 100 : 104);
    expect(
      (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
    ).toBe(cancelled ? 20 : 19);
    expect(
      await db.refund.count({
        where: { payment: { orderId: order.orderCode } },
      }),
    ).toBe(cancelled ? 1 : 0);
  });

  it('rolls back the entire cancellation when a downstream write fails', async () => {
    const order = await checkout();
    await notify(order.orderCode, order.totalAmount);
    const failing = db.$extends({
      query: {
        refund: {
          upsert() {
            throw new Error('refund storage unavailable');
          },
        },
      },
    });
    const service = new OrdersService(
      failing as unknown as PrismaService,
      app.get(PromotionsService),
    );
    await expect(
      service.cancelForStaff(order.orderCode, staffId, 'Test cancellation'),
    ).rejects.toThrow('refund storage unavailable');
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.orderCode } }))
        .status,
    ).toBe('PAID');
    expect(await balance()).toBe(104);
    expect(
      (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
    ).toBe(19);
  });

  function refundWorker() {
    return new RefundsWorker(
      db as PrismaService,
      new SePayRefundClient(
        new ConfigService({
          ...v2TestConfig,
        }),
      ),
    );
  }

  it('automatically submits and reconciles a Sandbox refund, preserving idempotency after a lost response', async () => {
    const order = await checkout();
    await notify(order.orderCode, order.totalAmount);
    await cancel(order.orderCode).expect(200);
    const captured = await db.payment.findFirstOrThrow({
      where: { orderId: order.orderCode },
    });
    let submits = 0;
    const keys: string[] = [];
    const gateway = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toMatch(/^https:\/\/userapi-sandbox\.sepay\.vn\/v2\//);
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer fake-v2-token',
      );
      if (url.includes('/transactions?'))
        return Response.json({
          status: 'success',
          data: [
            {
              id: fixture,
              bank_account_id: fixture,
              transfer_type: 'in',
              amount_in: order.totalAmount,
              amount_out: 0,
              code: order.orderCode,
            },
          ],
          meta: { pagination: { has_more: false } },
        });
      if (init.method === 'POST') {
        keys.push(
          (init.headers as Record<string, string>)['X-Idempotency-Key'],
        );
        expect(JSON.parse(init.body as string)).toEqual({
          refund_amount: order.totalAmount,
        });
        if (++submits === 1) throw new Error('response lost after capture');
      }
      return Response.json({
        status: 'success',
        data: {
          refund_id: `RF-${fixture}`,
          transaction_id: captured.providerTransactionId,
          amount: order.totalAmount,
          currency: 'VND',
          status: init.method === 'POST' ? 'pending' : 'succeeded',
        },
      });
    });
    vi.stubGlobal('fetch', gateway);
    await refundWorker().processNext();
    let refund = await db.refund.findFirstOrThrow({
      where: { payment: { orderId: order.orderCode } },
    });
    expect(refund).toMatchObject({
      status: 'PENDING',
      transactionId: captured.providerTransactionId,
      providerRefundId: null,
    });
    await db.refund.update({
      where: { id: refund.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await Promise.all([
      refundWorker().processNext(),
      refundWorker().processNext(),
    ]);
    expect(keys).toEqual([
      `brewlite-refund:${refund.id}`,
      `brewlite-refund:${refund.id}`,
    ]);
    refund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(refund.status).toBe('PENDING');
    expect(refund.providerRefundId).toBe(`RF-${fixture}`);
    await db.refund.update({
      where: { id: refund.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await refundWorker().processNext();
    expect(
      (await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status,
    ).toBe('SUCCEEDED');
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: refund.paymentId } }))
        .status,
    ).toBe('REFUNDED');
    await notify(order.orderCode, order.totalAmount);
    expect(await balance()).toBe(100);
  });

  it.each(['failed', 'wrong-amount', 'unsupported-bank'])(
    'preserves the refund obligation when SePay returns %s',
    async (scenario) => {
      const order = await checkout();
      await notify(order.orderCode, order.totalAmount);
      await cancel(order.orderCode).expect(200);
      const refund = await db.refund.findFirstOrThrow({
        where: { payment: { orderId: order.orderCode } },
      });
      const captured = await db.payment.findUniqueOrThrow({
        where: { id: refund.paymentId },
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          scenario === 'unsupported-bank'
            ? Response.json({ error_code: 'unsupported_bank' }, { status: 422 })
            : Response.json({
                status: 'success',
                data: {
                  refund_id: `RF-${fixture}`,
                  transaction_id: captured.providerTransactionId,
                  amount: scenario === 'wrong-amount' ? 1 : order.totalAmount,
                  currency: 'VND',
                  status: scenario === 'failed' ? 'failed' : 'succeeded',
                },
              }),
        ),
      );
      await refundWorker().processNext();
      const saved = await db.refund.findUniqueOrThrow({
        where: { id: refund.id },
      });
      expect(saved.status).toBe(
        scenario === 'failed' ? 'FAILED' : 'NEEDS_REVIEW',
      );
      expect(saved.completedAt).toBeNull();
      expect(
        (
          await db.payment.findUniqueOrThrow({
            where: { id: refund.paymentId },
          })
        ).status,
      ).not.toBe('REFUNDED');
      expect(await refundWorker().processNext()).toBe(false);
      await cancel(order.orderCode)
        .expect(200)
        .expect(({ body }) => expect(body.refundStatus).toBe('NEEDS_REVIEW'));
      expect(await balance()).toBe(100);
    },
  );

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
    await notify(order.orderCode, 1, 400);
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
