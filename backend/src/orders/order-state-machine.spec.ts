import { BadRequestException } from '@nestjs/common';
import { assertTransition } from './order-state-machine.js';
import type { OrderStatus } from './order.types.js';

describe('Order state machine', () => {
  const statuses: OrderStatus[] = [
    'PENDING',
    'PAID',
    'PREPARING',
    'READY',
    'COMPLETED',
    'PAYMENT_FAILED',
    'CANCELLED',
  ];
  const allowedTransitions: [OrderStatus, OrderStatus][] = [
    ['PENDING', 'PAID'],
    ['PAID', 'PREPARING'],
    ['PREPARING', 'READY'],
    ['READY', 'COMPLETED'],
    ['PENDING', 'PAYMENT_FAILED'],
    ['PAYMENT_FAILED', 'PENDING'],
    ['PENDING', 'CANCELLED'],
    ['PAID', 'CANCELLED'],
    ['PAYMENT_FAILED', 'CANCELLED'],
  ];
  const rejectedTransitions = statuses.flatMap((from) =>
    statuses
      .filter(
        (to) =>
          !allowedTransitions.some(
            ([start, end]) => start === from && end === to,
          ),
      )
      .map((to) => ({ from, to })),
  );

  it.each(allowedTransitions)('allows %s -> %s', (from, to) => {
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each(rejectedTransitions)('rejects $from -> $to', ({ from, to }) => {
    expect(() => assertTransition(from, to)).toThrow(BadRequestException);
    expect(() => assertTransition(from, to)).toThrow(
      `Không thể chuyển trạng thái đơn hàng từ ${from} sang ${to}.`,
    );
  });

  it.each(['', 'UNKNOWN', 'pending', '__proto__', 'constructor', 'toString'])(
    'rejects an unknown source state: %s',
    (from) => {
      expect(() => assertTransition(from, 'PAID')).toThrow(BadRequestException);
    },
  );

  it.each(['', 'UNKNOWN', 'paid', '__proto__', 'constructor', 'toString'])(
    'rejects an unknown target state: %s',
    (to) => {
      expect(() => assertTransition('PENDING', to)).toThrow(
        BadRequestException,
      );
    },
  );
});
