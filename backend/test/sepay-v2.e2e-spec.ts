import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { PaymentsController } from '../src/payments/payments.controller.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  bankNotification,
  mockV2Api,
  testBank,
  v2TestConfig,
} from './sepay-v2.fixture.js';

describe('API v2 checkout and bank webhook', () => {
  const db = new PrismaClient();
  let app: INestApplication<App>;
  let id: string;
  let token: string;
  let fetchMock: ReturnType<typeof mockV2Api>;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'v2-tests-only' })],
      controllers: [PaymentsController],
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: db },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            ...v2TestConfig,
            SEPAY_IPN_SECRET_KEY: 'legacy-secret',
          }),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(async () => {
    id = `v2-test-${randomUUID()}`;
    await db.user.create({
      data: { id, email: `${id}@example.invalid`, passwordHash: 'not-a-login' },
    });
    await db.order.create({
      data: { id, orderCode: id, userId: id, total: 25000, status: 'PENDING' },
    });
    token = app.get(JwtService).sign({ sub: id });
    fetchMock = mockV2Api(db);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.payment.deleteMany({ where: { orderId: id } });
    await db.order.delete({ where: { id } });
    await db.user.delete({ where: { id } });
  });
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });
  const create = () =>
    request(app.getHttpServer())
      .post('/payments')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ orderCode: id });
  const hook = (body: object, key = 'test-webhook-key') =>
    request(app.getHttpServer())
      .post('/payments/webhook')
      .set('Authorization', `Apikey ${key}`)
      .send(body);

  it('creates one reference for concurrent payment requests and exposes instructions only to its owner', async () => {
    const responses = await Promise.all([create(), create()]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(await db.payment.count({ where: { orderId: id } })).toBe(1);
    const checkout = await request(app.getHttpServer())
      .get('/payments/checkout')
      .query({ orderCode: id })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(checkout.body.instructions).toMatchObject({
      amount: 25000,
      accountNumber: testBank.account_number,
      environment: 'sandbox',
    });
    expect(JSON.stringify(checkout.body)).not.toContain(
      v2TestConfig.SEPAY_API_TOKEN,
    );
    await request(app.getHttpServer())
      .get('/payments/checkout')
      .query({ orderCode: id })
      .expect(401);
    const stranger = app.get(JwtService).sign({ sub: 'someone-else' });
    await request(app.getHttpServer())
      .get('/payments/checkout')
      .query({ orderCode: id })
      .auth(stranger, { type: 'bearer' })
      .expect(404);
  });

  it('rejects forged webhook credentials without querying the provider or settling the order', async () => {
    await create().expect(201);
    const calls = fetchMock.mock.calls.length;
    await hook(await bankNotification(db, id, 25000), 'wrong').expect(401);
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe(
      'PENDING',
    );
  });

  it.each([{ transferAmount: 24000 }, { accountNumber: 'other' }])(
    'rejects wrong amount/account (%j)',
    async (patch) => {
      await create().expect(201);
      await hook({
        ...(await bankNotification(db, id, 25000)),
        ...patch,
      }).expect(400);
      expect(
        (await db.payment.findFirstOrThrow({ where: { orderId: id } }))
          .providerTransactionId,
      ).toBeNull();
    },
  );

  it('ignores outgoing and unrelated transfers', async () => {
    await create().expect(201);
    const body = await bankNotification(db, id, 25000);
    await hook({ ...body, transferType: 'out' }).expect(200, { success: true });
    await hook({ ...body, content: 'another purchase', code: null }).expect(
      200,
      { success: true },
    );
    expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe(
      'PENDING',
    );
  });

  it('requires API v2 evidence even when webhook credentials and payload look valid', async () => {
    await create().expect(201);
    const body = await bankNotification(db, id, 25000);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        status: 'success',
        data: [],
        meta: { pagination: { has_more: false } },
      }),
    );
    await hook(body).expect(503);
    expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe(
      'PENDING',
    );
    await hook(body).expect(200, { success: true });
    const payment = await db.payment.findFirstOrThrow({
      where: { orderId: id },
    });
    expect(payment.providerTransactionId).toBe(`v2-${payment.id}`);
    expect(payment.providerWebhookId).toBe(String(body.id));
    const calls = fetchMock.mock.calls.length;
    await hook(body).expect(200, { success: true });
    expect(fetchMock.mock.calls.length).toBe(calls);
    const checkout = await request(app.getHttpServer())
      .get('/payments/checkout')
      .query({ orderCode: id })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(checkout.body.instructions).toBeNull();
  });

  it('rejects legacy Gateway IPNs for a new API v2 payment', async () => {
    await create().expect(201);
    await request(app.getHttpServer())
      .post('/payments/ipn')
      .set('X-Secret-Key', 'legacy-secret')
      .send({
        notification_type: 'ORDER_PAID',
        order: {
          order_invoice_number: id,
          order_status: 'CAPTURED',
          order_currency: 'VND',
          order_amount: 25000,
        },
      })
      .expect(400);
    expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe(
      'PENDING',
    );
  });

  it('does not migrate an existing Gateway payment or replay its old form as v2 checkout', async () => {
    await db.payment.create({
      data: {
        orderId: id,
        method: 'SEPAY_BANK_TRANSFER',
        amount: 25000,
        idempotencyKey: `sepay:${id}`,
      },
    });
    await db.idempotencyRequest.create({
      data: {
        userId: id,
        operation: 'payments.create',
        key: 'old-key',
        requestHash: '0'.repeat(64),
        response: JSON.stringify({
          checkoutUrl: 'https://pay-sandbox.sepay.vn',
          formFields: {},
        }),
      },
    });
    await request(app.getHttpServer())
      .post('/payments')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', 'old-key')
      .send({ orderCode: id })
      .expect(409);
    expect(await db.payment.count({ where: { orderId: id } })).toBe(1);
  });
});
