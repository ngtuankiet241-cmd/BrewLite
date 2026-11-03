import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Product } from './product.type.js';
import { calculateStockBySize } from './inventory.js';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Product[]> {
    const products = await this.prisma.product.findMany({
      orderBy: { id: 'asc' },
      include: {
        recipeIngredients: {
          include: { ingredient: { select: { stock: true } } },
        },
      },
    });
    return products.map((product) => {
      const stockBySize = calculateStockBySize(product.recipeIngredients);
      return {
        id: product.id,
        name: product.name,
        price: product.price.toNumber(),
        imageUrl: product.imageUrl ?? '',
        stock: Math.max(...Object.values(stockBySize)),
        stockBySize,
      };
    });
  }
}
