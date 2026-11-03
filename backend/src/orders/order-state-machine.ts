import { BadRequestException } from '@nestjs/common';
import type { OrderStatus } from './order.types.js';

const ALLOWED_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  PENDING: ['PAID', 'PAYMENT_FAILED', 'CANCELLED'],
  PAID: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['COMPLETED'],
  COMPLETED: [],
  PAYMENT_FAILED: ['PENDING', 'CANCELLED'],
  CANCELLED: [],
};

export function assertTransition(from: string, to: string): void {
  const nextStates = Object.hasOwn(ALLOWED_TRANSITIONS, from)
    ? ALLOWED_TRANSITIONS[from as OrderStatus]
    : [];

  if (!nextStates.some((status) => status === to)) {
    throw new BadRequestException(
      `Không thể chuyển trạng thái đơn hàng từ ${from} sang ${to}.`,
    );
  }
}
