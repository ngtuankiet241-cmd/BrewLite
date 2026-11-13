import type { Payment, Prisma } from '@prisma/client';

export const SETTLED_PAYMENT_STATUSES = [
  'SUCCEEDED',
  'REFUND_PENDING',
  'REFUNDED',
  'REFUND_FAILED',
];

// Durable outbox: caller holds the order lock; the worker calls SePay after commit.
export async function requestRefund(
  tx: Prisma.TransactionClient,
  payment: Payment,
) {
  const local = Number(payment.amount) === 0;
  const v2 =
    payment.method === 'SEPAY_API_V2' &&
    payment.environment === 'sandbox' &&
    !!payment.providerTransactionId &&
    !!payment.bankAccountId;
  const refund = await tx.refund.upsert({
    where: { paymentId: payment.id },
    create: {
      paymentId: payment.id,
      amount: payment.amount,
      method: local ? 'LOCAL' : v2 ? 'SEPAY_V2' : 'LEGACY_GATEWAY',
      // Checkout in this application uses SePay Sandbox exclusively.
      environment: 'sandbox',
      status: local ? 'SUCCEEDED' : v2 ? 'PENDING' : 'NEEDS_REVIEW',
      transactionId: v2 ? payment.providerTransactionId : null,
      bankAccountId: v2 ? payment.bankAccountId : null,
      lastError: !local && !v2 ? 'payment_source_requires_review' : null,
      completedAt: local ? new Date() : null,
    },
    update: {},
  });
  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: refund.status === 'SUCCEEDED' ? 'REFUNDED' : 'REFUND_PENDING',
    },
  });
  return refund;
}

export function refundSummary(
  payments: {
    refund: {
      amount: Prisma.Decimal;
      status: string;
      completedAt: Date | null;
    } | null;
  }[],
) {
  const refunds = payments.flatMap((payment) =>
    payment.refund ? [payment.refund] : [],
  );
  return {
    refundStatus:
      refunds.length === 0
        ? 'NONE'
        : refunds.some((refund) =>
              ['FAILED', 'NEEDS_REVIEW'].includes(refund.status),
            )
          ? 'NEEDS_REVIEW'
          : refunds.every((refund) => refund.status === 'SUCCEEDED')
            ? 'SUCCEEDED'
            : 'PENDING',
    refundAmount: refunds.reduce(
      (sum, refund) => sum + Number(refund.amount),
      0,
    ),
  };
}
