import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PRODUCTS } from './../src/products/products.data.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
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
      expect.arrayContaining(PRODUCTS.map((product) => expect.objectContaining(product))),
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
      });
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
