import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

describe('SePay IPN acknowledgement', () => {
  const secret = 'test-ipn-secret';
  const findOrder = vi.fn();
  const updatePayment = vi.fn();
  const updateOrder = vi.fn();
  const transaction = vi.fn();
  let app: INestApplication<App>;

  const notification = {
    notification_type: 'ORDER_PAID',
    order: {
      order_invoice_number: 'ORD-test',
      order_status: 'CAPTURED',
      order_currency: 'VND',
      order_amount: '35000.00',
    },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    findOrder.mockResolvedValue({
      id: 'order-test',
      status: 'PENDING',
      total: 35000,
      payments: [
        { id: 'payment-test', method: 'SEPAY_BANK_TRANSFER', amount: 35000 },
      ],
    });
    updateOrder.mockResolvedValue({ count: 1 });
    transaction.mockImplementation((run: (tx: unknown) => unknown) =>
      run({
        order: { findUnique: findOrder, updateMany: updateOrder },
        payment: { update: updatePayment },
      }),
    );
    const service = new PaymentsService(
      {
        order: { findUnique: findOrder, updateMany: updateOrder },
        payment: { update: updatePayment },
        $transaction: transaction,
      } as unknown as PrismaService,
      new ConfigService({
        SEPAY_ENV: 'sandbox',
        SEPAY_MERCHANT_ID: 'test-merchant',
        SEPAY_SECRET_KEY: 'test-merchant-secret',
        SEPAY_IPN_SECRET_KEY: secret,
      }),
    );
    const module = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: service },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('returns HTTP 200 and saves a valid payment without requiring a user JWT', async () => {
    await request(app.getHttpServer())
      .post('/payments/ipn')
      .set('X-Secret-Key', secret)
      .send(notification)
      .expect(200, { received: true });

    expect(updatePayment).toHaveBeenCalledWith({
      where: { id: 'payment-test' },
      data: { status: 'SUCCEEDED' },
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: 'order-test', status: 'PENDING' },
      data: { status: 'PAID' },
    });
    expect(transaction).toHaveBeenCalledOnce();
  });

  it.each([undefined, 'wrong-secret'])(
    'rejects an invalid IPN secret (%s)',
    async (key) => {
      const call = request(app.getHttpServer()).post('/payments/ipn');
      if (key) call.set('X-Secret-Key', key);
      await call.send(notification).expect(401);
      expect(findOrder).not.toHaveBeenCalled();
      expect(updateOrder).not.toHaveBeenCalled();
    },
  );

  it('acknowledges duplicate notifications without writing the payment again', async () => {
    findOrder.mockResolvedValue({ status: 'PAID', total: 35000 });
    await request(app.getHttpServer())
      .post('/payments/ipn')
      .set('X-Secret-Key', secret)
      .send(notification)
      .expect(200, { received: true, alreadyProcessed: true });
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it('rejects a payment with an amount that does not match the order', async () => {
    await request(app.getHttpServer())
      .post('/payments/ipn')
      .set('X-Secret-Key', secret)
      .send({
        ...notification,
        order: { ...notification.order, order_amount: '1' },
      })
      .expect(400);
    expect(updateOrder).not.toHaveBeenCalled();
    expect(updatePayment).not.toHaveBeenCalled();
  });

  it('acknowledges unrelated notifications without changing an order', async () => {
    await request(app.getHttpServer())
      .post('/payments/ipn')
      .set('X-Secret-Key', secret)
      .send({ notification_type: 'TRANSACTION_VOID' })
      .expect(200, { received: true, ignored: true });
    expect(findOrder).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
