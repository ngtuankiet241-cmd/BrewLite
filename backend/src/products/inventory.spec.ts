import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { calculateStockBySize } from './inventory.js';

describe('calculateStockBySize', () => {
  it('uses the limiting ingredient for each size and returns zero for missing recipes', () => {
    const stockBySize = calculateStockBySize([
      {
        sizeId: 'S',
        quantity: new Prisma.Decimal(18),
        ingredient: { stock: new Prisma.Decimal(90) },
      },
      {
        sizeId: 'S',
        quantity: new Prisma.Decimal(60),
        ingredient: { stock: new Prisma.Decimal(200) },
      },
      {
        sizeId: 'M',
        quantity: new Prisma.Decimal(30),
        ingredient: { stock: new Prisma.Decimal(90) },
      },
      {
        sizeId: 'M',
        quantity: new Prisma.Decimal(100),
        ingredient: { stock: new Prisma.Decimal(200) },
      },
    ]);

    expect(stockBySize).toEqual({ S: 3, M: 2, L: 0 });
  });

  it('floors fractional availability without floating-point arithmetic', () => {
    const stockBySize = calculateStockBySize([
      {
        sizeId: 'S',
        quantity: new Prisma.Decimal('0.300'),
        ingredient: { stock: new Prisma.Decimal('1.000') },
      },
    ]);

    expect(stockBySize.S).toBe(3);
  });
});
