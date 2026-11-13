import type { Payment, Prisma, Refund } from '@prisma/client';

// The caller holds the order row lock. A unique payment/order also prevents
// duplicate refunds across cancellation retries and late payment callbacks.
export async function simulateRefund(
  tx: Prisma.TransactionClient,
  payment: Payment,
): Promise<void> {
  if (
    payment.method !== 'SEPAY_BANK_TRANSFER' ||
    payment.status !== 'SUCCEEDED' ||
    Number(payment.amount) <= 0
  )
    return;
  await tx.refund.upsert({
    where: { paymentId: payment.id },
    update: {},
    create: {
      orderId: payment.orderId,
      paymentId: payment.id,
      amount: payment.amount,
      mode: 'SIMULATED',
      status: 'SUCCEEDED',
      reference: `SIM-REFUND-${payment.id}`,
    },
  });
}

export function refundSummary(refund: Refund | null) {
  return refund
    ? {
        status: refund.status,
        mode: refund.mode,
        amount: Number(refund.amount),
        reference: refund.reference,
        completedAt: refund.completedAt.toISOString(),
      }
    : null;
}
