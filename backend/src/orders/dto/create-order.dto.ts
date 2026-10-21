import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderSizeId, OrderToppingId } from '../order.types.js';

export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsEnum(OrderSizeId)
  sizeId!: OrderSizeId;

  @IsArray()
  @ArrayUnique()
  @IsEnum(OrderToppingId, { each: true })
  toppingIds!: OrderToppingId[];
}

export class CreateOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
