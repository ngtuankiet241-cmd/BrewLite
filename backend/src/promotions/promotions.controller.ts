import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ValidatePromotionDto } from './dto/validate-promotion.dto.js';
import { PromotionsService } from './promotions.service.js';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post('validate')
  @HttpCode(200)
  validate(@Body() dto: ValidatePromotionDto) {
    return this.promotionsService.validate(dto.code, dto.orderAmount);
  }
}
