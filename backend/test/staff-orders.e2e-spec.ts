import { randomUUID } from 'node:crypto';
import {
  createTestProduct,
  deleteTestProduct,
  getTestProductInventory,
} from './helpers/ingredient-inventory.js';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';
import { StaffGuard } from '../src/auth/staff.guard.js';
import { OrdersController } from '../src/orders/orders.controller.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { StaffOrdersController } from '../src/orders/staff-orders.controller.js';
import { StaffOrdersService } from '../src/orders/staff-orders.service.js';
import { PaymentsController } from '../src/payments/payments.controller.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PromotionsService } from '../src/promotions/promotions.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  bankNotification,
  mockV2Api,
  v2TestConfig,
} from './sepay-v2.fixture.js';

describe('Staff order permissions and cancellation', () => {
  const db = new PrismaClient();
  let app: INestApplication<App>;
  let customerId: string;
  let staffId: string;
  let baseIngredientId: string;
  let toppingIngredientId: string;
  let token: string;
  let staffToken: string;
  const createdCodes: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'staff-test-only' })],
      controllers: [
        AuthController,
        OrdersController,
        StaffOrdersController,
        PaymentsController,
      ],
      providers: [
        AuthService,
        OrdersService,
        StaffOrdersService,
        StaffGuard,
        PromotionsService,
        PaymentsService,
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: new ConfigService(v2TestConfig) },
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
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    customerId = 'staff-test-' + randomUUID();
    staffId = customerId + '-staff';
    createdCodes.length = 0;
    await db.user.createMany({
      data: [
        {
          id: customerId,
          email: customerId + '@example.invalid',
          passwordHash: 'not-a-login',
          loyaltyPoints: 100,
        },
        {
          id: staffId,
          email: staffId + '@example.invalid',
          passwordHash: 'not-a-login',
          role: 'STAFF',
        },
      ],
    });
    const inventory = await createTestProduct(db, {
      id: customerId,
      name: 'Staff test coffee',
      price: 25000,
      stock: 20,
    });
    baseIngredientId = inventory.baseIngredientId;
    toppingIngredientId = inventory.toppingIngredientId;
    token = app.get(JwtService).sign({ sub: customerId, role: 'ADMIN' });
    staffToken = app.get(JwtService).sign({ sub: staffId });
    mockV2Api(db);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.payment.deleteMany({ where: { orderId: { in: createdCodes } } });
    await db.order.deleteMany({ where: { userId: customerId } });
    await deleteTestProduct(db, customerId, [
      baseIngredientId,
      toppingIngredientId,
    ]);
    await db.user.deleteMany({ where: { id: { in: [customerId, staffId] } } });
  });
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  async function create(paid = false) {
    const result = await request(app.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({
        pointsToRedeem: 20,
        items: [
          { productId: customerId, quantity: 1, sizeId: 'S', toppingIds: [] },
        ],
      })
      .expect(201);
    const code: string = result.body.orderCode;
    createdCodes.push(code);
    if (paid) {
      await request(app.getHttpServer())
        .post('/payments')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .send({ orderCode: code })
        .expect(201);
      await request(app.getHttpServer())
        .post('/payments/webhook')
        .set('Authorization', 'Apikey test-webhook-key')
        .send(await bankNotification(db, code, result.body.totalAmount))
        .expect(200);
    }
    return code;
  }
  const staffCancel = (
    code: string,
    reason: unknown = 'Customer requested before preparation',
    auth = staffToken,
  ) =>
    request(app.getHttpServer())
      .post('/staff/orders/' + code + '/cancel')
      .auth(auth, { type: 'bearer' })
      .send({ reason });
  const customerCancel = (code: string) =>
    request(app.getHttpServer())
      .post('/orders/' + code + '/cancel')
      .auth(token, { type: 'bearer' })
      .send({});
  const advance = (code: string, status: string) =>
    request(app.getHttpServer())
      .patch('/staff/orders/' + code + '/status')
      .auth(staffToken, { type: 'bearer' })
      .send({ status });
  const saved = (code: string) =>
    db.order.findUniqueOrThrow({
      where: { orderCode: code },
      include: { payments: { include: { refund: true } } },
    });
  const refundFor = (code: string) =>
    db.refund.findFirstOrThrow({
      where: { payment: { order: { orderCode: code } } },
    });
  const retry = (code: string, id: string) =>
    request(app.getHttpServer())
      .post('/staff/orders/' + code + '/refunds/' + id + '/retry')
      .auth(staffToken, { type: 'bearer' });

  it('keeps unpaid customer cancellation and records the actual customer actor', async () => {
    const code = await create();
    await customerCancel(code).expect(200);
    expect(await saved(code)).toMatchObject({
      status: 'CANCELLED',
      cancelledById: customerId,
      cancellationActor: 'CUSTOMER',
    });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: customerId } }))
        .loyaltyPoints,
    ).toBe(100);
    expect(
      (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
    ).toBe(20);
  });

  it('rejects direct customer cancellation after payment without changing business state', async () => {
    const code = await create(true);
    await customerCancel(code).expect(403);
    expect((await saved(code)).status).toBe('PAID');
    expect(
      (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
    ).toBe(19);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: customerId } }))
        .loyaltyPoints,
    ).toBe(104);
    expect(
      await db.refund.count({ where: { payment: { orderId: code } } }),
    ).toBe(0);
  });

  it('does not accept a forged STAFF/ADMIN role in a customer JWT', async () => {
    const code = await create(true);
    await request(app.getHttpServer()).get('/staff/orders').expect(401);
    await request(app.getHttpServer())
      .get('/staff/orders')
      .auth(token, { type: 'bearer' })
      .expect(403);
    await staffCancel(code, 'reason', token).expect(403);
    await request(app.getHttpServer())
      .patch('/staff/orders/' + code + '/status')
      .auth(token, { type: 'bearer' })
      .send({ status: 'PREPARING' })
      .expect(403);
  });

  it.each([undefined, '', '   ', null, 'x'.repeat(501)])(
    'requires a nonblank bounded cancellation reason (%j)',
    async (reason) => {
      const code = await create(true);
      await request(app.getHttpServer())
        .post('/staff/orders/' + code + '/cancel')
        .auth(staffToken, { type: 'bearer' })
        .send(reason === undefined ? {} : { reason })
        .expect(400);
      expect((await saved(code)).status).toBe('PAID');
    },
  );

  it('lets staff cancel another customer order once, with an immutable actor and original refund mapping', async () => {
    const code = await create(true);
    const results = await Promise.all([staffCancel(code), staffCancel(code)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const order = await saved(code);
    expect(order).toMatchObject({
      status: 'CANCELLED',
      cancelledById: staffId,
      cancellationActor: 'STAFF',
      cancellationReason: 'Customer requested before preparation',
    });
    expect(order.payments[0].refund).toMatchObject({
      status: 'PENDING',
      method: 'SEPAY_V2',
      transactionId: order.payments[0].providerTransactionId,
    });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: customerId } }))
        .loyaltyPoints,
    ).toBe(100);
    expect(
      (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
    ).toBe(20);
    expect(
      await db.refund.count({ where: { payment: { orderId: code } } }),
    ).toBe(1);
    await request(app.getHttpServer())
      .post('/staff/orders/' + code + '/cancel')
      .auth(staffToken, { type: 'bearer' })
      .send({ reason: 'tampered', cancelledById: customerId })
      .expect(400);
    expect((await saved(code)).cancelledById).toBe(staffId);
  });

  it('lists customer details and filters orders without exposing password hashes', async () => {
    const code = await create(true);
    const list = await request(app.getHttpServer())
      .get('/staff/orders')
      .auth(staffToken, { type: 'bearer' })
      .query({ status: 'PAID', search: customerId })
      .expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.orders[0]).toMatchObject({
      orderCode: code,
      customer: { email: customerId + '@example.invalid' },
      totalAmount: 24800,
    });
    expect(JSON.stringify(list.body)).not.toContain('passwordHash');
    await request(app.getHttpServer())
      .get('/staff/orders')
      .auth(staffToken, { type: 'bearer' })
      .query({ page: -1 })
      .expect(400);
  });

  it('prevents cancellation from PREPARING onward and allows only the preparation/fulfillment sequence', async () => {
    const code = await create(true);
    await advance(code, 'PAID').expect(400);
    await advance(code, 'COMPLETED').expect(400);
    for (const status of ['PREPARING', 'READY', 'COMPLETED']) {
      await advance(code, status).expect(200);
      await staffCancel(code).expect(400);
    }
    expect((await saved(code)).status).toBe('COMPLETED');
    expect(
      await db.refund.count({ where: { payment: { orderId: code } } }),
    ).toBe(0);
  });

  it('serializes staff cancellation against beginning preparation', async () => {
    const code = await create(true);
    const responses = await Promise.all([
      staffCancel(code),
      advance(code, 'PREPARING'),
    ]);
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    const order = await saved(code);
    expect(['CANCELLED', 'PREPARING']).toContain(order.status);
    expect(
      (await getTestProductInventory(db, baseIngredientId)).stock.toNumber(),
    ).toBe(order.status === 'CANCELLED' ? 20 : 19);
  });

  it('honors revoked staff access immediately for an already issued JWT', async () => {
    const code = await create(true);
    await db.user.update({
      where: { id: staffId },
      data: { role: 'CUSTOMER' },
    });
    await staffCancel(code).expect(403);
    await request(app.getHttpServer())
      .get('/staff/orders')
      .auth(staffToken, { type: 'bearer' })
      .expect(403);
    expect((await saved(code)).status).toBe('PAID');
  });

  it('requeues the same reviewed refund once and records the staff actor', async () => {
    const code = await create(true);
    await staffCancel(code).expect(200);
    const refund = await refundFor(code);
    await db.refund.update({
      where: { id: refund.id },
      data: {
        status: 'NEEDS_REVIEW',
        failures: 8,
        lastError: 'network_or_timeout',
      },
    });
    const results = await Promise.all([
      retry(code, refund.id),
      retry(code, refund.id),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(await refundFor(code)).toMatchObject({
      id: refund.id,
      status: 'PENDING',
      transactionId: refund.transactionId,
      bankAccountId: refund.bankAccountId,
      failures: 0,
      lastRetriedById: staffId,
    });
    expect((await refundFor(code)).lastRetriedAt).toBeInstanceOf(Date);
  });

  it('does not requeue pending, failed or legacy refunds and scopes retry to the order', async () => {
    const code = await create(true);
    await staffCancel(code).expect(200);
    const refund = await refundFor(code);
    await retry(code, refund.id).expect(409);
    await retry('different-order', refund.id).expect(404);
    await db.refund.update({
      where: { id: refund.id },
      data: { status: 'FAILED' },
    });
    await retry(code, refund.id).expect(409);
    await db.refund.update({
      where: { id: refund.id },
      data: { status: 'NEEDS_REVIEW', method: 'LEGACY_GATEWAY' },
    });
    await retry(code, refund.id).expect(409);
  });

  it('does not allow a public registration to assign itself a staff role', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'forged-' + customerId + '@example.invalid',
        phone: '0987654321',
        password: 'Test-password-123',
        role: 'STAFF',
      })
      .expect(400);
    expect(
      await db.user.count({
        where: { email: 'forged-' + customerId + '@example.invalid' },
      }),
    ).toBe(0);
  });
});
