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

// Largest whole-VND amount supported by the existing DECIMAL(12,2) columns.
const MAX_ORDER_AMOUNT = 9_999_999_999;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotions: PromotionsService,
  ) {}

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

      if (!Number.isSafeInteger(lineTotal) || lineTotal > MAX_ORDER_AMOUNT) {
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
    if (!Number.isSafeInteger(totalAmount) || totalAmount > MAX_ORDER_AMOUNT) {
      throw new BadRequestException('Tổng tiền đơn hàng vượt giới hạn hợp lệ.');
    }

    // Sizes and toppings share the same product inventory.
    const quantitiesByProduct = new Map<string, number>();
    for (const item of items) {
      const quantity =
        (quantitiesByProduct.get(item.productId) ?? 0) + item.quantity;
      if (!Number.isSafeInteger(quantity) || quantity > 2_147_483_647) {
        throw new BadRequestException(
          `Sản phẩm không đủ tồn kho: ${item.productName}`,
        );
      }
      quantitiesByProduct.set(item.productId, quantity);
    }

    const orderCode = `ORD-${randomUUID()}`;
    return this.prisma.$transaction(async (tx) => {
      for (const [productId, quantity] of quantitiesByProduct) {
        const result = await tx.product.updateMany({
          where: { id: productId, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });
        if (result.count !== 1) {
          throw new BadRequestException(
            `Sản phẩm không đủ tồn kho: ${productsById.get(productId)!.name}`,
          );
        }
      }

      const promotion =
        dto.promotionCode !== undefined
          ? await this.promotions.consume(dto.promotionCode, totalAmount, tx)
          : null;
      const payableAmount = promotion?.totalAmount ?? totalAmount;
      const saved = await tx.order.create({
        data: {
          // The public orderCode is the database primary key used by Payment.orderId.
          id: orderCode,
          status: 'PENDING',
          subtotal: totalAmount,
          discount: promotion?.discountAmount ?? 0,
          promotionCode: promotion?.code ?? null,
          total: payableAmount,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              size: item.size.id,
              qty: item.quantity,
              lineTotal: item.lineTotal,
              snapshot: {
                ...item,
                size: { ...item.size },
                toppings: item.toppings.map((topping) => ({ ...topping })),
              },
            })),
          },
        },
        select: { id: true, createdAt: true },
      });

      return {
        orderCode: saved.id,
        status: 'PENDING',
        items,
        totalAmount: payableAmount,
        ...(promotion
          ? {
              subtotalAmount: totalAmount,
              discountAmount: promotion.discountAmount,
              promotionCode: promotion.code,
            }
          : {}),
        createdAt: saved.createdAt.toISOString(),
      } satisfies Order;
    });
  }
}
