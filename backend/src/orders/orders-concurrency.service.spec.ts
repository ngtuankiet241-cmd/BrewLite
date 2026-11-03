import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PromotionsService } from '../promotions/promotions.service.js';
import { OrderSizeId } from './order.types.js';
import { OrdersService } from './orders.service.js';

describe('Optimistic ingredient inventory locking', () => {
  let stock: Prisma.Decimal;
  let stockVersion: number;
  const findProducts = vi.fn();
  const findToppingRecipes = vi.fn();
  const findIngredients = vi.fn();
  const updateStock = vi.fn();
  const createOrder = vi.fn();
  const transaction = vi.fn();
  const tx = {
    product: { findMany: findProducts },
    toppingRecipeIngredient: { findMany: findToppingRecipes },
    ingredient: { findMany: findIngredients, updateMany: updateStock },
    order: { create: createOrder },
  };
  const ingredient = () => ({
    id: 'coffee-beans',
    name: 'Coffee beans',
    unit: 'g',
    stock,
    stockVersion,
  });
  const product = () => ({
    id: 'coffee',
    name: 'Coffee',
    price: new Prisma.Decimal(25000),
    recipeIngredients: [
      {
        sizeId: 'S',
        ingredientId: 'coffee-beans',
        quantity: new Prisma.Decimal(1),
        ingredient: { id: 'coffee-beans', name: 'Coffee beans', unit: 'g' },
      },
      {
        sizeId: 'M',
        ingredientId: 'coffee-beans',
        quantity: new Prisma.Decimal(2),
        ingredient: { id: 'coffee-beans', name: 'Coffee beans', unit: 'g' },
      },
      {
        sizeId: 'L',
        ingredientId: 'coffee-beans',
        quantity: new Prisma.Decimal(3),
        ingredient: { id: 'coffee-beans', name: 'Coffee beans', unit: 'g' },
      },
    ],
  });
  const items = (quantity = 1, sizeId: OrderSizeId = OrderSizeId.Small) => [
    { productId: 'coffee', quantity, sizeId, toppingIds: [] },
  ];
  let service: OrdersService;

  beforeEach(() => {
    vi.resetAllMocks();
    stock = new Prisma.Decimal(10);
    stockVersion = 0;
    findProducts.mockImplementation(() => Promise.resolve([product()]));
    findToppingRecipes.mockResolvedValue([]);
    findIngredients.mockImplementation(() => Promise.resolve([ingredient()]));
    updateStock.mockImplementation(
      ({
        where,
        data,
      }: {
        where: { stockVersion: number; stock: { gte: Prisma.Decimal } };
        data: {
          stock: { decrement: Prisma.Decimal };
          stockVersion: { increment: number };
        };
      }) => {
        if (
          where.stockVersion !== stockVersion ||
          stock.lessThan(where.stock.gte)
        ) {
          return Promise.resolve({ count: 0 });
        }
        stock = stock.minus(data.stock.decrement);
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
    'does not oversell ingredient stock=$initial when orders compete for quantity=$quantity',
    async ({ initial, quantity }) => {
      stock = new Prisma.Decimal(initial);
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
      expect(stock.toNumber()).toBe(initial - accepted.length * quantity);
      expect(stock.greaterThanOrEqualTo(0)).toBe(true);
      expect(stockVersion).toBe(accepted.length);
      expect(createOrder).toHaveBeenCalledTimes(accepted.length);
    },
  );

  it('deducts the size-specific recipe amount rather than one unit per drink', async () => {
    stock = new Prisma.Decimal(10);
    await service.create({ items: items(2, OrderSizeId.Large) });
    expect(stock.toNumber()).toBe(4);
    expect(updateStock).toHaveBeenCalledWith({
      where: {
        id: 'coffee-beans',
        stockVersion: 0,
        stock: { gte: new Prisma.Decimal(6) },
      },
      data: {
        stock: { decrement: new Prisma.Decimal(6) },
        stockVersion: { increment: 1 },
      },
    });
  });

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
      where: {
        id: 'coffee-beans',
        stockVersion: 1,
        stock: { gte: new Prisma.Decimal(2) },
      },
      data: {
        stock: { decrement: new Prisma.Decimal(2) },
        stockVersion: { increment: 1 },
      },
    });
    expect(stock.toNumber()).toBe(8);
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
    expect(stock.toNumber()).toBe(10);
  });

  it('propagates unrelated database errors without retrying the transaction', async () => {
    findIngredients.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.create({ items: items() })).rejects.toThrow(
      'Database unavailable',
    );
    expect(transaction).toHaveBeenCalledOnce();
    expect(createOrder).not.toHaveBeenCalled();
  });
});
