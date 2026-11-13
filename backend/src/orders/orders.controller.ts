import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import type { Order } from './order.types.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Lấy lịch sử đặt hàng của người dùng đang đăng nhập
  @Get(['history', 'me'])
  getHistory(@Req() request: AuthenticatedRequest) {
    return this.ordersService.getHistory(request.user.sub);
  }

  @Post(':orderCode/cancel')
  @HttpCode(200)
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('orderCode') orderCode: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CancelOrderDto,
  ) {
    return this.ordersService.cancel(orderCode, request.user.sub, dto.reason);
  }

  // Tạo đơn hàng mới
  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateOrderDto,
  ): Promise<Order> {
    return this.ordersService.create(dto, request.user.sub, idempotencyKey);
  }
}
