import { Transform } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class ValidatePromotionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Mã khuyến mãi không hợp lệ.' })
  @MaxLength(64)
  code!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  orderAmount!: number;
}
