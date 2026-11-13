import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
try {
  const account = process.argv[2]?.trim();
  if (!account)
    throw new Error(
      'Cách dùng: npm run staff:grant -- <email hoặc số điện thoại>',
    );
  const user = await db.user.findUnique({
    where: account.includes('@')
      ? { email: account.toLowerCase() }
      : { phone: account },
    select: { id: true },
  });
  if (!user) throw new Error('Không tìm thấy tài khoản để cấp quyền.');
  await db.user.update({ where: { id: user.id }, data: { role: 'STAFF' } });
  console.log('Đã cấp quyền STAFF. Đăng nhập và mở /staff.');
} finally {
  await db.$disconnect();
}
