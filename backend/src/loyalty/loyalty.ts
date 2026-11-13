import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export const LOYALTY_POLICY = { spendPerPoint: 1000, pointValue: 10 } as const;

async function creditPoints(
  tx: Prisma.TransactionClient,
  userId: string,
  points: number,
) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { loyaltyDebt: true },
  });
  const repaid = Math.min(user.loyaltyDebt, points);
  await tx.user.update({
    where: { id: userId },
    data: {
      loyaltyPoints: { increment: points - repaid },
      loyaltyDebt: { decrement: repaid },
    },
  });
}

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
    await creditPoints(tx, order.userId, points);
  }
}

export async function refundPoints(
  tx: Prisma.TransactionClient,
  order: { id: string; userId: string | null; pointsRedeemed: number },
): Promise<void> {
  if (!order.userId || !order.pointsRedeemed) return;
  const result = await tx.order.updateMany({
    where: { id: order.id, status: 'CANCELLED', pointsRefundedAt: null },
    data: { pointsRefundedAt: new Date() },
  });
  if (result.count === 1) {
    await creditPoints(tx, order.userId, order.pointsRedeemed);
  }
}

export async function reverseEarnedPoints(
  tx: Prisma.TransactionClient,
  order: { id: string; userId: string | null; pointsEarned: number },
): Promise<void> {
  if (!order.userId || !order.pointsEarned) return;
  const result = await tx.order.updateMany({
    where: { id: order.id, status: 'CANCELLED', pointsReversedAt: null },
    data: { pointsReversedAt: new Date() },
  });
  if (result.count === 1) {
    // Keep the spendable balance nonnegative; future credits repay spent rewards.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${order.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: order.userId },
      select: { loyaltyPoints: true },
    });
    const recovered = Math.min(user.loyaltyPoints, order.pointsEarned);
    await tx.user.update({
      where: { id: order.userId },
      data: {
        loyaltyPoints: { decrement: recovered },
        loyaltyDebt: { increment: order.pointsEarned - recovered },
      },
    });
  }
}
