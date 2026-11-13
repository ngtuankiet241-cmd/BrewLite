import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsService } from './payments.service.js';

describe('API v2 payment initialization', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('uses API v2 bank details and returns an internal checkout without merchant credentials', async () => {
    const order = {
      id: 'order-test',
      orderCode: 'ORD-test',
      status: 'PENDING',
      total: 63000,
      payments: [],
    };
    const create = vi
      .fn()
      .mockImplementation(({ data }) => ({ id: 'payment-test', ...data }));
    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      idempotencyRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      order: { findFirst: vi.fn().mockResolvedValue(order), update: vi.fn() },
      payment: { create },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        status: 'success',
        data: {
          id: 'bank-test',
          active: 1,
          account_number: '123456',
          account_holder_name: 'TEST',
          bank_code: 'VietinBank',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new PaymentsService(
      {
        order: tx.order,
        $transaction: (run: (client: typeof tx) => unknown) => run(tx),
      } as unknown as PrismaService,
      new ConfigService({
        SEPAY_ENV: 'sandbox',
        SEPAY_API_TOKEN: 'test-token',
        SEPAY_BANK_ACCOUNT_ID: 'bank-test',
        SEPAY_WEBHOOK_API_KEY: 'test-hook',
      }),
    );
    expect(
      await service.create({ orderCode: 'ORD-test' }, 'user-test', 'test-key'),
    ).toMatchObject({
      method: 'SEPAY_API_V2',
      checkoutPath: '/payment/checkout?orderCode=ORD-test',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://userapi-sandbox.sepay.vn/v2/bank-accounts/bank-test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
    const data = create.mock.calls[0][0].data;
    expect(data.transferContent).toMatch(/^BL[A-F0-9]{24}$/);
    const qr = new URL(data.checkoutData.qrUrl);
    expect(qr.searchParams.get('amount')).toBe('63000');
    expect(qr.searchParams.get('des')).toBe(data.transferContent);
    expect(qr.searchParams.get('acc')).toBe('123456');
    expect(data.providerTransactionId).toBeUndefined();
  });
});
