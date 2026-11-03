import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedPromotions } from './promotions.seed.js';

const prisma = new PrismaClient();

seedPromotions(prisma)
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
