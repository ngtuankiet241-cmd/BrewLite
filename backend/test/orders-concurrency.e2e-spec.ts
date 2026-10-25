import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { OrdersController } from '../src/orders/orders.controller.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PromotionsService } from '../src/promotions/promotions.service.js';

describe('Concurrent orders with optimistic inventory locking in PostgreSQL', () => {
  const db = new PrismaClient();
  const poolUrl = new URL(process.env.DATABASE_URL!);
  poolUrl.searchParams.set('connection_limit', '8');
  const firstDb = new PrismaClient({ datasourceUrl: poolUrl.toString() });
  const secondDb = new PrismaClient({ datasourceUrl: poolUrl.toString() });
  let first: INestApplication<App>;
  let second: INestApplication<App>;
  let productId: string;
  let otherProductId: string;
  let promotionCode: string;
  let userIds: string[];
  let tokens: string[];
  let readGate: (() => Promise<void>) | undefined;
  let beforeStockUpdate: ((id: string) => Promise<void>) | undefined;
  let versionConflicts: number;

  function synchronizeReads(parties: number) {
    let arrivals = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    readGate = async () => {
      arrivals++;
      if (arrivals === parties) release();
      if (arrivals <= parties) await ready;
    };
  }

  async function application(client: PrismaClient) {
    const observed = client.$extends({
      query: {
        product: {
          async findMany({ args, query }) {
            const result = await query(args);
            // Make competing checkouts read the same version before any UPDATE.
            // Subsequent retry reads proceed normally. No stock write is mocked.
            await readGate?.();
            return result;
          },
          async updateMany({ args, query }) {
            if (typeof args.where?.id === 'string') {
              await beforeStockUpdate?.(args.where.id);
            }
            const result = await query(args);
            if (args.where?.stockVersion !== undefined && result.count === 0)
              versionConflicts++;
            return result;
          },
        },
      },
    });
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'inventory-test-jwt' })],
      controllers: [OrdersController],
      providers: [
        OrdersService,
        PromotionsService,
        { provide: PrismaService, useValue: observed },
      ],
    }).compile();
    const app = module.createNestApplication();
    await app.init();
    return app;
  }

  beforeAll(async () => {
    await Promise.all([db.$connect(), firstDb.$connect(), secondDb.$connect()]);
    first = await application(firstDb);
    second = await application(secondDb);
  });

  beforeEach(async () => {
    const fixture = `inventory-test-${randomUUID()}`;
    productId = `${fixture}-a`;
    otherProductId = `${fixture}-b`;
    promotionCode = fixture.toUpperCase();
    userIds = Array.from({ length: 12 }, (_, i) => `${fixture}-user-${i}`);
    readGate = undefined;
    beforeStockUpdate = undefined;
    versionConflicts = 0;
    await db.user.createMany({
      data: userIds.map((id) => ({
        id,
        email: `${id}@example.invalid`,
        passwordHash: 'not-a-login',
        loyaltyPoints: 100,
      })),
    });
    await db.product.createMany({
      data: [productId, otherProductId].map((id) => ({
        id,
        name: 'Inventory fixture',
        price: 25000,
        stock: 20,
      })),
    });
    tokens = userIds.map((id) => first.get(JwtService).sign({ sub: id }));
  });

  afterEach(async () => {
    readGate = undefined;
    beforeStockUpdate = undefined;
    await db.$transaction(async (tx) => {
      await tx.payment.deleteMany({
        where: { order: { userId: { in: userIds } } },
      });
      await tx.order.deleteMany({ where: { userId: { in: userIds } } });
      await tx.promotion.deleteMany({ where: { code: promotionCode } });
      await tx.product.deleteMany({
        where: { id: { in: [productId, otherProductId] } },
      });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    });
  });

  afterAll(async () => {
    await first?.close();
    await second?.close();
    await Promise.all([
      db.$disconnect(),
      firstDb.$disconnect(),
      secondDb.$disconnect(),
    ]);
  });

  const items = (quantity = 1) => [
    { productId, quantity, sizeId: 'S', toppingIds: [] as string[] },
  ];
  const submit = (
    index: number,
    cart = items(),
    extra = {},
    key: string | null = randomUUID(),
  ) => {
    const app = index % 2 ? second : first;
    const call = request(app.getHttpServer())
      .post('/orders')
      .auth(tokens[index], { type: 'bearer' });
    if (key !== null) call.set('Idempotency-Key', key);
    return call.send({ items: cart, ...extra });
  };
  const orderCount = () =>
    db.order.count({ where: { userId: { in: userIds } } });
  const product = (id = productId) =>
    db.product.findUniqueOrThrow({ where: { id } });

  it.each([
    { initial: 1, quantity: 1 },
    { initial: 5, quantity: 2 },
    { initial: 7, quantity: 3 },
  ])(
    'never oversells stock=$initial when 12 different customers concurrently order quantity=$quantity',
    async ({ initial, quantity }) => {
      await db.product.update({
        where: { id: productId },
        data: { stock: initial },
      });
      synchronizeReads(12);
      const responses = await Promise.all(
        userIds.map((_, i) => submit(i, items(quantity))),
      );
      const accepted = responses.filter((r) => r.status === 201);
      const rejected = responses.filter((r) => r.status === 400);
      expect(accepted).toHaveLength(Math.floor(initial / quantity));
      expect(rejected).toHaveLength(12 - accepted.length);
      for (const response of rejected)
        expect(response.body.message).toContain('không đủ tồn kho');
      expect(new Set(accepted.map((r) => r.body.orderCode)).size).toBe(
        accepted.length,
      );
      expect(versionConflicts).toBeGreaterThanOrEqual(11);
      expect(await orderCount()).toBe(accepted.length);
      const saved = await db.orderItem.aggregate({
        where: { productId },
        _sum: { qty: true },
      });
      const sold = saved._sum.qty ?? 0;
      const remaining = await product();
      expect(sold).toBe(accepted.length * quantity);
      expect(remaining.stock).toBeGreaterThanOrEqual(0);
      expect(sold + remaining.stock).toBe(initial);
      expect(remaining.stockVersion).toBe(accepted.length);
      expect(
        await db.idempotencyRequest.count({
          where: { userId: { in: userIds } },
        }),
      ).toBe(accepted.length);
    },
  );

  it('protects concurrent orders without an Idempotency-Key as well', async () => {
    await db.product.update({ where: { id: productId }, data: { stock: 1 } });
    synchronizeReads(2);
    const responses = await Promise.all([
      submit(0, items(), {}, null),
      submit(1, items(), {}, null),
    ]);
    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 400,
    ]);
    expect(await product()).toMatchObject({ stock: 0, stockVersion: 1 });
    expect(await orderCount()).toBe(1);
    expect(versionConflicts).toBe(1);
  });

  it('retries the stale version and accepts both customers when enough stock remains', async () => {
    await db.product.update({ where: { id: productId }, data: { stock: 4 } });
    synchronizeReads(2);
    const responses = await Promise.all([
      submit(0, items(2)),
      submit(1, items(2)),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(await product()).toMatchObject({ stock: 0, stockVersion: 2 });
    expect(await orderCount()).toBe(2);
    expect(versionConflicts).toBe(1);
  });

  it('combines quantities across sizes before reserving the last units', async () => {
    await db.product.update({ where: { id: productId }, data: { stock: 3 } });
    const cart = [
      items()[0],
      { ...items(2)[0], sizeId: 'M', toppingIds: ['cheese'] },
    ];
    synchronizeReads(2);
    const responses = await Promise.all([submit(0, cart), submit(1, cart)]);
    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 400,
    ]);
    expect(await product()).toMatchObject({ stock: 0, stockVersion: 1 });
    expect(await orderCount()).toBe(1);
    expect(await db.orderItem.count({ where: { productId } })).toBe(2);
  });

  it('handles carts listing products in opposite orders without deadlocks or partial deductions', async () => {
    await db.product.updateMany({
      where: { id: { in: [productId, otherProductId] } },
      data: { stock: 1 },
    });
    const cart = [items()[0], { ...items()[0], productId: otherProductId }];
    synchronizeReads(2);
    const responses = await Promise.all([
      submit(0, cart),
      submit(1, [...cart].reverse()),
    ]);
    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 400,
    ]);
    expect(await product()).toMatchObject({ stock: 0, stockVersion: 1 });
    expect(await product(otherProductId)).toMatchObject({
      stock: 0,
      stockVersion: 1,
    });
    expect(await orderCount()).toBe(1);
  });

  it('rolls back earlier product deductions and versions when a later product is unavailable', async () => {
    await db.product.update({
      where: { id: otherProductId },
      data: { stock: 0 },
    });
    const cart = [items()[0], { ...items()[0], productId: otherProductId }];
    await submit(0, cart).expect(400);
    expect(await product()).toMatchObject({ stock: 20, stockVersion: 0 });
    expect(await product(otherProductId)).toMatchObject({
      stock: 0,
      stockVersion: 0,
    });
    expect(await orderCount()).toBe(0);
    expect(await db.orderItem.count({ where: { productId } })).toBe(0);
    expect(
      await db.idempotencyRequest.count({ where: { userId: userIds[0] } }),
    ).toBe(0);
  });

  it('rolls back an earlier deduction before retrying a conflict on a later product', async () => {
    let changed = false;
    beforeStockUpdate = async (id) => {
      if (id !== otherProductId || changed) return;
      changed = true;
      // A separate writer changes B after checkout read it and reserved A.
      await db.product.update({
        where: { id },
        data: { stockVersion: { increment: 1 } },
      });
    };
    await submit(0, [
      items()[0],
      { ...items()[0], productId: otherProductId },
    ]).expect(201);
    expect(versionConflicts).toBe(1);
    expect(await product()).toMatchObject({ stock: 19, stockVersion: 1 });
    expect(await product(otherProductId)).toMatchObject({
      stock: 19,
      stockVersion: 2,
    });
    expect(await orderCount()).toBe(1);
    expect(
      await db.orderItem.count({
        where: { productId: { in: [productId, otherProductId] } },
      }),
    ).toBe(2);
  });

  it('deducts promotion usage and points only for the customer who wins the last stock', async () => {
    await db.product.update({ where: { id: productId }, data: { stock: 1 } });
    await db.promotion.create({
      data: {
        code: promotionCode,
        discountType: 'FIXED',
        value: 1000,
        startsAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    synchronizeReads(2);
    const extra = { promotionCode, pointsToRedeem: 20 };
    const responses = await Promise.all([
      submit(0, items(), extra),
      submit(1, items(), extra),
    ]);
    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 400,
    ]);
    const winner = responses.findIndex((r) => r.status === 201);
    expect(responses[winner].body.totalAmount).toBe(23800);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userIds[winner] } }))
        .loyaltyPoints,
    ).toBe(80);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userIds[1 - winner] } }))
        .loyaltyPoints,
    ).toBe(100);
    expect(
      (await db.promotion.findUniqueOrThrow({ where: { code: promotionCode } }))
        .usedCount,
    ).toBe(1);
    expect(await product()).toMatchObject({ stock: 0, stockVersion: 1 });
    expect(await orderCount()).toBe(1);
  });
});
