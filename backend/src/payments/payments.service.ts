import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SePayPgClient } from 'sepay-pg-node';
import { PrismaService } from '../prisma/prisma.service.js';
import { withIdempotency } from '../prisma/idempotency.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { awardPoints } from '../loyalty/loyalty.js';

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
    if (env !== 'sandbox' || !merchantId || !secretKey) {
      throw new Error('Thiếu cấu hình SePay Sandbox trong backend/.env.');
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
    idempotencyKey: string | undefined,
  ) {
    return withIdempotency(
      this.prisma,
      userId,
      'payments.create',
      idempotencyKey,
      { orderCode: dto.orderCode },
      async (tx) => {
        // Different keys for the same invoice must also share one payment row.
        // Lock before reading so a concurrent IPN cannot be reset to PENDING.
        await tx.$queryRaw`
        SELECT "id" FROM "Order"
        WHERE "orderCode" = ${dto.orderCode} AND "userId" = ${userId}
        FOR UPDATE
      `;
        const order = await tx.order.findFirst({
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
          throw new BadRequestException('Đơn hàng đã được thanh toán.');
        }

        if (order.status !== 'PENDING' && order.status !== 'PAYMENT_FAILED') {
          throw new BadRequestException(
            'Trạng thái đơn hàng không cho phép thanh toán.',
          );
        }

        const paymentKey = `sepay:${order.id}`;

        const existing = await tx.payment.findUnique({
          where: { idempotencyKey: paymentKey },
        });

        if (existing?.status === 'SUCCEEDED') {
          throw new BadRequestException(
            'Đơn hàng đã có giao dịch thanh toán thành công.',
          );
        }

        const frontendUrl =
          this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

        // The checkout API verifies a fixed field order. Supply merchant explicitly
        // so SDK v1.0.0 keeps it here instead of appending it after the callback URLs.
        const fields = this.sepay.checkout.initOneTimePaymentFields({
          order_amount: Number(order.total),
          merchant: this.config.getOrThrow<string>('SEPAY_MERCHANT_ID'),
          currency: 'VND',
          operation: 'PURCHASE',
          order_description: `BrewLite ${order.orderCode}`,
          order_invoice_number: order.orderCode,
          payment_method: 'BANK_TRANSFER',
          success_url: `${frontendUrl}/payment/result?orderCode=${encodeURIComponent(order.orderCode)}`,
          error_url: `${frontendUrl}/payment/result?orderCode=${encodeURIComponent(order.orderCode)}`,
          cancel_url: `${frontendUrl}/payment/result?orderCode=${encodeURIComponent(order.orderCode)}`,
        });

        const updated = await tx.order.updateMany({
          where: { id: order.id, status: order.status },
          data: { status: 'PENDING' },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'Trạng thái đơn hàng đã thay đổi. Vui lòng kiểm tra lại thanh toán.',
          );
        }

        if (existing && existing.status !== 'PENDING') {
          await tx.payment.update({
            where: { id: existing.id },
            data: {
              amount: order.total,
              method: 'SEPAY_BANK_TRANSFER',
              status: 'PENDING',
            },
          });
        } else if (!existing) {
          await tx.payment.create({
            data: {
              orderId: order.id,
              idempotencyKey: paymentKey,
              amount: order.total,
              method: 'SEPAY_BANK_TRANSFER',
              status: 'PENDING',
            },
          });
        }

        return {
          orderCode: order.orderCode,
          checkoutUrl: this.sepay.checkout.initCheckoutUrl(),
          formFields: fields,
          paymentStatus: 'PENDING',
        };
      },
    );
  }

  async handleIpn(secretHeader: string | undefined, body: SePayIpn) {
    const expectedSecret = this.config.get<string>('SEPAY_IPN_SECRET_KEY');

    if (!expectedSecret || !secretHeader || secretHeader !== expectedSecret) {
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
      throw new BadRequestException('Dữ liệu IPN không hợp lệ.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { orderCode: invoice },
        include: { payments: true },
      });

      if (!order) {
        throw new BadRequestException(
          'Không tìm thấy đơn hàng tương ứng với IPN.',
        );
      }

      if (Number(order.total) !== amount) {
        throw new BadRequestException('Số tiền IPN không khớp với đơn hàng.');
      }

      if (
        order.status === 'PAID' ||
        order.payments.some(
          (payment) =>
            payment.method === 'SEPAY_BANK_TRANSFER' &&
            payment.status === 'SUCCEEDED',
        )
      ) {
        return { received: true, alreadyProcessed: true };
      }

      if (!['PENDING', 'PAYMENT_FAILED'].includes(order.status)) {
        throw new BadRequestException(
          'Trạng thái đơn hàng không cho phép xác nhận thanh toán.',
        );
      }

      const payment = order.payments.find(
        (item) => item.method === 'SEPAY_BANK_TRANSFER',
      );

      if (!payment || Number(payment.amount) !== amount) {
        throw new BadRequestException(
          'Không tìm thấy giao dịch SePay hợp lệ cho đơn hàng.',
        );
      }

      // Claim the transition first, then settle the payment and points together.
      // A concurrent callback cannot credit the same order a second time.
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: 'PAID' },
      });
      if (updated.count !== 1) {
        const current = await tx.payment.findUnique({
          where: { id: payment.id },
        });
        if (current?.status === 'SUCCEEDED')
          return { received: true, alreadyProcessed: true };
        throw new ConflictException(
          'Trạng thái đơn hàng đã thay đổi. Vui lòng gửi lại IPN.',
        );
      }
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCEEDED' },
      });
      await awardPoints(tx, order);

      return { received: true };
    });
  }

  async getOrderPaymentStatus(orderCode: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderCode, userId },
      include: {
        payments: {
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
      pointsEarned: order.pointsEarned,
      pointsRedeemed: order.pointsRedeemed,
      pointsDiscount: Number(order.pointsDiscount),
    };
  }
}
