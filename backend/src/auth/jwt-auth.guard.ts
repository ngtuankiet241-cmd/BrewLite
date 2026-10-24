
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    phone?: string;
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    const authHeader = request.headers.authorization;
    const [scheme, token] = authHeader?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Vui lòng đăng nhập để thực hiện thao tác này.',
      );
    }

    try {
      request.user = await this.jwtService.verifyAsync<{
        sub: string;
        phone?: string;
      }>(token);
    } catch {
      throw new UnauthorizedException(
        'Token đăng nhập không hợp lệ hoặc đã hết hạn.',
      );
    }

    if (!request.user.sub) {
      throw new UnauthorizedException('Token không chứa ID người dùng.');
    }

    return true;
  }
}
