import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  RefundProviderError,
  SePayRefundClient,
} from './sepay-refund.client.js';

@Injectable()
export class RefundsWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private readonly logger = new Logger(RefundsWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: SePayRefundClient,
  ) {}

  onModuleInit() {
    if (!this.provider.configured) {
      this.logger.warn(
        'Automatic refunds await SEPAY_API_TOKEN and SEPAY_BANK_ACCOUNT_ID (Sandbox).',
      );
      return;
    }
    this.schedule(1000);
  }

  onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.processNext()
        .catch(() =>
          this.logger.error(
            'Refund worker failed; durable requests will be retried.',
          ),
        )
        .finally(() => this.schedule(2000));
    }, delay);
    this.timer.unref();
  }

  async processNext(): Promise<boolean> {
    if (!this.provider.configured) return false;
    const token = randomUUID();
    const refund = await this.prisma.$transaction(async (tx) => {
      // Prisma DateTime columns are UTC timestamps without a time zone. Comparing
      // them to NOW() (timestamptz) would apply the database session's time zone
      // and can make future retries and active leases appear already expired.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Refund" WHERE "status" = 'PENDING' AND "method" = 'SEPAY_V2'
        AND "environment" = 'sandbox' AND "nextAttemptAt" <= (NOW() AT TIME ZONE 'UTC')
        AND ("leaseUntil" IS NULL OR "leaseUntil" < (NOW() AT TIME ZONE 'UTC'))
        ORDER BY "nextAttemptAt", "requestedAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      return tx.refund.update({
        where: { id: rows[0].id },
        data: {
          leaseToken: token,
          leaseUntil: new Date(Date.now() + 90_000),
          attempts: { increment: 1 },
        },
        include: { payment: { include: { order: true } } },
      });
    });
    if (!refund) return false;
    const owned = { id: refund.id, leaseToken: token, status: 'PENDING' };
    try {
      if (
        refund.payment.order.status !== 'CANCELLED' ||
        refund.payment.status !== 'REFUND_PENDING'
      ) {
        throw new RefundProviderError('refund_state_mismatch', false);
      }
      const transactionId = refund.transactionId;
      const bankAccountId = refund.bankAccountId;
      if (
        refund.payment.method !== 'SEPAY_API_V2' ||
        refund.payment.environment !== 'sandbox' ||
        !transactionId ||
        transactionId !== refund.payment.providerTransactionId ||
        !bankAccountId ||
        bankAccountId !== refund.payment.bankAccountId
      ) {
        throw new RefundProviderError('refund_source_mismatch', false);
      }
      const result = refund.providerRefundId
        ? await this.provider.retrieve(
            bankAccountId,
            refund.providerRefundId,
            transactionId,
            Number(refund.amount),
          )
        : await this.provider.submit(
            transactionId,
            refund.id,
            Number(refund.amount),
          );
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.refund.updateMany({
          where: owned,
          data: {
            ...result,
            completedAt: result.status === 'SUCCEEDED' ? new Date() : null,
            lastError:
              result.status === 'FAILED' ? 'provider_refund_failed' : null,
            failures: 0,
            leaseToken: null,
            leaseUntil: null,
            nextAttemptAt: new Date(Date.now() + 30_000),
          },
        });
        if (changed.count === 1 && result.status !== 'PENDING') {
          await tx.payment.update({
            where: { id: refund.paymentId },
            data: {
              status:
                result.status === 'SUCCEEDED' ? 'REFUNDED' : 'REFUND_FAILED',
            },
          });
        }
      });
    } catch (error) {
      const duplicateMapping =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';
      const retryable =
        !duplicateMapping &&
        (!(error instanceof RefundProviderError) || error.retryable) &&
        refund.failures < 7;
      const code = duplicateMapping
        ? 'transaction_already_assigned'
        : error instanceof RefundProviderError
          ? error.code
          : 'refund_worker_error';
      const nextAttemptAt = new Date(
        Date.now() +
          Math.min(3600_000, 30_000 * 2 ** Math.min(refund.failures, 7)),
      );
      const changed = await this.prisma.refund.updateMany({
        where: owned,
        data: {
          status: retryable ? 'PENDING' : 'NEEDS_REVIEW',
          lastError: code,
          failures: { increment: 1 },
          leaseToken: null,
          leaseUntil: null,
          nextAttemptAt,
        },
      });
      if (changed.count === 1) {
        this.logger.warn(
          `Refund ${refund.id}: ${code}; failure ${refund.failures + 1}/8; ${
            retryable
              ? `retry at ${nextAttemptAt.toISOString()}`
              : 'NEEDS_REVIEW (automatic retries stopped)'
          }`,
        );
      }
    }
    return true;
  }
}
