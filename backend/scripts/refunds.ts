import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Operator tool: list outstanding obligations or retry the SAME durable request.
// It cannot mark a refund paid or change its amount, transaction, or idempotency key.
const db = new PrismaClient();
try {
  const [command = 'list', id] = process.argv.slice(2);
  if (command === 'list') {
    const refunds = await db.refund.findMany({
      where: { status: { not: 'SUCCEEDED' } },
      orderBy: { requestedAt: 'asc' },
      select: {
        id: true,
        paymentId: true,
        amount: true,
        status: true,
        method: true,
        environment: true,
        lastError: true,
        attempts: true,
        failures: true,
        nextAttemptAt: true,
        providerRefundId: true,
      },
    });
    console.table(
      refunds.map((refund) => ({ ...refund, amount: Number(refund.amount) })),
    );
  } else if (command === 'retry' && id) {
    const result = await db.refund.updateMany({
      where: {
        id,
        status: 'NEEDS_REVIEW',
        method: 'SEPAY_V2',
        environment: 'sandbox',
      },
      data: {
        status: 'PENDING',
        failures: 0,
        nextAttemptAt: new Date(),
        leaseToken: null,
        leaseUntil: null,
      },
    });
    if (result.count !== 1)
      throw new Error(
        'Only a NEEDS_REVIEW API v2 Sandbox refund can be retried. Legacy Gateway payments require separate review.',
      );
    console.log(
      'Queued the original refund request with its unchanged idempotency key.',
    );
  } else throw new Error('Usage: npm run refunds -- list | retry <refund-id>');
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Refund operation failed.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
