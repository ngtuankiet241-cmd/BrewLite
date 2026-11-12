import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PRODUCTS } from './../src/products/products.data.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createTestProduct,
  deleteTestProduct,
} from './helpers/ingredient-inventory.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let createdOrderCodes: string[];
  const checkoutProductId = `checkout-test-${randomUUID()}`;
  const userId = `checkout-user-${randomUUID()}`;
  let inventoryIds: string[] | undefined;
  let token: string;

  beforeEach(async () => {
    createdOrderCodes = [];
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          SEPAY_ENV: 'sandbox',
          SEPAY_MERCHANT_ID: 'local-test-merchant',
          SEPAY_SECRET_KEY: 'local-test-secret',
          SEPAY_IPN_SECRET_KEY: 'local-test-ipn',
        }),
      )
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.get(PrismaService).user.create({
      data: {
        id: userId,
        email: `${userId}@example.invalid`,
        passwordHash: 'not-a-login',
      },
    });
    token = app.get(JwtService).sign({ sub: userId });
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/products (GET) returns the sample menu', async () => {
    const response = await request(app.getHttpServer())
      .get('/products')
      .expect(200);

    expect(response.body.length).toBeGreaterThanOrEqual(PRODUCTS.length);
    expect(response.body).toEqual(
      expect.arrayContaining(
        PRODUCTS.map((product) => expect.objectContaining(product)),
      ),
    );
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'coffee-milk',
          name: 'Cà phê sữa',
          price: 35000,
          imageUrl: expect.any(String),
          category: expect.any(String),
        }),
      ]),
    );
    for (const product of response.body) {
      expect(product).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        price: expect.any(Number),
        imageUrl: expect.any(String),
        category: expect.any(String),
        stock: expect.any(Number),
        stockBySize: {
          S: expect.any(Number),
          M: expect.any(Number),
          L: expect.any(Number),
        },
      });
    }
  });

  it('/products/:id (GET) returns the same product as the menu and 404 for an unknown id', async () => {
    const menu = await request(app.getHttpServer()).get('/products').expect(200);
    const detail = await request(app.getHttpServer())
      .get('/products/coffee-milk')
      .expect(200);
    expect(detail.body).toEqual(
      menu.body.find((product: { id: string }) => product.id === 'coffee-milk'),
    );
    await request(app.getHttpServer())
      .get('/products/nonexistent-product')
      .expect(404);
  });

  it('uses database catalog options and preserves the price snapshot after changes', async () => {
    const db = app.get(PrismaService);
    const toppingId = `test-topping-${randomUUID()}`;
    const ingredientId = `${toppingId}-ingredient`;
    const originalSize = await db.sizeOption.findUniqueOrThrow({ where: { id: 'M' } });
    const inventory = await createTestProduct(db, {
      id: checkoutProductId,
      name: 'Catalog test coffee',
      price: 35000,
      stock: 10,
    });
    inventoryIds = [inventory.baseIngredientId, inventory.toppingIngredientId];
    try {
      await db.product.update({
        where: { id: checkoutProductId },
        data: { categoryId: 'coffee' },
      });
      await db.sizeOption.update({
        where: { id: 'M' },
        data: { extraPrice: 8000 },
      });
      await db.topping.create({
        data: { id: toppingId, name: 'Test topping', extraPrice: 7000, sortOrder: 20 },
      });
      await db.ingredient.create({
        data: { id: ingredientId, name: 'Test topping ingredient', unit: 'g', stock: 100 },
      });
      await db.toppingRecipeIngredient.create({
        data: { toppingId, ingredientId, quantity: 1 },
      });

      const options = await request(app.getHttpServer()).get('/products/options').expect(200);
      expect(options.body.sizes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'M', extraPrice: 8000 }),
      ]));
      expect(options.body.toppings).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: toppingId, extraPrice: 7000 }),
      ]));
      const product = await request(app.getHttpServer())
        .get(`/products/${checkoutProductId}`).expect(200);
      expect(product.body.category).toBe('Cà phê');

      const order = await request(app.getHttpServer())
        .post('/orders')
        .auth(token, { type: 'bearer' })
        .send({ items: [{ productId: checkoutProductId, quantity: 1, sizeId: 'M', toppingIds: [toppingId] }] })
        .expect(201);
      createdOrderCodes.push(order.body.orderCode);
      expect(order.body.totalAmount).toBe(50000);
      expect(order.body.items[0].toppings).toEqual([
        { id: toppingId, name: 'Test topping', extraPrice: 7000 },
      ]);

      await db.topping.update({ where: { id: toppingId }, data: { name: 'Changed', extraPrice: 1000 } });
      const history = await request(app.getHttpServer())
        .get('/orders/me').auth(token, { type: 'bearer' }).expect(200);
      expect(history.body[0].items[0].toppings).toEqual([
        { id: toppingId, name: 'Test topping', extraPrice: 7000 },
      ]);
      await request(app.getHttpServer())
        .post('/orders')
        .auth(token, { type: 'bearer' })
        .send({ items: [{ productId: checkoutProductId, quantity: 1, sizeId: 'M', toppingIds: ['missing-topping'] }] })
        .expect(400);
    } finally {
      await db.sizeOption.update({
        where: { id: 'M' },
        data: { name: originalSize.name, extraPrice: originalSize.extraPrice },
      });
      await db.toppingRecipeIngredient.deleteMany({ where: { toppingId } });
      await db.ingredient.deleteMany({ where: { id: ingredientId } });
      await db.topping.deleteMany({ where: { id: toppingId } });
    }
  });

  it('/orders (POST) creates a pending order and calculates prices', async () => {
    const inventory = await createTestProduct(app.get(PrismaService), {
      id: checkoutProductId,
      name: 'Cà phê sữa',
      price: 35000,
      stock: 2,
    });
    inventoryIds = [
      inventory.baseIngredientId,
      inventory.toppingIngredientId,
    ];
    const response = await request(app.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({
        items: [
          {
            productId: checkoutProductId,
            quantity: 2,
            sizeId: 'M',
            toppingIds: ['cheese'],
          },
        ],
      })
      .expect(201);

    createdOrderCodes.push(response.body.orderCode);

    expect(response.body).toMatchObject({
      orderCode: expect.stringMatching(/^ORD-/),
      status: 'PENDING',
      totalAmount: 100000,
      items: [
        {
          productId: checkoutProductId,
          productName: 'Cà phê sữa',
          basePrice: 35000,
          quantity: 2,
          size: { id: 'M', name: 'Vừa', extraPrice: 5000 },
          toppings: [{ id: 'cheese', name: 'Kem Cheese', extraPrice: 10000 }],
          unitPrice: 50000,
          lineTotal: 100000,
        },
      ],
    });
    expect(Number.isNaN(Date.parse(response.body.createdAt))).toBe(false);

    const menu = await request(app.getHttpServer())
      .get('/products')
      .expect(200);
    expect(menu.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: checkoutProductId,
          stock: 0,
          stockBySize: { S: 0, M: 0, L: 0 },
        }),
      ]),
    );
    const detail = await request(app.getHttpServer())
      .get(`/products/${checkoutProductId}`)
      .expect(200);
    expect(detail.body.stockBySize).toEqual({ S: 0, M: 0, L: 0 });

    await request(app.getHttpServer()).get('/orders/me').expect(401);
    const history = await request(app.getHttpServer())
      .get('/orders/history')
      .auth(token, { type: 'bearer' })
      .expect(200);
    const myOrders = await request(app.getHttpServer())
      .get('/orders/me')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(myOrders.body).toEqual(history.body);
    expect(myOrders.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orderCode: response.body.orderCode }),
      ]),
    );

    const otherUserId = `checkout-other-${randomUUID()}`;
    await app.get(PrismaService).user.create({
      data: {
        id: otherUserId,
        email: `${otherUserId}@example.invalid`,
        passwordHash: 'not-a-login',
      },
    });
    try {
      const otherToken = app.get(JwtService).sign({ sub: otherUserId });
      const otherOrders = await request(app.getHttpServer())
        .get('/orders/me')
        .auth(otherToken, { type: 'bearer' })
        .expect(200);
      expect(otherOrders.body).toEqual([]);
    } finally {
      await app.get(PrismaService).user.delete({ where: { id: otherUserId } });
    }
  });

  it('/orders (POST) rejects an empty cart', () => {
    return request(app.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({ items: [] })
      .expect(400);
  });

  it('/orders (POST) rejects invalid product and option ids', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({
        items: [
          {
            productId: 'unknown-product',
            quantity: 1,
            sizeId: 'S',
            toppingIds: [],
          },
        ],
      })
      .expect(404);

    await request(app.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({
        items: [
          {
            productId: 'coffee-milk',
            quantity: 1,
            sizeId: 'XXL',
            toppingIds: ['unknown-topping'],
          },
        ],
      })
      .expect(400);
  });

  it('/orders (POST) rejects invalid quantities and client-supplied prices', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({
        items: [
          {
            productId: 'coffee-milk',
            quantity: 0,
            sizeId: 'S',
            toppingIds: [],
          },
        ],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/orders')
      .auth(token, { type: 'bearer' })
      .send({
        items: [
          {
            productId: 'coffee-milk',
            quantity: 1,
            sizeId: 'S',
            toppingIds: [],
            price: 1,
          },
        ],
      })
      .expect(400);
  });

  afterEach(async () => {
    try {
      if (createdOrderCodes.length) {
        await app.get(PrismaService).order.deleteMany({
          where: { id: { in: createdOrderCodes } },
        });
      }
      if (inventoryIds) {
        await deleteTestProduct(
          app.get(PrismaService),
          checkoutProductId,
          inventoryIds,
        );
        inventoryIds = undefined;
      }
      await app.get(PrismaService).user.deleteMany({ where: { id: userId } });
    } finally {
      await app.close();
    }
  });
});
