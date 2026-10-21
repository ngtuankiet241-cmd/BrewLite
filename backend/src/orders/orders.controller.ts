import { Body, Controller, Post, ValidationPipe } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto.js';
import type { Order } from './order.types.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateOrderDto,
  ): Order {
    return this.ordersService.create(dto);
  }
}
