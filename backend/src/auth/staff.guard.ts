import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user?.sub
      ? await this.prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { role: true },
        })
      : null;
    if (!user || !['STAFF', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Tài khoản không có quyền nhân viên.');
    }
    return true;
  }
}
