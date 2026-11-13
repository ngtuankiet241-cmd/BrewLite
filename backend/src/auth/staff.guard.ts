import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.sub)
      throw new UnauthorizedException('Vui lòng đăng nhập.');
    // Read the current role, rather than trusting a cached profile or JWT role.
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { role: true },
    });
    if (!user || !['STAFF', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException(
        'Chỉ nhân viên được thực hiện thao tác này.',
      );
    }
    return true;
  }
}
