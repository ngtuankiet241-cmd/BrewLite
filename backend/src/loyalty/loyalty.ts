import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export const LOYALTY_POLICY = { spendPerPoint: 1000, pointValue: 10 } as const;

export function redemptionDiscount(
  points: number,
  orderAmount: number,
): number {
  if (!Number.isSafeInteger(points) || points < 0 || points > 2_147_483_647) {
    throw new BadRequestException(
      'Số điểm sử dụng phải là số nguyên không âm.',
    );
  }
  const discount = points * LOYALTY_POLICY.pointValue;
  if (discount > orderAmount) {
    throw new BadRequestException('Điểm quy đổi vượt số tiền cần thanh toán.');
  }
  return discount;
}

export async function redeemPoints(
  tx: Prisma.TransactionClient,
  userId: string | undefined,
  points: number,
): Promise<void> {
  if (!points) return;
  if (!userId) {
    throw new BadRequestException('Vui lòng đăng nhập để sử dụng điểm thưởng.');
  }
  const result = await tx.user.updateMany({
    where: { id: userId, loyaltyPoints: { gte: points } },
    data: { loyaltyPoints: { decrement: points } },
  });
  if (result.count !== 1) {
    throw new BadRequestException(
      'Số dư điểm không đủ. Vui lòng kiểm tra lại điểm thưởng.',
    );
  }
}

export async function awardPoints(
  tx: Prisma.TransactionClient,
  order: { id: string; userId: string | null; total: Prisma.Decimal | number },
): Promise<void> {
  if (!order.userId) return;
  const points = Math.floor(Number(order.total) / LOYALTY_POLICY.spendPerPoint);
  const result = await tx.order.updateMany({
    where: { id: order.id, status: 'PAID', pointsAwardedAt: null },
    data: { pointsEarned: points, pointsAwardedAt: new Date() },
  });
  if (result.count === 1 && points > 0) {
    await adjustPoints(tx, order.userId, points);
  }
}

// Lock the balance before netting credits against debt. Redemption's conditional
// UPDATE uses the same row lock, so spending and reversals cannot lose updates.
async function adjustPoints(
  tx: Prisma.TransactionClient,
  userId: string,
  delta: number,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const balance = user.loyaltyPoints - user.loyaltyDebt + delta;
  await tx.user.update({
    where: { id: userId },
    data: {
      loyaltyPoints: Math.max(0, balance),
      loyaltyDebt: Math.max(0, -balance),
    },
  });
}

export async function reverseCancellationPoints(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    userId: string | null;
    pointsRedeemed: number;
    pointsEarned: number;
    pointsRefundedAt: Date | null;
    pointsReversedAt: Date | null;
  },
): Promise<void> {
  // Caller holds the order row lock and owns the cancellation transition.
  if (!order.userId) return;
  const returned = order.pointsRefundedAt ? 0 : order.pointsRedeemed;
  const reversed = order.pointsReversedAt ? 0 : order.pointsEarned;
  if (!returned && !reversed) return;
  await adjustPoints(tx, order.userId, returned - reversed);
  await tx.order.update({
    where: { id: order.id },
    data: {
      ...(returned > 0 ? { pointsRefundedAt: new Date() } : {}),
      ...(reversed > 0 ? { pointsReversedAt: new Date() } : {}),
    },
  });
}
