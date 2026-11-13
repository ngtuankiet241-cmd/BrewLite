import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { vi } from 'vitest';

export const testBank = {
  id: 'test-v2-bank',
  account_number: '123456789',
  account_holder_name: 'SANDBOX TEST',
  bank_code: 'VietinBank',
  bank_full_name: 'VietinBank Sandbox',
  active: 1,
};
export const v2TestConfig = {
  SEPAY_ENV: 'sandbox',
  SEPAY_API_TOKEN: 'fake-v2-token',
  SEPAY_BANK_ACCOUNT_ID: testBank.id,
  SEPAY_WEBHOOK_API_KEY: 'test-webhook-key',
};

export function mockV2Api(db: PrismaClient) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin !== 'https://userapi-sandbox.sepay.vn')
      throw new Error('Unexpected external request in test');
    if (url.pathname === `/v2/bank-accounts/${testBank.id}`)
      return Response.json({ status: 'success', data: testBank });
    if (url.pathname === '/v2/transactions') {
      const payment = await db.payment.findUnique({
        where: { transferContent: url.searchParams.get('q') ?? '' },
      });
      return Response.json({
        status: 'success',
        data: payment
          ? [
              {
                id: `v2-${payment.id}`,
                bank_account_id: testBank.id,
                transfer_type: 'in',
                amount_in: Number(payment.amount),
                amount_out: 0,
                code: null,
                transaction_content: payment.transferContent,
                reference_number: `SB-${payment.id}`,
              },
            ]
          : [],
        meta: { pagination: { has_more: false } },
      });
    }
    throw new Error(`Unexpected SePay endpoint: ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export async function bankNotification(
  db: PrismaClient,
  orderCode: string,
  amount: number,
) {
  const payment = await db.payment.findFirstOrThrow({
    where: { order: { orderCode }, method: 'SEPAY_API_V2' },
  });
  return {
    id: parseInt(
      createHash('sha256').update(payment.id).digest('hex').slice(0, 12),
      16,
    ),
    accountNumber: testBank.account_number,
    transferType: 'in',
    transferAmount: amount,
    content: payment.transferContent,
    code: null,
    referenceCode: `SB-${payment.id}`,
  };
}
