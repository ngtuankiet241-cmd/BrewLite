
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { SePayRefundClient } from './sepay-refund.client.js';
import { RefundsWorker } from './refunds.worker.js';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, SePayRefundClient, RefundsWorker],
})
export class PaymentsModule {}
