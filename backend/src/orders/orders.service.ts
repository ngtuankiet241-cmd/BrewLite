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
} from '../loyalty/loyalty.js';
import { applyCancellation } from './cancellation.js';
import { refundSummary } from '../payments/simulated-refunds.js';
import {
  Order,
  OrderItem,
  OrderSizeId,
  OrderStatus,
} from './order.types.js';

const LEGACY_SIZES = {
  [OrderSizeId.Small]: { name: 'Nhỏ', extraPrice: 0 },
  [OrderSizeId.Medium]: { name: 'Vừa', extraPrice: 5000 },
  [OrderSizeId.Large]: { name: 'Lớn', extraPrice: 10000 },
} satisfies Record<OrderSizeId, { name: string; extraPrice: number }>;

const MAX_ORDER_AMOUNT = 9_999_999_999;
const MAX_STOCK_ATTEMPTS = 5;

class StockVersionConflict extends Error {}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotions: PromotionsService,
  ) {}

  async updateStatus(
    orderCode: string,
    nextStatus: OrderStatus,
    options: { actorId?: string; reason?: string; expectedStatus?: OrderStatus } = {},
  ): Promise<Pick<Order, 'orderCode' | 'status'>> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order"
        WHERE "id" = ${orderCode} OR "orderCode" = ${orderCode} FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { OR: [{ id: orderCode }, { orderCode }] },
        include: { items: true, payments: true },
      });
      if (!order) {
        throw new NotFoundException('Không tìm thấy đơn hàng.');
      }

      if (order.status === 'CANCELLED' && nextStatus === 'CANCELLED') {
        return { orderCode: order.orderCode, status: nextStatus };
      }
      if (options.expectedStatus && options.expectedStatus !== order.status) {
        throw new ConflictException('Đơn hàng đã thay đổi. Vui lòng tải lại danh sách.');
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
      if (nextStatus === 'CANCELLED') await applyCancellation(tx, order, options.actorId, options.reason);
      return { orderCode: order.orderCode, status: nextStatus };
    });
  }

  async create(
    dto: CreateOrderDto,
    userId?: string,
    idempotencyKey?: string,
  ): Promise<Order> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.createAttempt(dto, userId, idempotencyKey);
      } catch (error) {
        if (!(error instanceof StockVersionConflict)) throw error;
        if (attempt >= MAX_STOCK_ATTEMPTS) {
          throw new ConflictException(
            'Tồn kho đang được cập nhật bởi đơn hàng khác. Vui lòng thử lại.',
          );
        }
        // Retry the entire transaction, including idempotency, so earlier stock
        // deductions cannot survive a conflict on a later product.
      }
    }
  }

  private async createAttempt(
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
    return this.prisma.$transaction((tx) => this.createOrder(dto, userId, tx), {
      isolationLevel: 'ReadCommitted',
    });
  }

  private async createOrder(
    dto: CreateOrderDto,
    userId: string | undefined,
    transaction: Prisma.TransactionClient,
  ): Promise<Order> {
    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await transaction.product.findMany({
      where: { id: { in: productIds } },
      include: {
        recipeIngredients: {
          select: {
            sizeId: true,
            quantity: true,
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        },
      },
    });
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const toppingIds = [
      ...new Set(dto.items.flatMap((item) => item.toppingIds)),
    ];
    const sizeIds = [...new Set(dto.items.map((item) => item.sizeId))];
    const [sizes, toppings] = await Promise.all([
      transaction.sizeOption.findMany({ where: { id: { in: sizeIds } } }),
      transaction.topping.findMany({ where: { id: { in: toppingIds } } }),
    ]);
    const sizesById = new Map(sizes.map((size) => [size.id, size]));
    const toppingsById = new Map(toppings.map((topping) => [topping.id, topping]));
    for (const id of sizeIds) {
      if (!sizesById.has(id)) {
        throw new BadRequestException(`Kích cỡ không khả dụng: ${id}.`);
      }
    }
    for (const id of toppingIds) {
      if (!toppingsById.has(id)) {
        throw new BadRequestException(`Topping không khả dụng: ${id}.`);
      }
    }
    const toppingRecipes = await transaction.toppingRecipeIngredient.findMany({
      where: { toppingId: { in: toppingIds } },
      include: {
        ingredient: { select: { id: true, name: true, unit: true } },
      },
    });
    const toppingRecipesById = new Map<string, typeof toppingRecipes>();
    for (const recipe of toppingRecipes) {
      toppingRecipesById.set(recipe.toppingId, [
        ...(toppingRecipesById.get(recipe.toppingId) ?? []),
        recipe,
      ]);
    }

    const ingredientConsumptionByItem: Array<
      Array<{ ingredientId: string; name: string; unit: string; quantity: number }>
    > = [];
    const requiredIngredients = new Map<
      string,
      { name: string; unit: string; quantity: Prisma.Decimal }
    >();

    const items: OrderItem[] = dto.items.map((item, itemIndex) => {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new NotFoundException(
          `Sản phẩm không tồn tại: ${item.productId}`,
        );
      }
      const baseRecipe = product.recipeIngredients.filter(
        (recipe) => recipe.sizeId === item.sizeId,
      );
      if (baseRecipe.length === 0) {
        throw new BadRequestException(
          `Chưa có định mức nguyên liệu cho ${product.name} size ${item.sizeId}.`,
        );
      }

      const itemIngredients = new Map<
        string,
        { name: string; unit: string; quantity: Prisma.Decimal }
      >();
      const addIngredient = (
        ingredient: { id: string; name: string; unit: string },
        quantity: Prisma.Decimal,
      ) => {
        const existing = itemIngredients.get(ingredient.id);
        itemIngredients.set(ingredient.id, {
          name: ingredient.name,
          unit: ingredient.unit,
          quantity: (existing?.quantity ?? new Prisma.Decimal(0)).plus(quantity),
        });
      };
      for (const recipe of baseRecipe) {
        addIngredient(recipe.ingredient, recipe.quantity.mul(item.quantity));
      }
      for (const toppingId of item.toppingIds) {
        const recipes = toppingRecipesById.get(toppingId);
        if (!recipes?.length) {
          throw new BadRequestException(
            `Chưa có định mức nguyên liệu cho topping ${toppingsById.get(toppingId)!.name}.`,
          );
        }
        for (const recipe of recipes) {
          addIngredient(recipe.ingredient, recipe.quantity.mul(item.quantity));
        }
      }
      ingredientConsumptionByItem[itemIndex] = [...itemIngredients].map(
        ([ingredientId, ingredient]) => ({
          ingredientId,
          name: ingredient.name,
          unit: ingredient.unit,
          quantity: ingredient.quantity.toNumber(),
        }),
      );
      for (const [ingredientId, ingredient] of itemIngredients) {
        const existing = requiredIngredients.get(ingredientId);
        requiredIngredients.set(ingredientId, {
          name: ingredient.name,
          unit: ingredient.unit,
          quantity: (existing?.quantity ?? new Prisma.Decimal(0)).plus(
            ingredient.quantity,
          ),
        });
      }

      const selectedSize = sizesById.get(item.sizeId)!;
      const size = { id: selectedSize.id, name: selectedSize.name, extraPrice: selectedSize.extraPrice };
      const toppings = item.toppingIds.map((id) => {
        const topping = toppingsById.get(id)!;
        return { id: topping.id, name: topping.name, extraPrice: topping.extraPrice };
      });
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

    const orderCode = `ORD-${randomUUID()}`;
    const persist = async (tx: Prisma.TransactionClient): Promise<Order> => {
      const inventory = await tx.ingredient.findMany({
        where: { id: { in: [...requiredIngredients.keys()] } },
        select: { id: true, name: true, unit: true, stock: true, stockVersion: true },
      });
      const inventoryById = new Map(
        inventory.map((ingredient) => [ingredient.id, ingredient]),
      );

      // Acquire ingredient rows in a consistent order to avoid deadlocks.
      for (const ingredientId of [...requiredIngredients.keys()].sort()) {
        const required = requiredIngredients.get(ingredientId)!;
        const ingredient = inventoryById.get(ingredientId);
        if (!ingredient) {
          throw new BadRequestException(
            `Không tìm thấy nguyên liệu: ${required.name}.`,
          );
        }
        if (ingredient.stock.lessThan(required.quantity)) {
          throw new BadRequestException(
            `Không đủ nguyên liệu ${required.name} (${required.unit}) trong kho.`,
          );
        }
        const result = await tx.ingredient.updateMany({
          where: {
            id: ingredientId,
            stockVersion: ingredient.stockVersion,
            stock: { gte: required.quantity },
          },
          data: {
            stock: { decrement: required.quantity },
            stockVersion: { increment: 1 },
          },
        });
        if (result.count !== 1) throw new StockVersionConflict();
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
            create: items.map((item, itemIndex) => ({
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
                ingredientsUsed: ingredientConsumptionByItem[itemIndex],
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
    return persist(transaction);
  }

  // Lấy lịch sử đơn hàng của tài khoản đang đăng nhập.
  async getHistory(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        refund: true,
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
      pointsReversed: order.pointsReversedAt !== null,
      refund: refundSummary(order.refund),
      cancellation: order.cancelledAt ? {
        reason: order.cancellationReason,
        cancelledAt: order.cancelledAt.toISOString(),
        inventoryStatus: order.inventoryRestoreStatus,
        promotionReleased: order.promotionReleasedAt !== null,
      } : null,
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
          size: { id: sizeId, ...LEGACY_SIZES[sizeId] },
          toppings: item.toppings as unknown as OrderItem['toppings'],
          unitPrice: item.unitPrice.toNumber(),
          lineTotal: item.lineTotal.toNumber(),
        };
      }),
    }));
  }
}
