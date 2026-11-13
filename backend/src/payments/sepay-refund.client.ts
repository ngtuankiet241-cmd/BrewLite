import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class RefundProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable = true,
  ) {
    super(code);
  }
}

type RecordData = Record<string, unknown>;
function record(value: unknown): RecordData {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RefundProviderError('invalid_response');
  return value as RecordData;
}

@Injectable()
export class SePayRefundClient {
  constructor(private readonly config: ConfigService) {}

  get configured() {
    return (
      this.config.get('SEPAY_ENV') === 'sandbox' &&
      !!this.apiToken &&
      !!this.bankAccountId
    );
  }

  get bankAccountId() {
    return (
      this.config.get<string>('SEPAY_BANK_ACCOUNT_ID') ||
      this.config.get<string>('SEPAY_REFUND_BANK_ACCOUNT_ID')
    );
  }

  private get apiToken() {
    return (
      this.config.get<string>('SEPAY_API_TOKEN') ||
      this.config.get<string>('SEPAY_REFUND_API_TOKEN')
    );
  }

  async getBankAccount() {
    const body = await this.request(
      `/bank-accounts/${encodeURIComponent(this.bankAccountId ?? '')}`,
    );
    const data = record(body.data);
    if (
      data.id !== this.bankAccountId ||
      Number(data.active) !== 1 ||
      typeof data.account_number !== 'string' ||
      !data.account_number ||
      typeof data.bank_code !== 'string' ||
      !data.bank_code ||
      typeof data.account_holder_name !== 'string' ||
      data.va_only === true ||
      data.va_only === 1
    ) {
      throw new RefundProviderError('bank_account_not_supported', false);
    }
    return {
      bankAccountId: this.bankAccountId!,
      accountNumber: data.account_number,
      accountName: data.account_holder_name,
      bankCode: data.bank_code,
      bankName:
        typeof data.bank_full_name === 'string'
          ? data.bank_full_name
          : data.bank_code,
    };
  }

  private async request(
    path: string,
    init: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ): Promise<RecordData> {
    if (!this.configured)
      throw new RefundProviderError('refund_not_configured');
    let response: Response;
    try {
      response = await fetch(`https://userapi-sandbox.sepay.vn/v2${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new RefundProviderError('network_or_timeout');
    }
    const body = record(await response.json().catch(() => ({})));
    if (!response.ok) {
      // Keep only a technical code; never persist tokens or full provider payloads.
      const code =
        typeof body.error_code === 'string' &&
        /^[a-z_]{1,80}$/.test(body.error_code)
          ? body.error_code
          : `http_${response.status}`;
      throw new RefundProviderError(
        code,
        response.status >= 500 || [401, 403, 429].includes(response.status),
      );
    }
    if (body.status !== 'success')
      throw new RefundProviderError('invalid_response');
    return body;
  }

  async resolveTransaction(
    orderCode: string,
    gatewayOrderCode: string | null,
    amount: number,
    accountId = this.bankAccountId,
    referenceNumber?: string,
  ) {
    const lookupCode = gatewayOrderCode || orderCode;
    const matches = new Map<string, RecordData>();
    let page = 1;
    for (;;) {
      const query = new URLSearchParams({
        q: lookupCode,
        bank_account_id: accountId!,
        transfer_type: 'in',
        amount_in_min: String(amount),
        amount_in_max: String(amount),
        per_page: '100',
        page: String(page),
      });
      if (referenceNumber) query.set('reference_number', referenceNumber);
      const body = await this.request(`/transactions?${query}`);
      if (!Array.isArray(body.data))
        throw new RefundProviderError('invalid_transactions');
      for (const value of body.data) {
        const item = record(value);
        // Search is fuzzy. Verify an exact unique code, amount, direction and account.
        // Never treat a Gateway transaction ID as an API v2 transaction ID.
        const tokens = (
          typeof item.transaction_content === 'string'
            ? item.transaction_content
            : ''
        )
          .toUpperCase()
          .split(/[^A-Z0-9-]+/);
        const hasCode =
          (typeof item.code === 'string' ? item.code : '').toUpperCase() ===
            lookupCode.toUpperCase() ||
          tokens.includes(lookupCode.toUpperCase());
        if (
          hasCode &&
          item.bank_account_id === accountId &&
          (!referenceNumber || item.reference_number === referenceNumber) &&
          item.transfer_type === 'in' &&
          Number(item.amount_in) === amount &&
          Number(item.amount_out) === 0 &&
          typeof item.id === 'string'
        ) {
          matches.set(item.id, item);
        }
      }
      const pagination = record(record(body.meta).pagination);
      if (pagination.has_more === false) break;
      if (pagination.has_more !== true || page >= 10)
        throw new RefundProviderError('ambiguous_transaction_pages', false);
      page++;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (matches.size === 0)
      throw new RefundProviderError('original_transaction_not_found');
    if (matches.size !== 1)
      throw new RefundProviderError('ambiguous_original_transaction', false);
    return {
      transactionId: [...matches.keys()][0],
      bankAccountId: accountId!,
    };
  }

  async submit(transactionId: string, refundId: string, amount: number) {
    const body = await this.request(
      `/transactions/${encodeURIComponent(transactionId)}/refund`,
      {
        method: 'POST',
        headers: { 'X-Idempotency-Key': `brewlite-refund:${refundId}` },
        body: JSON.stringify({ refund_amount: amount }),
      },
    );
    return this.parseResult(body.data, transactionId, amount);
  }

  async retrieve(
    bankAccountId: string,
    providerRefundId: string,
    transactionId: string,
    amount: number,
  ) {
    const body = await this.request(
      `/bank-accounts/${encodeURIComponent(bankAccountId)}/refunds/${encodeURIComponent(providerRefundId)}`,
    );
    const result = this.parseResult(body.data, transactionId, amount);
    if (result.providerRefundId !== providerRefundId)
      throw new RefundProviderError('refund_identity_mismatch', false);
    return result;
  }

  private parseResult(value: unknown, transactionId: string, amount: number) {
    const data = record(value);
    if (
      String(data.transaction_id) !== transactionId ||
      Number(data.amount) !== amount ||
      data.currency !== 'VND' ||
      typeof data.refund_id !== 'string' ||
      !data.refund_id ||
      !['pending', 'succeeded', 'failed', 'rejected'].includes(
        String(data.status),
      )
    ) {
      throw new RefundProviderError('refund_response_mismatch', false);
    }
    return {
      providerRefundId: data.refund_id,
      status:
        data.status === 'succeeded'
          ? 'SUCCEEDED'
          : data.status === 'pending'
            ? 'PENDING'
            : 'FAILED',
    };
  }
}
