
import { Module } from '@nestjs/common';

import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PromotionsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
