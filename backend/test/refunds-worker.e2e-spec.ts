import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PrismaClient, type Prisma } from '@prisma/client';
import { vi } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RefundsWorker } from '../src/payments/refunds.worker.js';
import {
  RefundProviderError,
  SePayRefundClient,
} from '../src/payments/sepay-refund.client.js';

describe('Refund worker scheduling in PostgreSQL', () => {
  const admin = new PrismaClient();
  const schema = `refund_worker_test_${randomUUID().replaceAll('-', '')}`;
  let db: PrismaClient;
  let sourceSchema: string;
  const warningLog = vi.fn();
  const provider = {
    configured: true,
    bankAccountId: 'test-bank',
    submit: vi.fn(),
    retrieve: vi.fn(),
  };

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    sourceSchema = url.searchParams.get('schema') ?? 'public';
    const quote = (identifier: string) =>
      `"${identifier.replaceAll('"', '""')}"`;
    await admin.$executeRawUnsafe(`CREATE SCHEMA ${quote(schema)}`);
    // Isolate fixtures from the app's running worker and existing refund queue.
    for (const table of ['Order', 'Payment', 'Refund']) {
      await admin.$executeRawUnsafe(
        `CREATE TABLE ${quote(schema)}.${quote(table)} (LIKE ${quote(sourceSchema)}.${quote(table)} INCLUDING ALL)`,
      );
    }
    url.searchParams.set('schema', schema);
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(warningLog);
    await db.refund.deleteMany();
    await db.payment.deleteMany();
    await db.order.deleteMany();
    await db.order.create({
      data: {
        id: 'test-order',
        orderCode: 'ORD-worker-test',
        status: 'CANCELLED',
        total: 25000,
        payments: {
          create: {
            id: 'test-payment',
            idempotencyKey: 'test-payment',
            amount: 25000,
            method: 'SEPAY_API_V2',
            environment: 'sandbox',
            providerTransactionId: 'test-transaction',
            bankAccountId: 'test-bank',
            status: 'REFUND_PENDING',

            refund: {
              create: {
                id: 'test-refund',
                method: 'SEPAY_V2',
                transactionId: 'test-transaction',
                bankAccountId: 'test-bank',
                amount: 25000,
                nextAttemptAt: new Date(0),
              },
            },
          },
        },
      },
    });
    provider.submit.mockRejectedValue(
      new RefundProviderError('network_or_timeout'),
    );
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await db?.$disconnect();
    // schema is generated above, never taken from the application's schema name.
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  });

  function worker(timezone: string) {
    const prisma = {
      refund: db.refund,
      payment: db.payment,
      $transaction: (
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
          return callback(tx);
        }),
    };
    return new RefundsWorker(
      prisma as unknown as PrismaService,
      provider as unknown as SePayRefundClient,
    );
  }

  const savedRefund = () =>
    db.refund.findUniqueOrThrow({ where: { id: 'test-refund' } });

  it.each(['UTC', 'Asia/Bangkok', 'America/Los_Angeles'])(
    'respects backoff and stops after eight failures with session time zone %s',
    async (timezone) => {
      const processor = worker(timezone);
      for (let failure = 1; failure <= 8; failure++) {
        const before = Date.now();
        expect(await processor.processNext()).toBe(true);
        const refund = await savedRefund();
        expect(refund.failures).toBe(failure);
        expect(refund.attempts).toBe(failure);
        expect(refund.lastError).toBe('network_or_timeout');
        expect(refund.status).toBe(failure < 8 ? 'PENDING' : 'NEEDS_REVIEW');
        expect(refund.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
          before + Math.min(3600_000, 30_000 * 2 ** (failure - 1)),
        );
        expect(await processor.processNext()).toBe(false);
        expect(provider.submit).toHaveBeenCalledTimes(failure);
        await db.refund.update({
          where: { id: 'test-refund' },
          data: { nextAttemptAt: new Date(0) },
        });
      }
      expect(await processor.processNext()).toBe(false);
      expect(provider.submit).toHaveBeenCalledTimes(8);
      expect(warningLog).toHaveBeenLastCalledWith(
        expect.stringContaining('NEEDS_REVIEW (automatic retries stopped)'),
      );
    },
  );

  it.each(['UTC', 'Asia/Bangkok', 'America/Los_Angeles'])(
    'does not reclaim an active lease in %s, but recovers an expired one',
    async (timezone) => {
      await db.refund.update({
        where: { id: 'test-refund' },
        data: {
          leaseToken: 'another-worker',
          leaseUntil: new Date(Date.now() + 90_000),
        },
      });
      const processor = worker(timezone);
      expect(await processor.processNext()).toBe(false);
      expect(provider.submit).not.toHaveBeenCalled();
      await db.refund.update({
        where: { id: 'test-refund' },
        data: { leaseUntil: new Date(0) },
      });
      expect(await processor.processNext()).toBe(true);
      expect(provider.submit).toHaveBeenCalledTimes(1);
    },
  );

  it('waits for the scheduled status poll after the provider accepts a refund', async () => {
    await db.refund.update({
      where: { id: 'test-refund' },
      data: { transactionId: 'test-transaction', bankAccountId: 'test-bank' },
    });
    provider.submit.mockResolvedValue({
      status: 'PENDING',
      providerRefundId: 'test-provider-refund',
    });
    const processor = worker('Asia/Bangkok');
    expect(await processor.processNext()).toBe(true);
    expect(await processor.processNext()).toBe(false);
    expect(provider.submit).toHaveBeenCalledTimes(1);
    expect(provider.retrieve).not.toHaveBeenCalled();
    await db.refund.update({
      where: { id: 'test-refund' },
      data: { nextAttemptAt: new Date(0) },
    });
    provider.retrieve.mockResolvedValue({
      status: 'SUCCEEDED',
      providerRefundId: 'test-provider-refund',
    });
    expect(await processor.processNext()).toBe(true);
    expect((await savedRefund()).status).toBe('SUCCEEDED');
    expect(provider.submit).toHaveBeenCalledTimes(1);
    expect(provider.retrieve).toHaveBeenCalledTimes(1);
  });
});
