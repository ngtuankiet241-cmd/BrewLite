import { Controller, Get, Param } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { Product } from './product.type.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(): Promise<Product[]> {
    return this.productsService.findAll();
  }

  @Get('options')
  getOptions() {
    return this.productsService.getOptions();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Product> {
    return this.productsService.findOne(id);
  }
}
