import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PromotionsService } from '../promotions/promotions.service.js';
import type { OrderStatus } from './order.types.js';
import { OrdersService } from './orders.service.js';

describe('Persistent order status transitions', () => {
  const findOrder = vi.fn();
  const updateOrder = vi.fn();
  const orderCode = 'ORD-state-machine';
  let service: OrdersService;

  beforeEach(() => {
    vi.resetAllMocks();
    findOrder.mockResolvedValue({
      id: orderCode,
      orderCode,
      status: 'PENDING',
    });
    updateOrder.mockResolvedValue({ count: 1 });
    service = new OrdersService(
      {
        order: { findFirst: findOrder, updateMany: updateOrder },
        $transaction: (run: (tx: unknown) => unknown) =>
          run({
            $queryRaw: vi.fn(),
            order: { findFirst: findOrder, updateMany: updateOrder },
            payment: {
              updateMany: vi.fn(),
              findMany: vi.fn().mockResolvedValue([]),
            },
          }),
      } as unknown as PrismaService,
      {} as PromotionsService,
    );
  });

  it('persists each step from PENDING to COMPLETED', async () => {
    let status = 'PENDING';
    findOrder.mockImplementation(() =>
      Promise.resolve({ id: orderCode, orderCode, status }),
    );
    updateOrder.mockImplementation(({ data }: Prisma.OrderUpdateManyArgs) => {
      status = data.status as string;
      return Promise.resolve({ count: 1 });
    });
    const nextStates: OrderStatus[] = [
      'PAID',
      'PREPARING',
      'READY',
      'COMPLETED',
    ];

    for (const nextStatus of nextStates) {
      const previousStatus = status;
      await expect(
        service.updateStatus(orderCode, nextStatus),
      ).resolves.toEqual({
        orderCode,
        status: nextStatus,
      });
      expect(updateOrder).toHaveBeenLastCalledWith({
        where: { id: orderCode, status: previousStatus },
        data: { status: nextStatus },
      });
      expect(status).toBe(nextStatus);
    }
    expect(findOrder).toHaveBeenCalledWith({
      where: { OR: [{ id: orderCode }, { orderCode }] },
      select: {
        id: true,
        status: true,
        orderCode: true,
        userId: true,
        total: true,
        pointsRedeemed: true,
      },
    });
  });

  it.each<[OrderStatus, OrderStatus]>([
    ['PENDING', 'PAYMENT_FAILED'],
    ['PAYMENT_FAILED', 'PENDING'],
    ['PENDING', 'CANCELLED'],
    ['PAID', 'CANCELLED'],
    ['PAYMENT_FAILED', 'CANCELLED'],
  ])('persists the diagram branch %s -> %s', async (from, to) => {
    findOrder.mockResolvedValue({
      id: orderCode,
      orderCode,
      status: from,
      items: [],
      payments: [],
    });
    await expect(service.updateStatus(orderCode, to)).resolves.toMatchObject({
      orderCode,
      status: to,
    });
    expect(updateOrder).toHaveBeenCalledExactlyOnceWith({
      where: { id: orderCode, status: from },
      data:
        to === 'CANCELLED'
          ? {
              status: to,
              cancelledAt: expect.any(Date),
              cancellationReason: null,
              cancelledById: null,
              cancellationActor: 'SYSTEM',
            }
          : { status: to },
    });
  });

  it.each<[OrderStatus, OrderStatus]>([
    ['PENDING', 'PREPARING'],
    ['PENDING', 'COMPLETED'],
    ['PAID', 'READY'],
    ['PREPARING', 'PAID'],
    ['READY', 'PENDING'],
    ['PREPARING', 'CANCELLED'],
    ['PAYMENT_FAILED', 'PAID'],
    ['PAID', 'PAID'],
    ['COMPLETED', 'PENDING'],
    ['COMPLETED', 'CANCELLED'],
    ['CANCELLED', 'PENDING'],
  ])('rejects %s -> %s without writing to the database', async (from, to) => {
    findOrder.mockResolvedValue({ id: orderCode, orderCode, status: from });
    await expect(service.updateStatus(orderCode, to)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it('rejects an unrecognized persisted state without writing to the database', async () => {
    findOrder.mockResolvedValue({
      id: orderCode,
      orderCode,
      status: 'UNKNOWN',
    });
    await expect(
      service.updateStatus(orderCode, 'PAID'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it('rejects a missing order without writing to the database', async () => {
    findOrder.mockResolvedValue(null);
    await expect(
      service.updateStatus(orderCode, 'PAID'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it('rejects an update when another request has already changed the status', async () => {
    updateOrder.mockResolvedValue({ count: 0 });
    await expect(
      service.updateStatus(orderCode, 'PAID'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateOrder).toHaveBeenCalledExactlyOnceWith({
      where: { id: orderCode, status: 'PENDING' },
      data: { status: 'PAID' },
    });
  });

  it('propagates a failed database write instead of reporting success', async () => {
    updateOrder.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.updateStatus(orderCode, 'PAID')).rejects.toThrow(
      'Database unavailable',
    );
  });
});
