
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
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
  [OrderToppingId.WhitePearl]: {
    name: 'Trân châu trắng',
    extraPrice: 10000,
  },
  [OrderToppingId.AloeVera]: {
    name: 'Thạch nha đam',
    extraPrice: 10000,
  },
  [OrderToppingId.Cheese]: {
    name: 'Kem Cheese',
    extraPrice: 10000,
  },
} satisfies Record<OrderToppingId, { name: string; extraPrice: number }>;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto, userId: string): Promise<Order> {
    const productIds = [
      ...new Set(dto.items.map((item) => item.productId)),
    ];

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, price: true },
    });

    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    const items: OrderItem[] = dto.items.map((item) => {
      const product = productsById.get(item.productId);

      if (!product) {
        throw new NotFoundException(
          `Sản phẩm không tồn tại: ${item.productId}`,
        );
      }

      const size = { id: item.sizeId, ...SIZES[item.sizeId] };
      const toppings = item.toppingIds.map((id) => ({
        id,
        ...TOPPINGS[id],
      }));

      const basePrice = product.price.toNumber();
      const unitPrice =
        basePrice +
        size.extraPrice +
        toppings.reduce((sum, topping) => sum + topping.extraPrice, 0);

      const lineTotal = unitPrice * item.quantity;

      if (!Number.isSafeInteger(lineTotal)) {
        throw new BadRequestException('Tổng tiền sản phẩm không hợp lệ.');
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
      (sum, item) => sum + item.lineTotal,
      0,
    );

    if (!Number.isSafeInteger(totalAmount)) {
      throw new BadRequestException('Tổng tiền đơn hàng không hợp lệ.');
    }

    const orderCode = `ORD-${randomUUID()}`;

    const savedOrder = await this.prisma.order.create({
      data: {
        orderCode,
        userId,
        status: 'PENDING',
        total: totalAmount,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            size: item.size.id,
            qty: item.quantity,
            lineTotal: item.lineTotal,
            basePrice: item.basePrice,
            unitPrice: item.unitPrice,
            sizeExtraPrice: item.size.extraPrice,
            toppings: item.toppings as unknown as Prisma.InputJsonValue,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: { select: { name: true } },
          },
        },
      },
    });

    return {
      orderCode: savedOrder.orderCode,
      status: 'PENDING',
      totalAmount: savedOrder.total.toNumber(),
      createdAt: savedOrder.createdAt.toISOString(),
      items: savedOrder.items.map((savedItem) => {
        const sizeId = savedItem.size as OrderSizeId;
        const size = {
          id: sizeId,
          ...SIZES[sizeId],
        };

        const toppings = savedItem.toppings as unknown as OrderItem['toppings'];

        return {
          productId: savedItem.productId,
          productName: savedItem.product.name,
          basePrice: savedItem.basePrice.toNumber(),
          quantity: savedItem.qty,
          size,
          toppings,
          unitPrice: savedItem.unitPrice.toNumber(),
          lineTotal: savedItem.lineTotal.toNumber(),
        };
      }),
    };
  }
  
  // Lấy lịch sử đặt hàng của người dùng đang đăng nhập
  async getHistory(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return orders.map((order) => ({
      orderCode: order.orderCode,
      status: order.status,
      totalAmount: order.total.toNumber(),
      createdAt: order.createdAt.toISOString(),

      items: order.items.map((item) => {
        const sizeId = item.size as OrderSizeId;

        const toppings =
          item.toppings as unknown as OrderItem['toppings'];

        return {
          productId: item.productId,
          productName: item.product.name,
          basePrice: item.basePrice.toNumber(),
          quantity: item.qty,
          size: {
            id: sizeId,
            ...SIZES[sizeId],
          },
          toppings,
          unitPrice: item.unitPrice.toNumber(),
          lineTotal: item.lineTotal.toNumber(),
        };
      }),
    }));
  }

}
