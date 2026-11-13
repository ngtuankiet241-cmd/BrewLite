import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import { SePayRefundClient } from './sepay-refund.client.js';

describe('SePay API v2 refund protocol', () => {
  const client = new SePayRefundClient(
    new ConfigService({
      SEPAY_ENV: 'sandbox',
      SEPAY_REFUND_API_TOKEN: 'test-token',
      SEPAY_REFUND_BANK_ACCOUNT_ID: 'bank-1',
    }),
  );
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  const original = {
    id: 'tx-1',
    bank_account_id: 'bank-1',
    transfer_type: 'in',
    amount_in: 24800,
    amount_out: 0,
    transaction_content: 'Thanh toan ORD-abc',
  };
  const refund = {
    refund_id: 'RF-1',
    transaction_id: 'tx-1',
    amount: 24800,
    currency: 'VND',
    status: 'succeeded',
  };
  const transactions = (rows: unknown[]) =>
    Response.json({
      status: 'success',
      data: rows,
      meta: { pagination: { has_more: false } },
    });

  it('resolves an exact reference and rejects fuzzy matches despite the search result', async () => {
    fetchMock.mockResolvedValueOnce(
      transactions([
        original,
        { ...original, id: 'tx-wrong', transaction_content: 'ORD-abcd' },
      ]),
    );
    expect(await client.resolveTransaction('ORD-abc', null, 24800)).toEqual({
      transactionId: 'tx-1',
      bankAccountId: 'bank-1',
    });
  });
  it.each([
    { bank_account_id: 'bank-2' },
    { amount_in: 25000 },
    { transfer_type: 'out' },
    { amount_out: 1 },
  ])('refuses a mismatched original transaction (%j)', async (patch) => {
    fetchMock.mockResolvedValueOnce(transactions([{ ...original, ...patch }]));
    await expect(
      client.resolveTransaction('ORD-abc', null, 24800),
    ).rejects.toMatchObject({ code: 'original_transaction_not_found' });
  });
  it('refuses ambiguous matches without initiating a refund', async () => {
    fetchMock.mockResolvedValueOnce(
      transactions([original, { ...original, id: 'tx-2' }]),
    );
    await expect(
      client.resolveTransaction('ORD-abc', null, 24800),
    ).rejects.toMatchObject({
      code: 'ambiguous_original_transaction',
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('sends a stable idempotency key and the exact paid amount to the Sandbox endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ status: 'success', data: refund }),
    );
    expect(await client.submit('tx-1', 'local-refund-1', 24800)).toEqual({
      providerRefundId: 'RF-1',
      status: 'SUCCEEDED',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://userapi-sandbox.sepay.vn/v2/transactions/tx-1/refund',
    );
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'X-Idempotency-Key': 'brewlite-refund:local-refund-1',
    });
    expect(JSON.parse(init.body)).toEqual({ refund_amount: 24800 });
  });
  it.each([
    { amount: 1 },
    { transaction_id: 'other' },
    { currency: 'USD' },
    { status: 'unknown' },
  ])('never marks a mismatched response successful (%j)', async (patch) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ status: 'success', data: { ...refund, ...patch } }),
    );
    await expect(client.submit('tx-1', 'r1', 24800)).rejects.toMatchObject({
      code: 'refund_response_mismatch',
      retryable: false,
    });
  });
  it.each([500, 503, 429])(
    'retries ambiguous/transient HTTP %s failures',
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({ error_code: 'refund_busy' }, { status }),
      );
      await expect(client.submit('tx-1', 'r1', 24800)).rejects.toMatchObject({
        retryable: true,
      });
    },
  );
  it('routes unsupported accounts to review rather than claiming a refund', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error_code: 'unsupported_bank' }, { status: 422 }),
    );
    await expect(client.submit('tx-1', 'r1', 24800)).rejects.toMatchObject({
      code: 'unsupported_bank',
      retryable: false,
    });
  });
  it('cannot enable this Sandbox integration with production credentials', () => {
    expect(
      new SePayRefundClient(
        new ConfigService({
          SEPAY_ENV: 'production',
          SEPAY_REFUND_API_TOKEN: 'token',
          SEPAY_REFUND_BANK_ACCOUNT_ID: 'bank',
        }),
      ).configured,
    ).toBe(false);
  });
});
