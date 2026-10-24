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
    findOrder.mockResolvedValue({ status: 'PENDING' });
    updateOrder.mockResolvedValue({ count: 1 });
    service = new OrdersService(
      {
        order: { findUnique: findOrder, updateMany: updateOrder },
      } as unknown as PrismaService,
      {} as PromotionsService,
    );
  });

  it('persists each step from PENDING to COMPLETED', async () => {
    let status = 'PENDING';
    findOrder.mockImplementation(() => Promise.resolve({ status }));
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
      where: { id: orderCode },
      select: { status: true },
    });
  });

  it.each<[OrderStatus, OrderStatus]>([
    ['PENDING', 'PAYMENT_FAILED'],
    ['PAYMENT_FAILED', 'PENDING'],
    ['PENDING', 'CANCELLED'],
    ['PAID', 'CANCELLED'],
    ['PAYMENT_FAILED', 'CANCELLED'],
  ])('persists the diagram branch %s -> %s', async (from, to) => {
    findOrder.mockResolvedValue({ status: from });
    await expect(service.updateStatus(orderCode, to)).resolves.toEqual({
      orderCode,
      status: to,
    });
    expect(updateOrder).toHaveBeenCalledExactlyOnceWith({
      where: { id: orderCode, status: from },
      data: { status: to },
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
    findOrder.mockResolvedValue({ status: from });
    await expect(service.updateStatus(orderCode, to)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it('rejects an unrecognized persisted state without writing to the database', async () => {
    findOrder.mockResolvedValue({ status: 'UNKNOWN' });
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
