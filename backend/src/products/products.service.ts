import { Injectable } from '@nestjs/common';
import { PRODUCTS } from './products.data.js';
import { Product } from './product.type.js';

@Injectable()
export class ProductsService {
  findAll(): Product[] {
    return PRODUCTS;
  }
}
