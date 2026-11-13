import { Prisma } from '@prisma/client';
import { refundPoints, reverseEarnedPoints } from '../loyalty/loyalty.js';
import { simulateRefund } from '../payments/simulated-refunds.js';

type CancellationOrder = Prisma.OrderGetPayload<{
  include: { items: true; payments: true };
}>;

function ingredientUsage(items: CancellationOrder['items']) {
  const usage = new Map<string, Prisma.Decimal>();
  for (const item of items) {
    const snapshot = item.snapshot as { ingredientsUsed?: unknown } | null;
    if (
      !Array.isArray(snapshot?.ingredientsUsed) ||
      !snapshot.ingredientsUsed.length
    )
      return null;
    for (const entry of snapshot.ingredientsUsed as unknown[]) {
      if (!entry || typeof entry !== 'object') return null;
      const { ingredientId, quantity } = entry as Record<string, unknown>;
      if (
        typeof ingredientId !== 'string' ||
        !ingredientId ||
        typeof quantity !== 'number' ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      )
        return null;
      usage.set(
        ingredientId,
        (usage.get(ingredientId) ?? new Prisma.Decimal(0)).plus(quantity),
      );
    }
  }
  return items.length ? usage : null;
}

// Called once after claiming CANCELLED, within the same database transaction.
export async function applyCancellation(
  tx: Prisma.TransactionClient,
  order: CancellationOrder,
  actorId?: string,
  reason = 'Hủy đơn trước khi pha chế',
) {
  const now = new Date();
  const usage = ingredientUsage(order.items);
  let inventoryRestored = false;
  if (usage) {
    const existing = await tx.ingredient.count({
      where: { id: { in: [...usage.keys()] } },
    });
    if (existing === usage.size) {
      for (const ingredientId of [...usage.keys()].sort()) {
        await tx.ingredient.update({
          where: { id: ingredientId },
          data: {
            stock: { increment: usage.get(ingredientId)! },
            stockVersion: { increment: 1 },
          },
        });
      }
      inventoryRestored = true;
    }
  }

  let promotionReleased = false;
  if (order.promotionCode) {
    const released = await tx.promotion.updateMany({
      where: { code: order.promotionCode, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
    promotionReleased = released.count === 1;
  }
  await refundPoints(tx, order);
  await reverseEarnedPoints(tx, order);
  for (const payment of order.payments) await simulateRefund(tx, payment);
  await tx.order.update({
    where: { id: order.id },
    data: {
      cancelledAt: now,
      cancelledById: actorId ?? null,
      cancellationReason: reason,
      inventoryRestoreStatus: inventoryRestored ? 'RESTORED' : 'NEEDS_REVIEW',
      inventoryRestoredAt: inventoryRestored ? now : null,
      promotionReleasedAt: promotionReleased ? now : null,
    },
  });
}
