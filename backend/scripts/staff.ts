import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
try {
  const [command, identity] = process.argv.slice(2);
  if (!['grant', 'revoke'].includes(command ?? '') || !identity?.trim()) {
    throw new Error(
      'Usage: npm run staff -- grant|revoke <email-or-phone>. Register the account normally first.',
    );
  }
  const value = identity.trim();
  const user = await db.user.findFirst({
    where: { OR: [{ email: value.toLowerCase() }, { phone: value }] },
    select: { id: true, email: true },
  });
  if (!user)
    throw new Error('Account not found. Register it in BrewLite first.');
  const role = command === 'grant' ? 'STAFF' : 'CUSTOMER';
  await db.user.update({ where: { id: user.id }, data: { role } });
  console.log(
    `${user.email}: ${role}. Staff access is checked against the database on every request.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Role update failed.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
