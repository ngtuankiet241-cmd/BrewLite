import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PRODUCTS } from '../products/products.data.js';
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
  [OrderToppingId.WhitePearl]: { name: 'Trân châu trắng', extraPrice: 10000 },
  [OrderToppingId.AloeVera]: { name: 'Thạch nha đam', extraPrice: 10000 },
  [OrderToppingId.Cheese]: { name: 'Kem Cheese', extraPrice: 10000 },
} satisfies Record<OrderToppingId, { name: string; extraPrice: number }>;

@Injectable()
export class OrdersService {
  private readonly orders = new Map<string, Order>();

  create(dto: CreateOrderDto): Order {
    const items = dto.items.map((item): OrderItem => {
      const product = PRODUCTS.find(({ id }) => id === item.productId);
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
      const unitPrice =
        product.price +
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
        basePrice: product.price,
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

    const order: Order = {
      orderCode: `ORD-${randomUUID()}`,
      status: 'PENDING',
      items,
      totalAmount,
      createdAt: new Date().toISOString(),
    };

    this.orders.set(order.orderCode, order);
    return order;
  }
}
