import { Controller, Get } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { Product } from './product.type.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(): Promise<Product[]> {
    return this.productsService.findAll();
  }
}
