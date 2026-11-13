import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Payment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { withIdempotency } from '../prisma/idempotency.js';
import { awardPoints } from '../loyalty/loyalty.js';
import { requestRefund, SETTLED_PAYMENT_STATUSES } from './refunds.js';
import {
  RefundProviderError,
  SePayRefundClient,
} from './sepay-refund.client.js';

export const V2_PAYMENT_METHOD = 'SEPAY_API_V2';

export class BankPaymentsService {
  private readonly provider: SePayRefundClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.provider = new SePayRefundClient(config);
  }

  async create(orderCode: string, userId: string, key: string | undefined) {
    if (!key || key.length > 200 || /[^\x21-\x7e]/.test(key)) {
      throw new BadRequestException('Thiếu hoặc sai header Idempotency-Key.');
    }
    const owned = await this.prisma.order.findFirst({
      where: { orderCode, userId },
      include: { payments: true },
    });
    if (!owned)
      throw new BadRequestException(
        'Không tìm thấy đơn hàng của tài khoản này.',
      );
    // Network I/O happens before acquiring any order or idempotency locks.
    let bank:
      Awaited<ReturnType<SePayRefundClient['getBankAccount']>> | undefined;
    if (
      owned.payments.length === 0 &&
      ['PENDING', 'PAYMENT_FAILED'].includes(owned.status)
    ) {
      if (!this.config.get<string>('SEPAY_WEBHOOK_API_KEY')) {
        throw new ServiceUnavailableException(
          'Chưa cấu hình khóa webhook SePay API v2.',
        );
      }
      try {
        bank = await this.provider.getBankAccount();
      } catch {
        throw new ServiceUnavailableException(
          'Không thể tải tài khoản SePay Sandbox. Kiểm tra API token và UUID tài khoản ngân hàng.',
        );
      }
    }
    return withIdempotency(
      this.prisma,
      userId,
      'payments.v2.create',
      key,
      { orderCode },
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "orderCode" = ${orderCode} AND "userId" = ${userId} FOR UPDATE`;
        const order = await tx.order.findFirst({
          where: { orderCode, userId },
          include: { payments: true },
        });
        if (!order) throw new BadRequestException('Không tìm thấy đơn hàng.');
        if (!['PENDING', 'PAYMENT_FAILED'].includes(order.status)) {
          throw new BadRequestException(
            'Trạng thái đơn hàng không cho phép thanh toán.',
          );
        }
        if (
          order.payments.some((payment) => payment.method !== V2_PAYMENT_METHOD)
        ) {
          throw new ConflictException(
            'Đơn này đã dùng Gateway cũ. Vui lòng hủy đơn chưa thanh toán và đặt đơn mới để dùng API v2.',
          );
        }
        let payment = order.payments[0];
        if (payment && SETTLED_PAYMENT_STATUSES.includes(payment.status)) {
          throw new ConflictException('Đơn hàng đã có giao dịch thanh toán.');
        }
        if (!payment) {
          const amount = Number(order.total);
          if (!Number.isSafeInteger(amount) || amount <= 0)
            throw new BadRequestException('Số tiền thanh toán không hợp lệ.');
          if (!bank)
            throw new ServiceUnavailableException(
              'Chưa có tài khoản nhận thanh toán.',
            );
          const transferContent = `BL${randomBytes(12).toString('hex').toUpperCase()}`;
          const qr = new URL('https://vietqr.app/img');
          qr.search = new URLSearchParams({
            acc: bank.accountNumber,
            bank: bank.bankCode,
            amount: String(amount),
            des: transferContent,
          }).toString();
          payment = await tx.payment.create({
            data: {
              orderId: order.id,
              idempotencyKey: `sepay-v2:${order.id}`,
              amount: order.total,
              method: V2_PAYMENT_METHOD,
              status: 'PENDING',
              environment: 'sandbox',
              transferContent,
              bankAccountId: bank.bankAccountId,
              checkoutData: {
                ...bank,
                amount,
                transferContent,
                qrUrl: qr.toString(),
                environment: 'sandbox',
              },
            },
          });
        }
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'PENDING' },
        });
        return {
          orderCode,
          paymentStatus: payment.status,
          method: V2_PAYMENT_METHOD,
          checkoutPath: `/payment/checkout?orderCode=${encodeURIComponent(orderCode)}`,
        };
      },
    );
  }

  async checkout(orderCode: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderCode, userId },
      include: { payments: { where: { method: V2_PAYMENT_METHOD } } },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    const payment = order.payments[0];
    if (!payment?.checkoutData)
      throw new NotFoundException('Đơn chưa có thông tin thanh toán API v2.');
    return {
      orderCode,
      orderStatus: order.status,
      paymentStatus: payment.status,
      // Stop displaying a payable QR as soon as the order is settled/cancelled.
      instructions: ['PENDING', 'PAYMENT_FAILED'].includes(order.status)
        ? payment.checkoutData
        : null,
    };
  }

  async webhook(
    authorization: string | undefined,
    body: Record<string, unknown>,
  ) {
    const secret = this.config.get<string>('SEPAY_WEBHOOK_API_KEY');
    const expected = Buffer.from(`Apikey ${secret ?? ''}`);
    const received = Buffer.from(authorization ?? '');
    if (
      this.config.get('SEPAY_ENV') !== 'sandbox' ||
      !secret ||
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new UnauthorizedException('Khóa webhook không hợp lệ.');
    }
    if (body.transferType === 'out') return { success: true };
    if (
      body.transferType !== 'in' ||
      !Number.isSafeInteger(body.id) ||
      Number(body.id) <= 0 ||
      !Number.isSafeInteger(body.transferAmount) ||
      Number(body.transferAmount) <= 0 ||
      typeof body.accountNumber !== 'string' ||
      typeof body.content !== 'string'
    ) {
      throw new BadRequestException('Dữ liệu webhook không hợp lệ.');
    }
    const tokens =
      `${typeof body.code === 'string' ? body.code : ''} ${body.content}`
        .toUpperCase()
        .split(/[^A-Z0-9-]+/);
    const references = [
      ...new Set(tokens.filter((token) => /^BL[A-F0-9]{24}$/.test(token))),
    ];
    if (references.length === 0) return { success: true };
    if (references.length !== 1)
      throw new BadRequestException('Nội dung chứa nhiều mã thanh toán.');
    const payment = await this.prisma.payment.findUnique({
      where: { transferContent: references[0] },
    });
    if (
      !payment ||
      payment.method !== V2_PAYMENT_METHOD ||
      payment.environment !== 'sandbox'
    )
      return { success: true };
    const details = payment.checkoutData as { accountNumber?: string } | null;
    if (
      !details ||
      body.accountNumber !== details.accountNumber ||
      Number(body.transferAmount) !== Number(payment.amount)
    ) {
      throw new BadRequestException(
        'Tài khoản hoặc số tiền không khớp. Cần kiểm tra giao dịch.',
      );
    }
    const webhookId = String(body.id);
    if (
      payment.providerWebhookId === webhookId &&
      SETTLED_PAYMENT_STATUSES.includes(payment.status)
    )
      return { success: true };
    let mapping: { transactionId: string; bankAccountId: string };
    try {
      // Webhook IDs are numeric; API v2 IDs are UUIDs. Always resolve via v2,
      // checking the exact code/account/amount (and bank reference if supplied).
      mapping = await this.provider.resolveTransaction(
        payment.transferContent!,
        null,
        Number(payment.amount),
        payment.bankAccountId!,
        typeof body.referenceCode === 'string' && body.referenceCode
          ? body.referenceCode
          : undefined,
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof RefundProviderError
          ? `Chưa đối chiếu được giao dịch: ${error.code}. SePay sẽ thử lại webhook.`
          : 'Không thể đối chiếu giao dịch SePay.',
      );
    }
    await this.settle(payment, mapping.transactionId, webhookId);
    return { success: true };
  }

  private async settle(
    payment: Payment,
    transactionId: string,
    webhookId: string,
  ) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${payment.orderId} FOR UPDATE`;
        const order = await tx.order.findUniqueOrThrow({
          where: { id: payment.orderId },
        });
        const current = await tx.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
        if (current.providerTransactionId) {
          if (current.providerTransactionId !== transactionId)
            throw new ConflictException(
              'Đơn đã nhận một giao dịch khác. Cần kiểm tra khoản chuyển thêm.',
            );
          return;
        }
        if (
          !['PENDING', 'PAYMENT_FAILED', 'CANCELLED'].includes(order.status)
        ) {
          throw new ConflictException(
            'Trạng thái đơn không cho phép ghi nhận khoản thu mới.',
          );
        }
        const captured = await tx.payment.update({
          where: { id: current.id },
          data: {
            status: 'SUCCEEDED',
            providerTransactionId: transactionId,
            providerWebhookId: webhookId,
          },
        });
        if (order.status === 'CANCELLED') {
          await requestRefund(tx, captured);
        } else {
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'PAID' },
          });
          await awardPoints(tx, order);
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Giao dịch SePay đã được ghi nhận cho yêu cầu khác.',
        );
      }
      throw error;
    }
  }
}
