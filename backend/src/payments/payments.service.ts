
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SePayPgClient } from 'sepay-pg-node';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';

type SePayIpn = {
  notification_type?: string;
  order?: {
    order_status?: string;
    order_currency?: string;
    order_amount?: string | number;
    order_invoice_number?: string;
  };
  transaction?: {
    transaction_status?: string;
    transaction_amount?: string | number;
    transaction_currency?: string;
  };
};

@Injectable()
export class PaymentsService {
  private readonly sepay: SePayPgClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const env = this.config.get<string>('SEPAY_ENV');
    const merchantId = this.config.get<string>('SEPAY_MERCHANT_ID');
    const secretKey = this.config.get<string>('SEPAY_SECRET_KEY');
console.log('[SePay] ENV:', env);
console.log('[SePay] Merchant ID exists:', Boolean(merchantId));
console.log('[SePay] Secret Key exists:', Boolean(secretKey));
    if (
      env !== 'sandbox' ||
      !merchantId ||
      !secretKey
    ) {
      throw new Error(
        'Thiếu cấu hình SePay Sandbox trong backend/.env.',
      );
    }

    this.sepay = new SePayPgClient({
      env: 'sandbox',
      merchant_id: merchantId,
      secret_key: secretKey,
    });
  }

  async create(
    dto: CreatePaymentDto,
    userId: string,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException(
        'Thiếu header Idempotency-Key.',
      );
    }

    const order = await this.prisma.order.findFirst({
      where: {
        orderCode: dto.orderCode,
        userId,
      },
    });

    if (!order) {
      throw new BadRequestException(
        'Không tìm thấy đơn hàng của tài khoản này.',
      );
    }

    if (order.status === 'PAID') {
      throw new BadRequestException(
        'Đơn hàng đã được thanh toán.',
      );
    }

    if (
      order.status !== 'PENDING' &&
      order.status !== 'PAYMENT_FAILED'
    ) {
      throw new BadRequestException(
        'Trạng thái đơn hàng không cho phép thanh toán.',
      );
    }

    const paymentKey = `sepay:${order.id}`;

    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey: paymentKey },
    });

    if (existing?.status === 'SUCCEEDED') {
      throw new BadRequestException(
        'Đơn hàng đã có giao dịch thanh toán thành công.',
      );
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:3000';

    const fields = this.sepay.checkout.initOneTimePaymentFields({
      operation: 'PURCHASE',
      payment_method: 'BANK_TRANSFER',
      order_invoice_number: order.orderCode,
      order_amount: Number(order.total),
      currency: 'VND',
      order_description: `BrewLite ${order.orderCode}`,
      success_url: `${frontendUrl}/payment/result?orderCode=${encodeURIComponent(order.orderCode)}`,
      error_url: `${frontendUrl}/payment/result?orderCode=${encodeURIComponent(order.orderCode)}`,
      cancel_url: `${frontendUrl}/payment/result?orderCode=${encodeURIComponent(order.orderCode)}`,
    });

    if (existing) {
      await this.prisma.payment.update({
        where: { id: existing.id },
        data: {
          amount: order.total,
          method: 'SEPAY_BANK_TRANSFER',
          status: 'PENDING',
        },
      });
    } else {
      await this.prisma.payment.create({
        data: {
          orderId: order.id,
          idempotencyKey: paymentKey,
          amount: order.total,
          method: 'SEPAY_BANK_TRANSFER',
          status: 'PENDING',
        },
      });
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'PENDING' },
    });

    return {
      orderCode: order.orderCode,
      checkoutUrl: this.sepay.checkout.initCheckoutUrl(),
      formFields: fields,
      paymentStatus: 'PENDING',
    };
  }

  async handleIpn(
    secretHeader: string | undefined,
    body: SePayIpn,
  ) {
  const expectedSecret =
  this.config.get<string>('SEPAY_IPN_SECRET_KEY');

    if (
      !expectedSecret ||
      !secretHeader ||
      secretHeader !== expectedSecret
    ) {
      throw new UnauthorizedException('IPN Secret Key không hợp lệ.');
    }

    if (body.notification_type !== 'ORDER_PAID') {
      return { received: true, ignored: true };
    }

    const invoice = body.order?.order_invoice_number;
    const orderStatus = body.order?.order_status;
    const currency = body.order?.order_currency;
    const amount = Number(body.order?.order_amount);

    if (
      !invoice ||
      orderStatus !== 'CAPTURED' ||
      currency !== 'VND' ||
      !Number.isFinite(amount)
    ) {
      throw new BadRequestException(
        'Dữ liệu IPN không hợp lệ.',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { orderCode: invoice },
      include: { payments: true },
    });

    if (!order) {
      throw new BadRequestException(
        'Không tìm thấy đơn hàng tương ứng với IPN.',
      );
    }

    if (Number(order.total) !== amount) {
      throw new BadRequestException(
        'Số tiền IPN không khớp với đơn hàng.',
      );
    }

    if (order.status === 'PAID') {
      return { received: true, alreadyProcessed: true };
    }

    const payment = order.payments.find(
      (item) => item.method === 'SEPAY_BANK_TRANSFER',
    );

    if (!payment || Number(payment.amount) !== amount) {
      throw new BadRequestException(
        'Không tìm thấy giao dịch SePay hợp lệ cho đơn hàng.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCEEDED' },
      }),
      this.prisma.order.update({
        where: { id: order.id },
        data: { status: 'PAID' },
      }),
    ]);

    return { received: true };
  }

  async getOrderPaymentStatus(
    orderCode: string,
    userId: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { orderCode, userId },
      include: {
        payments: {
          where: { method: 'SEPAY_BANK_TRANSFER' },
          orderBy: { id: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new BadRequestException('Không tìm thấy đơn hàng.');
    }

    return {
      orderCode: order.orderCode,
      orderStatus: order.status,
      paymentStatus: order.payments[0]?.status ?? 'PENDING',
    };
  }
}
