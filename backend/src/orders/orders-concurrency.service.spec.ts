import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PromotionsService } from '../promotions/promotions.service.js';
import { OrderSizeId } from './order.types.js';
import { OrdersService } from './orders.service.js';

describe('Optimistic inventory locking', () => {
  let stock: number;
  let stockVersion: number;
  const findProducts = vi.fn();
  const updateStock = vi.fn();
  const createOrder = vi.fn();
  const transaction = vi.fn();
  const tx = {
    product: { findMany: findProducts, updateMany: updateStock },
    order: { create: createOrder },
  };
  const product = () => ({
    id: 'coffee',
    name: 'Coffee',
    price: { toNumber: () => 25000 },
    stock,
    stockVersion,
  });
  const items = (quantity = 1) => [
    {
      productId: 'coffee',
      quantity,
      sizeId: OrderSizeId.Small,
      toppingIds: [],
    },
  ];
  let service: OrdersService;

  beforeEach(() => {
    vi.resetAllMocks();
    stock = 10;
    stockVersion = 0;
    findProducts.mockImplementation(() => Promise.resolve([product()]));
    // Simulate a database compare-and-swap; real transaction rollback is covered
    // separately by the PostgreSQL integration suite.
    updateStock.mockImplementation(
      ({
        where,
        data,
      }: {
        where: { stockVersion: number; stock: { gte: number } };
        data: {
          stock: { decrement: number };
          stockVersion: { increment: number };
        };
      }) => {
        if (where.stockVersion !== stockVersion || stock < where.stock.gte) {
          return Promise.resolve({ count: 0 });
        }
        stock -= data.stock.decrement;
        stockVersion += data.stockVersion.increment;
        return Promise.resolve({ count: 1 });
      },
    );
    createOrder.mockImplementation(({ data }: Prisma.OrderCreateArgs) =>
      Promise.resolve({
        orderCode: data.orderCode,
        createdAt: new Date(),
      }),
    );
    transaction.mockImplementation((run: (client: typeof tx) => unknown) =>
      run(tx),
    );
    service = new OrdersService(
      { $transaction: transaction } as unknown as PrismaService,
      {} as PromotionsService,
    );
  });

  it.each([
    { initial: 1, quantity: 1 },
    { initial: 5, quantity: 2 },
  ])(
    'does not oversell stock=$initial when competing orders request quantity=$quantity',
    async ({ initial, quantity }) => {
      stock = initial;
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          service.create({ items: items(quantity) }),
        ),
      );
      const accepted = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(accepted).toHaveLength(Math.floor(initial / quantity));
      expect(rejected).toHaveLength(8 - accepted.length);
      for (const result of rejected)
        expect(result.reason).toBeInstanceOf(BadRequestException);
      expect(stock).toBe(initial - accepted.length * quantity);
      expect(stock).toBeGreaterThanOrEqual(0);
      expect(stockVersion).toBe(accepted.length);
      expect(createOrder).toHaveBeenCalledTimes(accepted.length);
    },
  );

  it('rereads inventory in a new transaction after a version conflict and succeeds if stock remains', async () => {
    updateStock.mockImplementationOnce(() => {
      stockVersion++;
      return Promise.resolve({ count: 0 });
    });
    const result = await service.create({ items: items(2) });
    expect(result.orderCode).toMatch(/^ORD-/);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(findProducts).toHaveBeenCalledTimes(2);
    expect(updateStock).toHaveBeenLastCalledWith({
      where: { id: 'coffee', stockVersion: 1, stock: { gte: 2 } },
      data: { stock: { decrement: 2 }, stockVersion: { increment: 1 } },
    });
    expect(stock).toBe(8);
    expect(stockVersion).toBe(2);
    expect(createOrder).toHaveBeenCalledOnce();
  });

  it('returns 409 after five conflicting attempts without saving an order', async () => {
    updateStock.mockResolvedValue({ count: 0 });
    await expect(service.create({ items: items() })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction).toHaveBeenCalledTimes(5);
    expect(createOrder).not.toHaveBeenCalled();
    expect(stock).toBe(10);
  });

  it('propagates unrelated database errors without retrying the transaction', async () => {
    updateStock.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.create({ items: items() })).rejects.toThrow(
      'Database unavailable',
    );
    expect(transaction).toHaveBeenCalledOnce();
    expect(createOrder).not.toHaveBeenCalled();
  });
});
