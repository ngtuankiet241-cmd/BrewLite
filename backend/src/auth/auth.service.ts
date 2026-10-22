
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone.trim();

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email đã được sử dụng');
      }

      if (existingUser.phone === phone) {
        throw new ConflictException('Số điện thoại đã được sử dụng');
      }

      throw new ConflictException('Tài khoản đã tồn tại');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        loyaltyPoints: true,
      },
    });

    return {
      message: 'Đăng ký thành công',
      user,
    };
  }

  async login(dto: LoginDto) {
    const phone = dto.phone.trim();

    const user = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {
      throw new UnauthorizedException(
        'Số điện thoại hoặc mật khẩu không đúng',
      );
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Số điện thoại hoặc mật khẩu không đúng',
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      phone: user.phone,
    });

    return {
      message: 'Đăng nhập thành công',
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        loyaltyPoints: user.loyaltyPoints,
      },
    };
  }
}
