import type { PrismaClient } from '@prisma/client';

const SIZES = ['S', 'M', 'L'] as const;
const TOPPINGS = ['white_pearl', 'aloe_vera', 'cheese'] as const;

export async function createTestProduct(
  db: PrismaClient,
  product: { id: string; name: string; price: number; stock?: number },
) {
  const { id, name, price, stock = 100 } = product;
  const baseIngredientId = `${id}-base-inventory`;
  const toppingIngredientId = `${id}-topping-inventory`;

  await db.product.create({ data: { id, name, price } });
  await db.ingredient.createMany({
    data: [
      {
        id: baseIngredientId,
        name: `${name} base ingredient`,
        unit: 'g',
        stock,
      },
      {
        id: toppingIngredientId,
        name: `${name} topping ingredient`,
        unit: 'g',
        stock: 10000,
      },
    ],
  });
  await db.productRecipeIngredient.createMany({
    data: SIZES.map((sizeId) => ({
      productId: id,
      sizeId,
      ingredientId: baseIngredientId,
      quantity: 1,
    })),
  });
  await db.toppingRecipeIngredient.createMany({
    data: TOPPINGS.map((toppingId) => ({
      toppingId,
      ingredientId: toppingIngredientId,
      quantity: 1,
    })),
  });

  return { baseIngredientId, toppingIngredientId };
}

export async function setTestProductStock(
  db: PrismaClient,
  ingredientId: string,
  stock: number,
) {
  await db.ingredient.update({
    where: { id: ingredientId },
    data: { stock, stockVersion: 0 },
  });
}

export async function getTestProductInventory(
  db: PrismaClient,
  ingredientId: string,
) {
  return db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
}

export async function deleteTestProduct(
  db: PrismaClient,
  productId: string,
  ingredientIds: string[],
) {
  await db.product.delete({ where: { id: productId } });
  await db.toppingRecipeIngredient.deleteMany({
    where: { ingredientId: { in: ingredientIds } },
  });
  await db.ingredient.deleteMany({ where: { id: { in: ingredientIds } } });
}
