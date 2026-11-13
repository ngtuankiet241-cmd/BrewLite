import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BankPaymentsService } from './bank-payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { awardPoints } from '../loyalty/loyalty.js';
import {
  refundSummary,
  requestRefund,
  SETTLED_PAYMENT_STATUSES,
} from './refunds.js';

type SePayIpn = {
  notification_type?: string;
  order?: {
    order_id?: string;
    order_status?: string;
    order_currency?: string;
    order_amount?: string | number;
    order_invoice_number?: string;
  };
  transaction?: {
    payment_method?: string;
    transaction_status?: string;
    transaction_amount?: string | number;
    transaction_currency?: string;
  };
};

@Injectable()
export class PaymentsService {
  private readonly bankPayments: BankPaymentsService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.bankPayments = new BankPaymentsService(prisma, config);
  }

  create(
    dto: CreatePaymentDto,
    userId: string,
    idempotencyKey: string | undefined,
  ) {
    return this.bankPayments.create(dto.orderCode, userId, idempotencyKey);
  }

  getCheckout(orderCode: string, userId: string) {
    return this.bankPayments.checkout(orderCode, userId);
  }

  handleWebhook(
    authorization: string | undefined,
    body: Record<string, unknown>,
  ) {
    return this.bankPayments.webhook(authorization, body);
  }

  // Legacy Gateway IPNs only settle payments originally created by Gateway.
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

    if (
      body.transaction &&
      (body.transaction.transaction_status !== 'APPROVED' ||
        body.transaction.transaction_currency !== 'VND' ||
        Number(body.transaction.transaction_amount) !== amount ||
        (body.transaction.payment_method !== undefined &&
          body.transaction.payment_method !== 'BANK_TRANSFER'))
    ) {
      throw new BadRequestException(
        'Giao dịch IPN không khớp khoản thanh toán.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "orderCode" = ${invoice} FOR UPDATE`;
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
            SETTLED_PAYMENT_STATUSES.includes(payment.status),
        )
      ) {
        return { received: true, alreadyProcessed: true };
      }

      if (!['PENDING', 'PAYMENT_FAILED', 'CANCELLED'].includes(order.status)) {
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
      if (body.order?.order_id) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { gatewayOrderCode: body.order.order_id },
        });
      }
      // A late capture must be refunded without reopening a cancelled order.
      if (order.status === 'CANCELLED') {
        await requestRefund(tx, payment);
        return { received: true, refundPending: true };
      }

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
          include: { refund: true },
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
      pointsRefunded: order.pointsRefundedAt !== null,
      pointsReversed: order.pointsReversedAt !== null,
      ...refundSummary(order.payments),
    };
  }
}
