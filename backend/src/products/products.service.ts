import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Product } from './product.type.js';
import { calculateStockBySize } from './inventory.js';

const productInclude = {
  category: true,
  recipeIngredients: {
    include: { ingredient: { select: { stock: true } } },
  },
} satisfies Prisma.ProductInclude;

type ProductWithRecipes = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

function toProduct(product: ProductWithRecipes): Product {
  const stockBySize = calculateStockBySize(product.recipeIngredients);
  return {
    id: product.id,
    name: product.name,
    price: product.price.toNumber(),
    imageUrl: product.imageUrl ?? '',
    category: product.category.name,
    stock: Math.max(...Object.values(stockBySize)),
    stockBySize,
  };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Product[]> {
    const products = await this.prisma.product.findMany({
      orderBy: { id: 'asc' },
      include: productInclude,
    });
    return products.map(toProduct);
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm.');
    return toProduct(product);
  }

  async getOptions() {
    const [categories, sizes, toppings] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.sizeOption.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.topping.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);
    return {
      categories: categories.map(({ id, name }) => ({ id, name })),
      sizes: sizes.map(({ id, name, extraPrice }) => ({ id, name, extraPrice })),
      toppings: toppings.map(({ id, name, extraPrice }) => ({ id, name, extraPrice })),
    };
  }
}
