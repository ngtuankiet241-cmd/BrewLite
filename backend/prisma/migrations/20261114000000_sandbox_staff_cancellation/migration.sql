-- A code revert does not remove previously applied v2 database columns.
-- Keep those columns and historical Refund rows; simulation has its own table.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "pointsReversedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT,
  ADD COLUMN IF NOT EXISTS "inventoryRestoreStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN IF NOT EXISTS "inventoryRestoredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "promotionReleasedAt" TIMESTAMP(3);

-- Do not repeat inventory restoration for cancellations made by older code.
UPDATE "Order" SET "inventoryRestoreStatus" = 'NEEDS_REVIEW'
WHERE "status" = 'CANCELLED' AND "inventoryRestoreStatus" = 'NOT_APPLICABLE';

CREATE TABLE "SandboxRefund" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
  "mode" TEXT NOT NULL DEFAULT 'SIMULATED',
  "reference" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SandboxRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SandboxRefund_simulation_only" CHECK ("mode" = 'SIMULATED' AND "status" = 'SUCCEEDED' AND "amount" > 0)
);
CREATE UNIQUE INDEX "SandboxRefund_orderId_key" ON "SandboxRefund"("orderId");
CREATE UNIQUE INDEX "SandboxRefund_paymentId_key" ON "SandboxRefund"("paymentId");
CREATE UNIQUE INDEX "SandboxRefund_reference_key" ON "SandboxRefund"("reference");
ALTER TABLE "SandboxRefund" ADD CONSTRAINT "SandboxRefund_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SandboxRefund" ADD CONSTRAINT "SandboxRefund_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
