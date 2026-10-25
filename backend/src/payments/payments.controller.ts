
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(
      dto,
      request.user.sub,
      idempotencyKey,
    );
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(
    @Req() request: AuthenticatedRequest,
    @Query('orderCode') orderCode: string,
  ) {
    return this.paymentsService.getOrderPaymentStatus(
      orderCode,
      request.user.sub,
    );
  }

  @Post('ipn')
  @HttpCode(HttpStatus.OK)
  ipn(
    @Headers('x-secret-key') secretKey: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.paymentsService.handleIpn(
      secretKey,
      body,
    );
  }
}
