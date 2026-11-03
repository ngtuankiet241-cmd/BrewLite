import { BadRequestException } from '@nestjs/common';
import type { Prisma, Promotion } from '@prisma/client';
import { vi } from 'vitest';
import { OrdersService } from '../orders/orders.service.js';
import { OrderSizeId } from '../orders/order.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PromotionsService } from './promotions.service.js';

describe('Promotions and discounted orders', () => {
  let promotion: Promotion;
  const findUnique = vi.fn();
  const updateMany = vi.fn();
  const findProducts = vi.fn();
  let service: PromotionsService;
  let orders: OrdersService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
    vi.resetAllMocks();
    promotion = {
      id: 1,
      code: 'BREW10',
      discountType: 'PERCENTAGE',
      value: 10,
      minOrder: 50000,
      maxDiscount: 30000,
      usageLimit: 100,
      usedCount: 0,
      startsAt: new Date('2026-10-01T00:00:00Z'),
      expiresAt: new Date('2026-11-01T00:00:00Z'),
      isActive: true,
    };
    findUnique.mockImplementation(() => Promise.resolve({ ...promotion }));
    updateMany.mockResolvedValue({ count: 1 });
    findProducts.mockResolvedValue([
      {
        id: 'coffee',
        name: 'Cà phê',
        price: { toNumber: () => 35000 },
        stock: 100,
        stockVersion: 0,
      },
    ]);
    const prisma = {
      promotion: { findUnique, updateMany },
      product: {
        findMany: findProducts,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        create: vi
          .fn()
          .mockImplementation(({ data }: Prisma.OrderCreateArgs) =>
            Promise.resolve({ id: data.id, createdAt: new Date() }),
          ),
      },
      $transaction: vi
        .fn()
        .mockImplementation((run: (tx: Prisma.TransactionClient) => unknown) =>
          run(prisma),
        ),
    } as unknown as PrismaService;
    service = new PromotionsService(prisma);
    orders = new OrdersService(prisma, service);
  });

  afterEach(() => vi.useRealTimers());

  it('normalizes the code and previews without consuming a use', async () => {
    expect(await service.validate(' brew10 ', 100000)).toEqual({
      code: 'BREW10',
      orderAmount: 100000,
      discountAmount: 10000,
      totalAmount: 90000,
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { code: 'BREW10' } });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('caps a percentage discount and rounds down to integer VND', async () => {
    expect((await service.validate('BREW10', 100005)).discountAmount).toBe(
      10000,
    );
    expect((await service.validate('BREW10', 500000)).discountAmount).toBe(
      30000,
    );
  });

  it('supports fixed discounts, null limits, and never returns a negative total', async () => {
    Object.assign(promotion, {
      discountType: 'FIXED',
      value: 150000,
      maxDiscount: null,
      usageLimit: null,
    });
    expect(await service.consume('BREW10', 50000)).toMatchObject({
      discountAmount: 50000,
      totalAmount: 0,
    });
    expect(updateMany.mock.calls[0][0].where.usedCount).toEqual({
      lt: 2147483647,
    });
  });

  it.each([
    ['inactive', { isActive: false }],
    ['not started', { startsAt: new Date('2026-10-24T00:00:00Z') }],
    [
      'expired at the exact boundary',
      { expiresAt: new Date('2026-10-23T12:00:00Z') },
    ],
    ['exhausted', { usedCount: 100 }],
    ['zero usage limit', { usageLimit: 0 }],
    ['unsupported type', { discountType: 'OTHER' }],
    ['invalid percentage', { value: 101 }],
    ['invalid cap', { maxDiscount: 0 }],
  ])('rejects %s codes without changing the counter', async (_name, fields) => {
    Object.assign(promotion, fields);
    await expect(service.consume('BREW10', 100000)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('accepts the exact start time and minimum order', async () => {
    promotion.startsAt = new Date();
    expect((await service.validate('BREW10', 50000)).discountAmount).toBe(5000);
  });

  it('rejects unknown codes, low subtotals and unsafe amounts', async () => {
    await expect(service.validate('BREW10', 49999)).rejects.toThrow('đơn từ');
    await expect(
      service.validate('BREW10', Number.MAX_SAFE_INTEGER + 1),
    ).rejects.toThrow('không hợp lệ');
    findUnique.mockResolvedValue(null);
    await expect(service.consume('UNKNOWN', 100000)).rejects.toThrow(
      'không tồn tại',
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('allows only one order to take the final available use', async () => {
    promotion.usageLimit = 1;
    updateMany.mockImplementation(
      ({ where }: { where: { usedCount: { lt: number } } }) => {
        if (promotion.usedCount >= where.usedCount.lt)
          return Promise.resolve({ count: 0 });
        promotion.usedCount++;
        return Promise.resolve({ count: 1 });
      },
    );
    const results = await Promise.allSettled([
      service.consume('BREW10', 100000),
      service.consume('BREW10', 100000),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(promotion.usedCount).toBe(1);
  });

  it('rejects a code changed or disabled between reading and consuming it', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(service.consume('BREW10', 100000)).rejects.toThrow(
      'không còn khả dụng',
    );
    expect(updateMany.mock.calls[0][0].where).toMatchObject({
      code: 'BREW10',
      value: 10,
      maxDiscount: 30000,
      isActive: true,
      usedCount: { lt: 100 },
    });
  });

  const items = [
    {
      productId: 'coffee',
      quantity: 2,
      sizeId: OrderSizeId.Small,
      toppingIds: [],
    },
  ];

  it('recomputes the subtotal from product prices when ordering', async () => {
    // The preview subtotal is never used as the checkout price.
    await service.validate('BREW10', 500000);
    expect(
      await orders.create({ items, promotionCode: 'BREW10' }),
    ).toMatchObject({
      subtotalAmount: 70000,
      discountAmount: 7000,
      totalAmount: 63000,
      promotionCode: 'BREW10',
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing behavior for orders without a code', async () => {
    const order = await orders.create({ items });
    expect(order.totalAmount).toBe(70000);
    expect(order).not.toHaveProperty('promotionCode');
    expect(findUnique).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not consume a promotion when product validation fails', async () => {
    findProducts.mockResolvedValue([]);
    await expect(
      orders.create({ items, promotionCode: 'BREW10' }),
    ).rejects.toThrow('không tồn tại');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects an expired code at checkout even after a valid preview', async () => {
    await service.validate('BREW10', 70000);
    promotion.expiresAt = new Date();
    await expect(
      orders.create({ items, promotionCode: 'BREW10' }),
    ).rejects.toThrow('hết hạn');
    expect(updateMany).not.toHaveBeenCalled();
  });
});
