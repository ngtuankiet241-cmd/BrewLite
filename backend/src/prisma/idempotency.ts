import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service.js';

export async function withIdempotency<T>(
  prisma: PrismaService,
  userId: string,
  operation: 'orders.create' | 'payments.create',
  key: string | undefined,
  request: unknown,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!key) {
    throw new BadRequestException('Thiếu header Idempotency-Key.');
  }
  if (key.length > 200 || /[^\x21-\x7e]/.test(key)) {
    throw new BadRequestException(
      'Idempotency-Key phải có 1–200 ký tự ASCII, không chứa khoảng trắng.',
    );
  }
  const requestHash = createHash('sha256')
    .update(JSON.stringify(request))
    .digest('hex');

  return prisma.$transaction(
    async (tx) => {
      // The lock works across processes and is released on commit or rollback.
      // A hash collision only serializes unrelated requests; identity uses the PK.
      await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${operation}`}), hashtext(${key}))
    `;
      const identity = { userId, operation, key };
      const existing = await tx.idempotencyRequest.findUnique({
        where: { userId_operation_key: identity },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException(
            'Idempotency-Key đã được sử dụng với nội dung yêu cầu khác.',
          );
        }
        return JSON.parse(existing.response) as T;
      }

      const result = await run(tx);
      // Text preserves insertion order of signed SePay form fields on replay.
      await tx.idempotencyRequest.create({
        data: { ...identity, requestHash, response: JSON.stringify(result) },
      });
      return result;
    },
    { isolationLevel: 'ReadCommitted' },
  );
}
