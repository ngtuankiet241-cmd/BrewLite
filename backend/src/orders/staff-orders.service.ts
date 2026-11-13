import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { refundSummary } from '../payments/refunds.js';
import type { StaffOrderQuery } from './dto/staff-order.dto.js';

@Injectable()
export class StaffOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: StaffOrderQuery) {
    const pageSize = 20;
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { orderCode: { contains: query.search, mode: 'insensitive' } },
              {
                user: {
                  email: { contains: query.search, mode: 'insensitive' },
                },
              },
              { user: { phone: { contains: query.search } } },
            ],
          }
        : {}),
    };
    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { email: true, phone: true } },
          items: { include: { product: { select: { name: true } } } },
          payments: { include: { refund: true } },
        },
      }),
    ]);
    return {
      page: query.page,
      pageSize,
      total,
      orders: orders.map((order) => ({
        orderCode: order.orderCode,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        customer: order.user,
        totalAmount: Number(order.total),
        pointsRedeemed: order.pointsRedeemed,
        pointsEarned: order.pointsEarned,
        pointsRefunded: order.pointsRefundedAt !== null,
        pointsReversed: order.pointsReversedAt !== null,
        promotionCode: order.promotionCode,
        cancellationReason: order.cancellationReason,
        cancelledAt: order.cancelledAt?.toISOString() ?? null,
        cancelledById: order.cancelledById,
        cancellationActor: order.cancellationActor,
        ...refundSummary(order.payments),
        items: order.items.map((item) => {
          const snapshot = item.snapshot as {
            productName?: string;
            size?: { name?: string };
            toppings?: { name: string }[];
          } | null;
          return {
            productName: snapshot?.productName ?? item.product.name,
            quantity: item.qty,
            size: snapshot?.size?.name ?? item.size,
            toppings: snapshot?.toppings?.map((topping) => topping.name) ?? [],
            lineTotal: Number(item.lineTotal),
          };
        }),
        refunds: order.payments.flatMap((payment) =>
          payment.refund
            ? [
                {
                  id: payment.refund.id,
                  status: payment.refund.status,
                  method: payment.refund.method,
                  amount: Number(payment.refund.amount),
                  lastError: payment.refund.lastError,
                  attempts: payment.refund.attempts,
                  nextAttemptAt: payment.refund.nextAttemptAt.toISOString(),
                  completedAt:
                    payment.refund.completedAt?.toISOString() ?? null,
                  lastRetriedById: payment.refund.lastRetriedById,
                  lastRetriedAt:
                    payment.refund.lastRetriedAt?.toISOString() ?? null,
                  canRetry:
                    payment.refund.status === 'NEEDS_REVIEW' &&
                    payment.refund.method === 'SEPAY_V2' &&
                    payment.refund.environment === 'sandbox',
                },
              ]
            : [],
        ),
      })),
    };
  }

  async retryRefund(orderCode: string, refundId: string, staffId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "orderCode" = ${orderCode} FOR UPDATE`;
      const actor = await tx.user.findUnique({
        where: { id: staffId },
        select: { role: true },
      });
      if (!actor || !['STAFF', 'ADMIN'].includes(actor.role))
        throw new ForbiddenException('Tài khoản không còn quyền nhân viên.');
      const refund = await tx.refund.findFirst({
        where: { id: refundId, payment: { order: { orderCode } } },
        include: { payment: { include: { order: true } } },
      });
      if (!refund)
        throw new NotFoundException(
          'Không tìm thấy yêu cầu hoàn tiền của đơn.',
        );
      if (
        refund.status !== 'NEEDS_REVIEW' ||
        refund.method !== 'SEPAY_V2' ||
        refund.environment !== 'sandbox' ||
        refund.payment.order.status !== 'CANCELLED' ||
        refund.payment.status !== 'REFUND_PENDING' ||
        !refund.transactionId ||
        refund.transactionId !== refund.payment.providerTransactionId ||
        !refund.bankAccountId ||
        refund.bankAccountId !== refund.payment.bankAccountId
      ) {
        throw new ConflictException(
          'Yêu cầu này không thể gửi lại tự động. Cần đối soát trạng thái và nguồn giao dịch.',
        );
      }
      const changed = await tx.refund.updateMany({
        where: { id: refundId, status: 'NEEDS_REVIEW' },
        data: {
          status: 'PENDING',
          failures: 0,
          nextAttemptAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
          lastRetriedById: staffId,
          lastRetriedAt: new Date(),
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('Yêu cầu đã được xử lý. Vui lòng tải lại.');
      return { refundId, status: 'PENDING' };
    });
  }
}
