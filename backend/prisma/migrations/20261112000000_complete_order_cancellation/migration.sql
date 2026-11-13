ALTER TABLE "User" ADD COLUMN "loyaltyDebt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_loyaltyDebt_valid"
  CHECK ("loyaltyDebt" >= 0 AND ("loyaltyDebt" = 0 OR "loyaltyPoints" = 0));

ALTER TABLE "Order"
  ADD COLUMN "pointsReversedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" VARCHAR(500);

CREATE TABLE "Refund" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "method" TEXT NOT NULL DEFAULT 'SEPAY',
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "transactionId" TEXT,
  "bankAccountId" TEXT,
  "providerRefundId" TEXT,
  "lastError" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "failures" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Refund_amount_nonnegative" CHECK ("amount" >= 0),
  CONSTRAINT "Refund_status_valid" CHECK ("status" IN ('PENDING', 'SUCCEEDED', 'FAILED', 'NEEDS_REVIEW')),
  CONSTRAINT "Refund_completion_valid" CHECK (
    ("status" <> 'SUCCEEDED' AND "completedAt" IS NULL) OR
    ("status" = 'SUCCEEDED' AND "completedAt" IS NOT NULL AND
      (("method" = 'LOCAL' AND "amount" = 0) OR
       ("method" = 'SEPAY' AND "providerRefundId" IS NOT NULL AND "transactionId" IS NOT NULL)))
  ),
  CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Refund_paymentId_key" ON "Refund"("paymentId");
CREATE UNIQUE INDEX "Refund_transactionId_key" ON "Refund"("transactionId");
CREATE UNIQUE INDEX "Refund_providerRefundId_key" ON "Refund"("providerRefundId");
CREATE INDEX "Refund_status_requestedAt_idx" ON "Refund"("status", "requestedAt");
ALTER TABLE "Payment" ADD COLUMN "gatewayOrderCode" TEXT;
