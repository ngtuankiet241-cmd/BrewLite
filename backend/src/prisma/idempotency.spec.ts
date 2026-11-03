import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { vi } from 'vitest';
import { withIdempotency } from './idempotency.js';
import type { PrismaService } from './prisma.service.js';

describe('Idempotency requests', () => {
  const request = { orderCode: 'ORD-test' };
  const response = { orderCode: 'ORD-test', paymentStatus: 'PENDING' };
  const tx = {
    $executeRaw: vi.fn(),
    idempotencyRequest: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
  const transaction = vi.fn();
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  const run = vi.fn();
  const execute = (key: string | undefined = 'retry-key') =>
    withIdempotency(prisma, 'user-test', 'payments.create', key, request, run);

  beforeEach(() => {
    vi.resetAllMocks();
    transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    tx.idempotencyRequest.findUnique.mockResolvedValue(null);
    run.mockResolvedValue(response);
  });

  it.each(['', ' ', 'has spaces', 'a'.repeat(201), 'khóa', 'key\n'])(
    'rejects invalid keys before starting a transaction: %j',
    async (key) => {
      await expect(execute(key)).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing key', async () => {
    await expect(
      withIdempotency(
        prisma,
        'user-test',
        'payments.create',
        undefined,
        request,
        run,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns the original response without running the operation again', async () => {
    tx.idempotencyRequest.findUnique.mockResolvedValue({
      requestHash: createHash('sha256')
        .update(JSON.stringify(request))
        .digest('hex'),
      response: JSON.stringify(response),
    });
    expect(await execute()).toEqual(response);
    expect(run).not.toHaveBeenCalled();
    expect(tx.idempotencyRequest.create).not.toHaveBeenCalled();
  });

  it('runs the operation once when two requests use the same key and payload', async () => {
    tx.idempotencyRequest.create.mockImplementation(
      ({ data }: { data: { requestHash: string; response: string } }) => {
        tx.idempotencyRequest.findUnique.mockResolvedValue(data);
        return Promise.resolve(data);
      },
    );

    const first = await execute('same-key');
    const second = await execute('same-key');

    expect(first).toEqual(response);
    expect(second).toEqual(first);
    expect(run).toHaveBeenCalledOnce();
    expect(tx.idempotencyRequest.create).toHaveBeenCalledOnce();
  });

  it('rejects reuse of a key with another payload without making business writes', async () => {
    tx.idempotencyRequest.findUnique.mockResolvedValue({
      requestHash: 'another-request',
    });
    await expect(execute()).rejects.toBeInstanceOf(ConflictException);
    expect(run).not.toHaveBeenCalled();
    expect(tx.idempotencyRequest.create).not.toHaveBeenCalled();
  });

  it('does not store a successful response when the operation fails', async () => {
    run.mockRejectedValue(new Error('write failed'));
    await expect(execute()).rejects.toThrow('write failed');
    expect(tx.idempotencyRequest.create).not.toHaveBeenCalled();
  });
});
