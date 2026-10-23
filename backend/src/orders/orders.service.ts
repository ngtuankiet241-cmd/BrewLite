import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { PromotionsService } from '../promotions/promotions.service.js';
import {
  Order,
  OrderItem,
  OrderSizeId,
  OrderToppingId,
} from './order.types.js';

const SIZES = {
  [OrderSizeId.Small]: { name: 'Nhỏ', extraPrice: 0 },
  [OrderSizeId.Medium]: { name: 'Vừa', extraPrice: 5000 },
  [OrderSizeId.Large]: { name: 'Lớn', extraPrice: 10000 },
} satisfies Record<OrderSizeId, { name: string; extraPrice: number }>;

const TOPPINGS = {
  [OrderToppingId.WhitePearl]: { name: 'Trân châu trắng', extraPrice: 10000 },
  [OrderToppingId.AloeVera]: { name: 'Thạch nha đam', extraPrice: 10000 },
  [OrderToppingId.Cheese]: { name: 'Kem Cheese', extraPrice: 10000 },
} satisfies Record<OrderToppingId, { name: string; extraPrice: number }>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotions: PromotionsService,
  ) {}

  private readonly orders = new Map<string, Order>();

  async create(dto: CreateOrderDto): Promise<Order> {
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: [...new Set(dto.items.map((item) => item.productId))] },
      },
      select: { id: true, name: true, price: true },
    });
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    const items = dto.items.map((item): OrderItem => {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new BadRequestException(
          `Sản phẩm không tồn tại: ${item.productId}`,
        );
      }

      const size = {
        id: item.sizeId,
        ...SIZES[item.sizeId],
      };
      const toppings = item.toppingIds.map((id) => ({
        id,
        ...TOPPINGS[id],
      }));
      const basePrice = product.price.toNumber();
      const unitPrice =
        basePrice +
        size.extraPrice +
        toppings.reduce((total, topping) => total + topping.extraPrice, 0);
      const lineTotal = unitPrice * item.quantity;

      if (!Number.isSafeInteger(lineTotal)) {
        throw new BadRequestException(
          'Tổng tiền sản phẩm vượt giới hạn hợp lệ.',
        );
      }

      return {
        productId: product.id,
        productName: product.name,
        basePrice,
        quantity: item.quantity,
        size,
        toppings,
        unitPrice,
        lineTotal,
      };
    });

    const totalAmount = items.reduce(
      (total, item) => total + item.lineTotal,
      0,
    );
    if (!Number.isSafeInteger(totalAmount)) {
      throw new BadRequestException('Tổng tiền đơn hàng vượt giới hạn hợp lệ.');
    }

    const orderCode = `ORD-${randomUUID()}`;
    const promotion =
      dto.promotionCode !== undefined
        ? await this.promotions.consume(dto.promotionCode, totalAmount)
        : null;

    const order: Order = {
      orderCode,
      status: 'PENDING',
      items,
      totalAmount: promotion?.totalAmount ?? totalAmount,
      ...(promotion
        ? {
            subtotalAmount: totalAmount,
            discountAmount: promotion.discountAmount,
            promotionCode: promotion.code,
          }
        : {}),
      createdAt: new Date().toISOString(),
    };

    this.orders.set(order.orderCode, order);
    return order;
  }
}
