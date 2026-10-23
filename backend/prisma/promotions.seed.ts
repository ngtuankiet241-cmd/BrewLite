import type { PrismaClient, Prisma } from '@prisma/client';

export async function seedPromotions(prisma: PrismaClient) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const defaults = {
    minOrder: 50000,
    maxDiscount: null,
    usageLimit: 100,
    usedCount: 0,
    startsAt: new Date(now - day),
    expiresAt: new Date(now + 90 * day),
    isActive: true,
  };
  const promotions: Prisma.PromotionCreateInput[] = [
    {
      ...defaults,
      code: 'BREW10',
      discountType: 'PERCENTAGE',
      value: 10,
      maxDiscount: 30000,
    },
    {
      ...defaults,
      code: 'SAVE15000',
      discountType: 'FIXED',
      value: 15000,
      minOrder: 80000,
      usageLimit: 50,
    },
    {
      ...defaults,
      code: 'EXPIRED10',
      discountType: 'PERCENTAGE',
      value: 10,
      startsAt: new Date(now - 30 * day),
      expiresAt: new Date(now - day),
    },
    {
      ...defaults,
      code: 'COMING20',
      discountType: 'PERCENTAGE',
      value: 20,
      startsAt: new Date(now + 7 * day),
    },
    {
      ...defaults,
      code: 'INACTIVE10',
      discountType: 'PERCENTAGE',
      value: 10,
      isActive: false,
    },
    {
      ...defaults,
      code: 'USEDUP10',
      discountType: 'PERCENTAGE',
      value: 10,
      usageLimit: 5,
      usedCount: 5,
    },
  ];

  for (const promotion of promotions) {
    await prisma.promotion.upsert({
      where: { code: promotion.code },
      // Re-running a seed must preserve usage counters and existing settings.
      update: {},
      create: promotion,
    });
  }
  console.log(`Seeded ${promotions.length} promotions successfully!`);
}
