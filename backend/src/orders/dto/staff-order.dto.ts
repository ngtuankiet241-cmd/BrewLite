import { Type, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class StaffOrderQuery {
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
  status?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;
}

export class StaffCancelOrderDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'Vui lòng nhập lý do hủy đơn.' })
  @MaxLength(500)
  reason!: string;
}

export class StaffOrderStatusDto {
  @IsIn(['PREPARING', 'READY', 'COMPLETED'])
  status!: 'PREPARING' | 'READY' | 'COMPLETED';
}
