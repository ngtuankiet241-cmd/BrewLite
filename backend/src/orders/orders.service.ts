import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { withIdempotency } from '../prisma/idempotency.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { PromotionsService } from '../promotions/promotions.service.js';
import { assertTransition } from './order-state-machine.js';
import {
  awardPoints,
  redeemPoints,
  redemptionDiscount,
  refundPoints,
} from '../loyalty/loyalty.js';
import {
  Order,
  OrderItem,
  OrderSizeId,
  OrderStatus,
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

const MAX_ORDER_AMOUNT = 9_999_999_999;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotions: PromotionsService,
  ) {}

  async updateStatus(
    orderCode: string,
    nextStatus: OrderStatus,
  ): Promise<Pick<Order, 'orderCode' | 'status'>> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { OR: [{ id: orderCode }, { orderCode }] },
        select: {
          id: true,
          status: true,
          orderCode: true,
          userId: true,
          total: true,
          pointsRedeemed: true,
        },
      });
      if (!order) {
        throw new NotFoundException('Không tìm thấy đơn hàng.');
      }

      assertTransition(order.status, nextStatus);
      const result = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: nextStatus },
      });
      if (result.count !== 1) {
        throw new ConflictException(
          'Trạng thái đơn hàng đã thay đổi. Vui lòng thử lại.',
        );
      }
      if (nextStatus === 'PAID') await awardPoints(tx, order);
      if (nextStatus === 'CANCELLED') await refundPoints(tx, order);
      return { orderCode: order.orderCode, status: nextStatus };
    });
  }

  async create(
    dto: CreateOrderDto,
    userId?: string,
    idempotencyKey?: string,
  ): Promise<Order> {
    if (idempotencyKey !== undefined) {
      if (!userId) {
        throw new BadRequestException('Vui lòng đăng nhập để đặt hàng.');
      }
      return withIdempotency(
        this.prisma,
        userId,
        'orders.create',
        idempotencyKey,
        {
          items: dto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            sizeId: item.sizeId,
            toppingIds: item.toppingIds,
          })),
          promotionCode: dto.promotionCode?.trim().toUpperCase() ?? null,
          pointsToRedeem: dto.pointsToRedeem ?? 0,
        },
        (tx) => this.createOrder(dto, userId, tx),
      );
    }
    return this.createOrder(dto, userId);
  }

  private async createOrder(
    dto: CreateOrderDto,
    userId?: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<Order> {
    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await (transaction ?? this.prisma).product.findMany({
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
      const toppings = item.toppingIds.map((id) => ({ id, ...TOPPINGS[id] }));
      const basePrice = product.price.toNumber();
      const unitPrice =
        basePrice +
        size.extraPrice +
        toppings.reduce((sum, topping) => sum + topping.extraPrice, 0);
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

    const totalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);
    if (!Number.isSafeInteger(totalAmount) || totalAmount > MAX_ORDER_AMOUNT) {
      throw new BadRequestException('Tổng tiền đơn hàng vượt giới hạn hợp lệ.');
    }

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
    const persist = async (tx: Prisma.TransactionClient): Promise<Order> => {
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
      const afterPromotion = promotion?.totalAmount ?? totalAmount;
      const pointsToRedeem =
        dto.pointsToRedeem === undefined ? 0 : dto.pointsToRedeem;
      const pointsDiscount = redemptionDiscount(pointsToRedeem, afterPromotion);
      await redeemPoints(tx, userId, pointsToRedeem);
      const payableAmount = afterPromotion - pointsDiscount;
      const status = payableAmount === 0 ? 'PAID' : 'PENDING';

      const saved = await tx.order.create({
        data: {
          id: orderCode,
          orderCode,
          ...(userId ? { userId } : {}),
          status,
          subtotal: totalAmount,
          discount: promotion?.discountAmount ?? 0,
          promotionCode: promotion?.code ?? null,
          ...(pointsToRedeem > 0
            ? { pointsRedeemed: pointsToRedeem, pointsDiscount }
            : {}),
          total: payableAmount,
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
              snapshot: {
                ...item,
                size: { ...item.size },
                toppings: item.toppings.map((topping) => ({ ...topping })),
              } as Prisma.InputJsonValue,
            })),
          },
        },
        select: { orderCode: true, createdAt: true },
      });

      if (status === 'PAID') {
        await tx.payment.create({
          data: {
            orderId: orderCode,
            idempotencyKey: `points:${orderCode}`,
            amount: 0,
            method: pointsToRedeem > 0 ? 'LOYALTY_POINTS' : 'DISCOUNT',
            status: 'SUCCEEDED',
          },
        });
        await awardPoints(tx, {
          id: orderCode,
          userId: userId ?? null,
          total: 0,
        });
      }

      return {
        orderCode: saved.orderCode,
        status,
        items,
        totalAmount: payableAmount,
        pointsRedeemed: pointsToRedeem,
        pointsDiscount,
        pointsEarned: 0,
        ...(promotion
          ? {
              subtotalAmount: totalAmount,
              discountAmount: promotion.discountAmount,
              promotionCode: promotion.code,
            }
          : {}),
        createdAt: saved.createdAt.toISOString(),
      } satisfies Order;
    };
    return transaction
      ? persist(transaction)
      : this.prisma.$transaction(persist);
  }

  // Lấy lịch sử đơn hàng của tài khoản đang đăng nhập.
  async getHistory(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { product: { select: { name: true } } } },
      },
    });

    return orders.map((order) => ({
      orderCode: order.orderCode,
      status: order.status,
      totalAmount: order.total.toNumber(),
      subtotalAmount: order.subtotal?.toNumber(),
      discountAmount: order.discount.toNumber(),
      promotionCode: order.promotionCode ?? undefined,
      pointsRedeemed: order.pointsRedeemed,
      pointsDiscount: order.pointsDiscount.toNumber(),
      pointsEarned: order.pointsEarned,
      pointsRefunded: order.pointsRefundedAt !== null,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => {
        const snapshot = item.snapshot as unknown as Partial<OrderItem> | null;
        if (
          snapshot &&
          typeof snapshot === 'object' &&
          snapshot.size &&
          snapshot.toppings
        ) {
          return {
            productId: item.productId,
            productName: snapshot.productName ?? item.product.name,
            basePrice: snapshot.basePrice ?? item.basePrice.toNumber(),
            quantity: item.qty,
            size: snapshot.size,
            toppings: snapshot.toppings,
            unitPrice: snapshot.unitPrice ?? item.unitPrice.toNumber(),
            lineTotal: item.lineTotal.toNumber(),
          };
        }
        const sizeId = item.size as OrderSizeId;
        return {
          productId: item.productId,
          productName: item.product.name,
          basePrice: item.basePrice.toNumber(),
          quantity: item.qty,
          size: { id: sizeId, ...SIZES[sizeId] },
          toppings: item.toppings as unknown as OrderItem['toppings'],
          unitPrice: item.unitPrice.toNumber(),
          lineTotal: item.lineTotal.toNumber(),
        };
      }),
    }));
  }
}
