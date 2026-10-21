BEGIN;

ALTER TABLE "Order" DROP CONSTRAINT "Order_userId_fkey";
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";

ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "OrderItem" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "id" DROP DEFAULT;

-- Cast existing identifiers without removing records or changing relationships.
ALTER TABLE "User" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
ALTER TABLE "Order" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT,
                    ALTER COLUMN "userId" TYPE TEXT USING "userId"::TEXT;
ALTER TABLE "OrderItem" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT,
                        ALTER COLUMN "orderId" TYPE TEXT USING "orderId"::TEXT;
ALTER TABLE "Payment" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT,
                      ALTER COLUMN "orderId" TYPE TEXT USING "orderId"::TEXT;

ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
