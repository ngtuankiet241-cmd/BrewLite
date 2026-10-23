import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OrdersModule } from './orders/orders.module.js';
import { ProductsModule } from './products/products.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PromotionsModule } from './promotions/promotions.module.js';

@Module({
  imports: [
    OrdersModule,
    ProductsModule,
    PrismaModule,
    AuthModule,
    PromotionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
