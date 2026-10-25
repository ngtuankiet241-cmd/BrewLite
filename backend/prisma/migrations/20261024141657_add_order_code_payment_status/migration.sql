-- Existing orders already have unique IDs. Preserve those as their invoice codes
-- before making the new column required, so upgrading a populated database works.
ALTER TABLE "Order" ADD COLUMN "orderCode" TEXT;
UPDATE "Order" SET "orderCode" = "id";
ALTER TABLE "Order" ALTER COLUMN "orderCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderCode_key" ON "Order"("orderCode");
