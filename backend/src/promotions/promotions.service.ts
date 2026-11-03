import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma, Promotion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PromotionQuote {
  code: string;
  orderAmount: number;
  discountAmount: number;
  totalAmount: number;
}

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async findByCode(
    code: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Promotion> {
    const promotion = await db.promotion.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!promotion) {
      throw new BadRequestException('Mã khuyến mãi không tồn tại.');
    }
    return promotion;
  }

  private quote(promotion: Promotion, orderAmount: number): PromotionQuote {
    if (!Number.isSafeInteger(orderAmount) || orderAmount <= 0) {
      throw new BadRequestException('Giá trị đơn hàng không hợp lệ.');
    }
    const now = new Date();
    if (!promotion.isActive) {
      throw new BadRequestException('Mã khuyến mãi đã bị tắt.');
    }
    if (promotion.startsAt > now) {
      throw new BadRequestException(
        'Mã khuyến mãi chưa đến thời gian sử dụng.',
      );
    }
    if (promotion.expiresAt <= now) {
      throw new BadRequestException('Mã khuyến mãi đã hết hạn.');
    }
    if (
      promotion.usageLimit !== null &&
      promotion.usedCount >= promotion.usageLimit
    ) {
      throw new BadRequestException('Mã khuyến mãi đã hết lượt sử dụng.');
    }
    if (orderAmount < promotion.minOrder) {
      throw new BadRequestException(
        `Mã khuyến mãi áp dụng cho đơn từ ${promotion.minOrder.toLocaleString('vi-VN')} ₫.`,
      );
    }
    if (
      !['PERCENTAGE', 'FIXED'].includes(promotion.discountType) ||
      promotion.value <= 0 ||
      (promotion.discountType === 'PERCENTAGE' && promotion.value > 100) ||
      promotion.minOrder < 0 ||
      (promotion.maxDiscount !== null && promotion.maxDiscount <= 0)
    ) {
      throw new BadRequestException('Cấu hình mã khuyến mãi không hợp lệ.');
    }

    // Integer arithmetic keeps percentage discounts accurate to one VND.
    let discountAmount =
      promotion.discountType === 'PERCENTAGE'
        ? Number((BigInt(orderAmount) * BigInt(promotion.value)) / 100n)
        : promotion.value;
    if (promotion.maxDiscount !== null) {
      discountAmount = Math.min(discountAmount, promotion.maxDiscount);
    }
    discountAmount = Math.min(discountAmount, orderAmount);
    return {
      code: promotion.code,
      orderAmount,
      discountAmount,
      totalAmount: orderAmount - discountAmount,
    };
  }

  async validate(code: string, orderAmount: number): Promise<PromotionQuote> {
    const promotion = await this.findByCode(code);
    return this.quote(promotion, orderAmount);
  }

  async consume(
    code: string,
    orderAmount: number,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<PromotionQuote> {
    const promotion = await this.findByCode(code, db);
    const quote = this.quote(promotion, orderAmount);

    const now = new Date();
    // One conditional UPDATE prevents concurrent orders from exceeding the limit.
    // Match the quoted settings as well, so a changed code cannot use stale prices.
    const result = await db.promotion.updateMany({
      where: {
        id: promotion.id,
        code: promotion.code,
        discountType: promotion.discountType,
        value: promotion.value,
        minOrder: promotion.minOrder,
        maxDiscount: promotion.maxDiscount,
        usageLimit: promotion.usageLimit,
        usedCount: { lt: promotion.usageLimit ?? 2_147_483_647 },
        isActive: true,
        startsAt: { equals: promotion.startsAt, lte: now },
        expiresAt: { equals: promotion.expiresAt, gt: now },
      },
      data: { usedCount: { increment: 1 } },
    });
    if (result.count !== 1) {
      throw new BadRequestException(
        'Mã khuyến mãi đã thay đổi hoặc không còn khả dụng. Vui lòng áp dụng lại.',
      );
    }
    return quote;
  }
}
