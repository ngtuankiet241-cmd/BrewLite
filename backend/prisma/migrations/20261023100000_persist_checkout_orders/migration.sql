-- Preserve existing orders while allowing the existing guest checkout flow.
ALTER TABLE "Order"
    ALTER COLUMN "userId" DROP NOT NULL,
    ADD COLUMN "subtotal" DECIMAL(12,2),
    ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "promotionCode" TEXT;

-- Historical options/prices cannot be reconstructed for legacy rows.
ALTER TABLE "OrderItem" ADD COLUMN "snapshot" JSONB;
