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

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let createdOrderCodes: string[];
  const checkoutProductId = `checkout-test-${randomUUID()}`;
  const userId = `checkout-user-${randomUUID()}`;
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
        }),
      ]),
    );
    for (const product of response.body) {
      expect(product).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        price: expect.any(Number),
        imageUrl: expect.any(String),
        stock: expect.any(Number),
      });
    }
  });

  it('/orders (POST) creates a pending order and calculates prices', async () => {
    await app.get(PrismaService).product.create({
      data: {
        id: checkoutProductId,
        name: 'Cà phê sữa',
        price: 35000,
        stock: 2,
      },
    });
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
        expect.objectContaining({ id: checkoutProductId, stock: 0 }),
      ]),
    );
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
      await app.get(PrismaService).product.deleteMany({
        where: { id: checkoutProductId },
      });
      await app.get(PrismaService).user.deleteMany({ where: { id: userId } });
    } finally {
      await app.close();
    }
  });
});
