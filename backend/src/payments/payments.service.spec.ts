import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsService } from './payments.service.js';

describe('SePay checkout signature', () => {
  it('signs and returns fields in the order specified by the checkout API', async () => {
    const merchantSecret = 'test-only-merchant-secret';
    const tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'order-test',
          orderCode: 'ORD-test',
          status: 'PENDING',
          total: 63000,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const service = new PaymentsService(
      {
        $transaction: (run: (client: typeof tx) => unknown) => run(tx),
      } as unknown as PrismaService,
      new ConfigService({
        SEPAY_ENV: 'sandbox',
        SEPAY_MERCHANT_ID: 'SP-TEST-CHECKOUT',
        SEPAY_SECRET_KEY: merchantSecret,
        FRONTEND_URL: 'http://localhost:3000',
      }),
    );

    const result = await service.create(
      { orderCode: 'ORD-test' },
      'user-test',
      'test-key',
    );
    // Independent protocol vector from SePay's form-thanh-toan API documentation.
    // Do not derive this order from the SDK or the fields returned by the service.
    const signedString =
      'order_amount=63000,merchant=SP-TEST-CHECKOUT,currency=VND,operation=PURCHASE,' +
      'order_description=BrewLite ORD-test,order_invoice_number=ORD-test,' +
      'payment_method=BANK_TRANSFER,' +
      'success_url=http://localhost:3000/payment/result?orderCode=ORD-test,' +
      'error_url=http://localhost:3000/payment/result?orderCode=ORD-test,' +
      'cancel_url=http://localhost:3000/payment/result?orderCode=ORD-test';
    const expectedSignature = createHmac('sha256', merchantSecret)
      .update(signedString)
      .digest('base64');

    expect(result.formFields.signature).toBe(expectedSignature);
    expect(Object.keys(result.formFields)).toEqual([
      'order_amount',
      'merchant',
      'currency',
      'operation',
      'order_description',
      'order_invoice_number',
      'payment_method',
      'success_url',
      'error_url',
      'cancel_url',
      'signature',
    ]);
    expect(result.checkoutUrl).toBe(
      'https://pay-sandbox.sepay.vn/v1/checkout/init',
    );
  });
});
