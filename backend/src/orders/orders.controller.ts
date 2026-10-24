
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import type { Order } from './order.types.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Lấy lịch sử đặt hàng của người dùng đang đăng nhập
  @Get('history')
  getHistory(@Req() request: AuthenticatedRequest) {
    return this.ordersService.getHistory(request.user.sub);
  }

  // Tạo đơn hàng mới
  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateOrderDto,
  ): Promise<Order> {
    return this.ordersService.create(dto, request.user.sub);
  }
}
