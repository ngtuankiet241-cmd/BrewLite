import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PRODUCTS } from '../src/products/products.data.js';
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
      create: {
        ...product,
        stock: 100,
      },
    });
  }

  console.log(`Seeded ${products.length} products successfully!`);
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
