CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "stockVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductRecipeIngredient" (
    "productId" TEXT NOT NULL,
    "sizeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "ProductRecipeIngredient_pkey" PRIMARY KEY ("productId", "sizeId", "ingredientId")
);

CREATE TABLE "ToppingRecipeIngredient" (
    "toppingId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "ToppingRecipeIngredient_pkey" PRIMARY KEY ("toppingId", "ingredientId")
);

ALTER TABLE "ProductRecipeIngredient"
ADD CONSTRAINT "ProductRecipeIngredient_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductRecipeIngredient"
ADD CONSTRAINT "ProductRecipeIngredient_ingredientId_fkey"
FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ToppingRecipeIngredient"
ADD CONSTRAINT "ToppingRecipeIngredient_ingredientId_fkey"
FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product"
DROP COLUMN "stock",
DROP COLUMN "stockVersion";
