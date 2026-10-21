BEGIN;

ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";
ALTER TABLE "Product" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
ALTER TABLE "OrderItem" ALTER COLUMN "productId" TYPE TEXT USING "productId"::TEXT;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Match existing seed products by name; cascading updates preserve order references.
UPDATE "Product" AS p
SET "id" = seed."id"
FROM (VALUES
  ('coffee-milk', 'Cà phê sữa'),
  ('americano', 'Americano'),
  ('cappuccino', 'Cappuccino'),
  ('peach-tea', 'Trà đào'),
  ('lotus-seed-tea', 'Trà hạt sen'),
  ('Milk-tea', 'Trà sữa'),
  ('blueberry-soda', 'Soda việt quất'),
  ('Matcha-latte', 'Matcha Latte'),
  ('strawberry-tea', 'Trà dâu tây'),
  ('cantaloupe-tea', 'Trà dưa lưới')
) AS seed("id", "name")
WHERE p."name" = seed."name";

COMMIT;
