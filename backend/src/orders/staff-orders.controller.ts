import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { StaffGuard } from '../auth/staff.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { refundSummary } from '../payments/simulated-refunds.js';
import { StaffOrderDto, StaffOrdersQueryDto } from './dto/staff-order.dto.js';
import { OrdersService } from './orders.service.js';
import type { OrderItem } from './order.types.js';

@Controller('staff/orders')
@UseGuards(JwtAuthGuard, StaffGuard)
export class StaffOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Get()
  async list(
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: StaffOrdersQueryDto,
  ) {
    const orders = await this.prisma.order.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        refund: true,
        items: { include: { product: { select: { name: true } } } },
      },
    });
    return {
      orders: orders.map((order) => ({
        orderCode: order.orderCode,
        status: order.status,
        total: Number(order.total),
        createdAt: order.createdAt.toISOString(),
        refund: refundSummary(order.refund),
        cancellation: order.cancelledAt
          ? {
              reason: order.cancellationReason,
              cancelledAt: order.cancelledAt.toISOString(),
              cancelledById: order.cancelledById,
              inventoryStatus: order.inventoryRestoreStatus,
              promotionReleased: order.promotionReleasedAt !== null,
              pointsReturned: order.pointsRefundedAt ? order.pointsRedeemed : 0,
              pointsReversed: order.pointsReversedAt ? order.pointsEarned : 0,
            }
          : null,
        items: order.items.map((item) => {
          const snapshot =
            item.snapshot as unknown as Partial<OrderItem> | null;
          const toppings = (snapshot?.toppings ?? item.toppings) as Array<{
            name: string;
          }>;
          return {
            name: snapshot?.productName ?? item.product.name,
            size: snapshot?.size?.name ?? item.size,
            quantity: item.qty,
            toppings: Array.isArray(toppings)
              ? toppings.map((topping) => topping.name)
              : [],
          };
        }),
      })),
    };
  }

  @Patch(':orderCode/status')
  update(
    @Param('orderCode') orderCode: string,
    @Req() request: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: StaffOrderDto,
  ) {
    return this.orders.updateStatus(orderCode, dto.status, {
      actorId: request.user.sub,
      reason: dto.reason,
      expectedStatus: dto.expectedStatus,
    });
  }
}
