import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Product } from './product.type.js';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Product[]> {
    const products = await this.prisma.product.findMany({ orderBy: { id: 'asc' } });
    return products.map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price.toNumber(),
      imageUrl: product.imageUrl ?? '',
      stock: product.stock,
    }));
  }
}
