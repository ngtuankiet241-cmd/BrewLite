import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { OrderSizeId, OrderToppingId } from '../src/orders/order.types.js';
import { OrdersModule } from '../src/orders/orders.module.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PromotionsService } from '../src/promotions/promotions.service.js';

describe('Orders persisted in PostgreSQL', () => {
  const fixtureId = randomUUID();
  const productId = `persistence-test-${fixtureId}`;
  const otherProductId = `other-product-${fixtureId}`;
  const promotionCode = `TEST_${fixtureId}`.toUpperCase();
  const userId = `persistence-user-${fixtureId}`;
  let token: string;
  const db = new PrismaClient();
  const items = [
    {
      productId,
      quantity: 2,
      sizeId: OrderSizeId.Medium,
      toppingIds: [OrderToppingId.Cheese],
    },
  ];
  let app: INestApplication<App> | undefined;
  let orders: OrdersService;
  let promotions: PromotionsService;

  beforeAll(async () => {
    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.invalid`,
        passwordHash: 'not-a-login',
      },
    });
    await db.product.createMany({
      data: [
        { id: productId, name: 'Test coffee', price: 35000, stock: 100 },
        { id: otherProductId, name: 'Test tea', price: 30000, stock: 1 },
      ],
    });
    await db.promotion.create({
      data: {
        code: promotionCode,
        discountType: 'PERCENTAGE',
        value: 10,
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000),
        usageLimit: 10,
      },
    });
  });

  beforeEach(async () => {
    await db.product.update({
      where: { id: productId },
      data: { stock: 100 },
    });
    await db.product.update({
      where: { id: otherProductId },
      data: { stock: 1 },
    });
    await db.promotion.update({
      where: { code: promotionCode },
      data: { usedCount: 0, usageLimit: 10, isActive: true },
    });
    const module = await Test.createTestingModule({
      imports: [OrdersModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    token = app.get(JwtService).sign({ sub: userId });
    orders = app.get(OrdersService);
    promotions = app.get(PromotionsService);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
    // Delete only the records created with this suite's unique fixtures.
    await db.order.deleteMany({
      where: {
        items: { some: { productId: { in: [productId, otherProductId] } } },
      },
    });
  });

  afterAll(async () => {
    try {
      await db.promotion.deleteMany({ where: { code: promotionCode } });
      await db.product.deleteMany({
        where: { id: { in: [productId, otherProductId] } },
      });
      await db.user.deleteMany({ where: { id: userId } });
    } finally {
      await db.$disconnect();
    }
  });

  it('keeps the order and option/price snapshots after the application closes', async () => {
    const { body } = await request(app!.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({ items })
      .expect(201);
    expect(body).toMatchObject({
      status: 'PENDING',
      totalAmount: 100000,
      items: [
        {
          productId,
          productName: 'Test coffee',
          basePrice: 35000,
          quantity: 2,
          size: { id: 'M', name: 'Vừa', extraPrice: 5000 },
          toppings: [{ id: 'cheese', name: 'Kem Cheese', extraPrice: 10000 }],
          unitPrice: 50000,
          lineTotal: 100000,
        },
      ],
    });
    await app!.close();
    app = undefined;
    await db.product.update({
      where: { id: productId },
      data: { name: 'Renamed coffee', price: 40000 },
    });

    const reader = new PrismaClient();
    try {
      const saved = await reader.order.findUniqueOrThrow({
        where: { id: body.orderCode },
        include: { items: true, payments: true },
      });
      expect(saved.status).toBe('PENDING');
      expect(saved.userId).toBe(userId);
      expect(saved.total.toNumber()).toBe(100000);
      expect(saved.subtotal!.toNumber()).toBe(100000);
      expect(saved.discount.toNumber()).toBe(0);
      expect(saved.createdAt.toISOString()).toBe(body.createdAt);
      expect(saved.items).toHaveLength(1);
      expect(saved.items[0].snapshot).toEqual(body.items[0]);
      expect(saved.items[0]).toMatchObject({ productId, size: 'M', qty: 2 });
      expect(saved.items[0].lineTotal.toNumber()).toBe(100000);
      expect(saved.payments).toEqual([]);
      expect(
        (await reader.product.findUniqueOrThrow({ where: { id: productId } }))
          .stock,
      ).toBe(98);
    } finally {
      await reader.$disconnect();
      await db.product.update({
        where: { id: productId },
        data: { name: 'Test coffee', price: 35000 },
      });
    }
  });

  it('saves promotion totals and consumes exactly one use', async () => {
    const { body } = await request(app!.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({ items, promotionCode })
      .expect(201);
    const saved = await db.order.findUniqueOrThrow({
      where: { id: body.orderCode },
    });
    expect(body).toMatchObject({
      subtotalAmount: 100000,
      discountAmount: 10000,
      totalAmount: 90000,
      promotionCode,
    });
    expect(saved.subtotal!.toNumber()).toBe(100000);
    expect(saved.discount.toNumber()).toBe(10000);
    expect(saved.total.toNumber()).toBe(90000);
    expect(saved.promotionCode).toBe(promotionCode);
    expect(
      (await db.promotion.findUniqueOrThrow({ where: { code: promotionCode } }))
        .usedCount,
    ).toBe(1);
  });

  it('rolls back stock, the order, items and promotion usage when a nested item write fails', async () => {
    const consume = promotions.consume.bind(promotions);
    vi.spyOn(promotions, 'consume').mockImplementationOnce(
      async (code, amount, tx) => {
        const quote = await consume(code, amount, tx);
        // Simulate a product disappearing after pricing but before its item is saved.
        await tx!.product.delete({ where: { id: productId } });
        return quote;
      },
    );
    await expect(orders.create({ items, promotionCode })).rejects.toMatchObject(
      { code: 'P2003' },
    );
    expect(await db.order.count({ where: { promotionCode } })).toBe(0);
    expect(await db.orderItem.count({ where: { productId } })).toBe(0);
    expect(
      (await db.promotion.findUniqueOrThrow({ where: { code: promotionCode } }))
        .usedCount,
    ).toBe(0);
    expect(
      await db.product.findUnique({ where: { id: productId } }),
    ).toMatchObject({ stock: 100 });
  });

  it('deducts the combined quantity across sizes and rejects another order after stock runs out', async () => {
    await db.product.update({
      where: { id: productId },
      data: { stock: 5 },
    });
    const { body } = await request(app!.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({
        items: [
          items[0],
          {
            ...items[0],
            quantity: 3,
            sizeId: OrderSizeId.Small,
            toppingIds: [],
          },
        ],
      })
      .expect(201);
    expect(body.items).toHaveLength(2);
    expect(body.totalAmount).toBe(205000);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock,
    ).toBe(0);
    const savedItems = await db.orderItem.findMany({
      where: { orderId: body.orderCode },
    });
    expect(savedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ size: 'M', qty: 2 }),
        expect.objectContaining({ size: 'S', qty: 3 }),
      ]),
    );

    const rejected = await request(app!.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({ items })
      .expect(400);
    expect(rejected.body.message).toBe(
      'Sản phẩm không đủ tồn kho: Test coffee',
    );
    expect(
      await db.order.count({ where: { items: { some: { productId } } } }),
    ).toBe(1);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock,
    ).toBe(0);
  });

  it.each([0, 1, 4])(
    'rejects a combined quantity of 5 when stock is %i without changing inventory or promotions',
    async (stock) => {
      await db.product.update({ where: { id: productId }, data: { stock } });
      const { body } = await request(app!.getHttpServer())
        .post('/orders')
        .auth(token, { type: 'bearer' })
        .send({
          items: [items[0], { ...items[0], quantity: 3 }],
          promotionCode,
        })
        .expect(400);
      expect(body.message).toBe('Sản phẩm không đủ tồn kho: Test coffee');
      expect(
        (await db.product.findUniqueOrThrow({ where: { id: productId } }))
          .stock,
      ).toBe(stock);
      expect(await db.orderItem.count({ where: { productId } })).toBe(0);
      expect(await db.order.count({ where: { promotionCode } })).toBe(0);
      expect(
        (
          await db.promotion.findUniqueOrThrow({
            where: { code: promotionCode },
          })
        ).usedCount,
      ).toBe(0);
    },
  );

  it('restores deductions for earlier products when a later product has insufficient stock', async () => {
    await request(app!.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({
        items: [items[0], { ...items[0], productId: otherProductId }],
        promotionCode,
      })
      .expect(400);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock,
    ).toBe(100);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: otherProductId } }))
        .stock,
    ).toBe(1);
    expect(await db.order.count({ where: { promotionCode } })).toBe(0);
    expect(
      await db.orderItem.count({
        where: { productId: { in: [productId, otherProductId] } },
      }),
    ).toBe(0);
  });

  it('restores stock when the promotion is rejected', async () => {
    await db.promotion.update({
      where: { code: promotionCode },
      data: { isActive: false },
    });
    await request(app!.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({ items, promotionCode })
      .expect(400);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock,
    ).toBe(100);
    expect(await db.order.count({ where: { promotionCode } })).toBe(0);
    expect(await db.orderItem.count({ where: { productId } })).toBe(0);
  });

  it('persists only one order when two checkouts compete for the final promotion use', async () => {
    await db.promotion.update({
      where: { code: promotionCode },
      data: { usageLimit: 1 },
    });
    const results = await Promise.allSettled([
      orders.create({ items, promotionCode }),
      orders.create({ items, promotionCode }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(await db.order.count({ where: { promotionCode } })).toBe(1);
    expect(
      (await db.promotion.findUniqueOrThrow({ where: { code: promotionCode } }))
        .usedCount,
    ).toBe(1);
  });
});
