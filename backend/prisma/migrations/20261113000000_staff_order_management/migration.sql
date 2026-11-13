ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE "User" ADD CONSTRAINT "User_role_valid" CHECK ("role" IN ('CUSTOMER', 'STAFF', 'ADMIN'));
ALTER TABLE "Order" ADD COLUMN "cancelledById" TEXT, ADD COLUMN "cancellationActor" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancellationActor_valid"
  CHECK ("cancellationActor" IS NULL OR "cancellationActor" IN ('CUSTOMER', 'STAFF', 'SYSTEM'));
ALTER TABLE "Refund" ADD COLUMN "lastRetriedById" TEXT, ADD COLUMN "lastRetriedAt" TIMESTAMP(3);
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
