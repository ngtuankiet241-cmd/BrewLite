ALTER TABLE "Order"
  ADD COLUMN "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pointsDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "pointsEarned" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pointsAwardedAt" TIMESTAMP(3),
  ADD COLUMN "pointsRefundedAt" TIMESTAMP(3);

ALTER TABLE "User" ADD CONSTRAINT "User_loyaltyPoints_nonnegative" CHECK ("loyaltyPoints" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_loyalty_nonnegative"
  CHECK ("pointsRedeemed" >= 0 AND "pointsDiscount" >= 0 AND "pointsEarned" >= 0);
