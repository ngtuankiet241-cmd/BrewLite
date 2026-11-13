import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

// Real PostgreSQL, isolated from the running app's refund worker and user data.
const db = new PrismaClient();
const schema = `payments_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', schema);
const env = { ...process.env, DATABASE_URL: url.toString() };
function run(file, args) {
  const result = spawnSync(process.execPath, [file, ...args], {
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
try {
  const migrationCode = run('node_modules/prisma/build/index.js', [
    'migrate',
    'deploy',
  ]);
  if (migrationCode) process.exitCode = migrationCode;
  else
    process.exitCode = run('node_modules/vitest/vitest.mjs', [
      'run',
      '--config',
      'vitest.config.e2e.ts',
      '--configLoader',
      'runner',
      '--no-file-parallelism',
      ...(process.argv.length > 2
        ? process.argv.slice(2)
        : [
            'test/loyalty.e2e-spec.ts',
            'test/idempotency.e2e-spec.ts',
            'test/refunds-worker.e2e-spec.ts',
            'test/sepay-v2.e2e-spec.ts',
            'test/staff-orders.e2e-spec.ts',
          ]),
    ]);
} finally {
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
}
