import { IsString, MaxLength, ValidateIf } from 'class-validator';

export class CancelOrderDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  reason?: string;
}
