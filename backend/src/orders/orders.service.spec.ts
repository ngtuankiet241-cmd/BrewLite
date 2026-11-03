import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PromotionsService } from '../promotions/promotions.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderSizeId, OrderToppingId } from './order.types.js';
import { OrdersService } from './orders.service.js';

describe('Persistent order creation', () => {
  const findProducts = vi.fn();
  const decrementStock = vi.fn();
  const createOrder = vi.fn();
  const consume = vi.fn();
  const transaction = vi.fn();
  const tx = {
    order: { create: createOrder },
    product: { findMany: findProducts, updateMany: decrementStock },
  };
  const items = [
    {
      productId: 'coffee',
      quantity: 2,
      sizeId: OrderSizeId.Medium,
      toppingIds: [OrderToppingId.Cheese],
    },
  ];
  let service: OrdersService;

  beforeEach(() => {
    vi.resetAllMocks();
    decrementStock.mockResolvedValue({ count: 1 });
    findProducts.mockResolvedValue([
      {
        id: 'coffee',
        name: 'Cà phê',
        price: { toNumber: () => 35000 },
        stock: 100,
        stockVersion: 0,
      },
    ]);
    createOrder.mockImplementation(({ data }: Prisma.OrderCreateArgs) =>
      Promise.resolve({
        id: data.id,
        orderCode: data.orderCode,
        createdAt: new Date('2026-10-23T12:00:00Z'),
      }),
    );
    transaction.mockImplementation((run: (client: typeof tx) => unknown) =>
      run(tx),
    );
    const prisma = {
      $transaction: transaction,
    } as unknown as PrismaService;
    service = new OrdersService(prisma, {
      consume,
    } as unknown as PromotionsService);
  });

  it('persists a guest order with its server-priced item snapshot', async () => {
    const result = await service.create({ items });
    expect(result).toMatchObject({
      orderCode: expect.stringMatching(/^ORD-/),
      status: 'PENDING',
      totalAmount: 100000,
      createdAt: '2026-10-23T12:00:00.000Z',
    });
    expect(createOrder).toHaveBeenCalledWith({
      data: {
        id: result.orderCode,
        orderCode: result.orderCode,
        status: 'PENDING',
        total: 100000,
        subtotal: 100000,
        discount: 0,
        promotionCode: null,
        items: {
          create: [
            {
              productId: 'coffee',
              size: 'M',
              qty: 2,
              basePrice: 35000,
              sizeExtraPrice: 5000,
              toppings: [
                {
                  id: 'cheese',
                  name: 'Kem Cheese',
                  extraPrice: 10000,
                },
              ],
              unitPrice: 50000,
              lineTotal: 100000,
              snapshot: result.items[0],
            },
          ],
        },
      },
      select: {
        orderCode: true,
        createdAt: true,
      },
    });
    expect(consume).not.toHaveBeenCalled();
  });

  it('consumes a promotion through the same transaction and saves the discounted total', async () => {
    consume.mockResolvedValue({
      code: 'BREW10',
      discountAmount: 10000,
      totalAmount: 90000,
    });
    await service.create({ items, promotionCode: 'BREW10' });
    expect(consume).toHaveBeenCalledWith('BREW10', 100000, tx);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 100000,
          total: 90000,
          discount: 10000,
          promotionCode: 'BREW10',
        }),
      }),
    );
  });

  it('combines quantities of the same product across sizes and toppings', async () => {
    const result = await service.create({
      items: [
        items[0],
        {
          ...items[0],
          quantity: 3,
          sizeId: OrderSizeId.Small,
          toppingIds: [],
        },
      ],
    });
    expect(decrementStock).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'coffee', stockVersion: 0, stock: { gte: 5 } },
      data: { stock: { decrement: 5 }, stockVersion: { increment: 1 } },
    });
    expect(result.items).toHaveLength(2);
  });

  it('rejects insufficient inventory without saving an order or consuming a promotion', async () => {
    findProducts.mockResolvedValue([
      {
        id: 'coffee',
        name: 'Cà phê',
        price: { toNumber: () => 35000 },
        stock: 1,
        stockVersion: 0,
      },
    ]);
    await expect(
      service.create({ items, promotionCode: 'BREW10' }),
    ).rejects.toThrow('Sản phẩm không đủ tồn kho: Cà phê');
    expect(createOrder).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
    expect(decrementStock).not.toHaveBeenCalled();
  });

  it('rejects a combined quantity larger than the inventory INTEGER range', async () => {
    findProducts.mockResolvedValue([
      { id: 'coffee', name: 'Cà phê', price: { toNumber: () => 0 } },
    ]);
    const freeItem = {
      ...items[0],
      quantity: 2147483647,
      sizeId: OrderSizeId.Small,
      toppingIds: [],
    };
    await expect(
      service.create({ items: [freeItem, { ...freeItem, quantity: 1 }] }),
    ).rejects.toThrow('không đủ tồn kho');
    expect(decrementStock).not.toHaveBeenCalled();
  });

  it('propagates a database failure instead of returning a successful order', async () => {
    createOrder.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.create({ items })).rejects.toThrow(
      'Database unavailable',
    );
  });

  it('does not save an order when the promotion is rejected', async () => {
    consume.mockRejectedValue(new BadRequestException('Mã đã hết hạn'));
    await expect(
      service.create({ items, promotionCode: 'EXPIRED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('rejects an unknown product before writing any stock or order', async () => {
    findProducts.mockResolvedValue([]);

    await expect(service.create({ items })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(decrementStock).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('rejects a line total that exceeds DECIMAL(12,2)', async () => {
    await expect(
      service.create({ items: [{ ...items[0], quantity: 200000 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(decrementStock).not.toHaveBeenCalled();
  });

  it('rejects an overflowing subtotal even when each line fits in the database', async () => {
    const largeItem = { ...items[0], quantity: 150000 };
    await expect(
      service.create({ items: [largeItem, largeItem] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(decrementStock).not.toHaveBeenCalled();
  });

  it('rejects quantities that exceed the database INTEGER range', async () => {
    const pipe = new ValidationPipe({ transform: true });
    await expect(
      pipe.transform(
        { items: [{ ...items[0], quantity: 2147483648 }] },
        { type: 'body', metatype: CreateOrderDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
