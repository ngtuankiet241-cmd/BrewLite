CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

INSERT INTO "Category" ("id", "name", "sortOrder") VALUES
  ('coffee', 'Cà phê', 1),
  ('fruit-tea', 'Trà trái cây', 2),
  ('other', 'Khác', 3);

ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT NOT NULL DEFAULT 'other';
UPDATE "Product" SET "categoryId" = CASE
  WHEN lower("name") LIKE '%cà phê%' OR lower("name") LIKE '%americano%' OR lower("name") LIKE '%cappuccino%' THEN 'coffee'
  WHEN lower("name") LIKE '%trà%' OR lower("name") LIKE '%tea%' THEN 'fruit-tea'
  ELSE 'other'
END;
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SizeOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "extraPrice" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "SizeOption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SizeOption_id_check" CHECK ("id" IN ('S', 'M', 'L')),
    CONSTRAINT "SizeOption_extraPrice_check" CHECK ("extraPrice" >= 0)
);
INSERT INTO "SizeOption" ("id", "name", "extraPrice", "sortOrder") VALUES
  ('S', 'Nhỏ', 0, 1),
  ('M', 'Vừa', 5000, 2),
  ('L', 'Lớn', 10000, 3);

CREATE TABLE "Topping" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "extraPrice" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "Topping_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Topping_extraPrice_check" CHECK ("extraPrice" >= 0)
);
INSERT INTO "Topping" ("id", "name", "extraPrice", "sortOrder") VALUES
  ('white_pearl', 'Trân châu trắng', 10000, 1),
  ('aloe_vera', 'Thạch nha đam', 10000, 2),
  ('cheese', 'Kem Cheese', 10000, 3);
