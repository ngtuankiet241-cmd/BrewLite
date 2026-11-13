import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import type { OrderStatus } from '../order.types.js';

export class StaffOrderDto {
  @IsIn(['PREPARING', 'READY', 'COMPLETED', 'CANCELLED'])
  status: 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';

  @IsIn([
    'PENDING',
    'PAYMENT_FAILED',
    'PAID',
    'PREPARING',
    'READY',
    'COMPLETED',
    'CANCELLED',
  ])
  expectedStatus: OrderStatus;

  @ValidateIf(
    (dto: StaffOrderDto, value: unknown) =>
      dto.status === 'CANCELLED' || value !== undefined,
  )
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 500)
  reason?: string;
}

export class StaffOrdersQueryDto {
  @IsOptional()
  @IsIn([
    'PENDING',
    'PAYMENT_FAILED',
    'PAID',
    'PREPARING',
    'READY',
    'COMPLETED',
    'CANCELLED',
  ])
  status?: OrderStatus;
}
