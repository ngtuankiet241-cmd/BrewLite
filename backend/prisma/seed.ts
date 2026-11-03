import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  INGREDIENTS,
  PRODUCTS,
  PRODUCT_RECIPES,
  TOPPING_RECIPES,
} from '../src/products/products.data.js';
import { seedPromotions } from './promotions.seed.js';

const prisma = new PrismaClient();

const products = PRODUCTS;

async function main() {
  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
      },
      create: product,
    });
  }

  for (const ingredient of INGREDIENTS) {
    await prisma.ingredient.upsert({
      where: { id: ingredient.id },
      update: { name: ingredient.name, unit: ingredient.unit },
      create: ingredient,
    });
  }

  for (const recipe of PRODUCT_RECIPES) {
    await prisma.productRecipeIngredient.upsert({
      where: {
        productId_sizeId_ingredientId: {
          productId: recipe.productId,
          sizeId: recipe.sizeId,
          ingredientId: recipe.ingredientId,
        },
      },
      update: { quantity: recipe.quantity },
      create: recipe,
    });
  }

  for (const recipe of TOPPING_RECIPES) {
    await prisma.toppingRecipeIngredient.upsert({
      where: {
        toppingId_ingredientId: {
          toppingId: recipe.toppingId,
          ingredientId: recipe.ingredientId,
        },
      },
      update: { quantity: recipe.quantity },
      create: recipe,
    });
  }

  console.log(`Seeded ${products.length} products successfully!`);
  console.log(
    `Seeded ${INGREDIENTS.length} ingredients and ${PRODUCT_RECIPES.length + TOPPING_RECIPES.length} recipe lines.`,
  );
  await seedPromotions(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
