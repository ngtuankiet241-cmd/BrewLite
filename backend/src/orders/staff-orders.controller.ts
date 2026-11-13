import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { StaffGuard } from '../auth/staff.guard.js';
import {
  StaffCancelOrderDto,
  StaffOrderQuery,
  StaffOrderStatusDto,
} from './dto/staff-order.dto.js';
import { OrdersService } from './orders.service.js';
import { StaffOrdersService } from './staff-orders.service.js';

const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('staff/orders')
@UseGuards(JwtAuthGuard, StaffGuard)
export class StaffOrdersController {
  constructor(
    private readonly staffOrders: StaffOrdersService,
    private readonly orders: OrdersService,
  ) {}

  @Get()
  list(@Query(validation) query: StaffOrderQuery) {
    return this.staffOrders.list(query);
  }

  @Post(':orderCode/cancel')
  @HttpCode(200)
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('orderCode') orderCode: string,
    @Body(validation) dto: StaffCancelOrderDto,
  ) {
    return this.orders.cancelForStaff(orderCode, request.user.sub, dto.reason);
  }

  @Patch(':orderCode/status')
  status(
    @Param('orderCode') orderCode: string,
    @Body(validation) dto: StaffOrderStatusDto,
  ) {
    return this.orders.updateStatus(orderCode, dto.status);
  }

  @Post(':orderCode/refunds/:refundId/retry')
  @HttpCode(200)
  retry(
    @Req() request: AuthenticatedRequest,
    @Param('orderCode') orderCode: string,
    @Param('refundId') refundId: string,
  ) {
    return this.staffOrders.retryRefund(orderCode, refundId, request.user.sub);
  }
}
