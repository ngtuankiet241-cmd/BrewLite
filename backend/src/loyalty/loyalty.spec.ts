import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateOrderDto } from '../orders/dto/create-order.dto.js';
import { LOYALTY_POLICY, redemptionDiscount } from './loyalty.js';

describe('Loyalty point policy', () => {
  it('uses 1 point per 1,000 VND paid and 10 VND per redeemed point', () => {
    expect(LOYALTY_POLICY).toEqual({ spendPerPoint: 1000, pointValue: 10 });
    expect(redemptionDiscount(125, 25000)).toBe(1250);
    expect(redemptionDiscount(2500, 25000)).toBe(25000);
  });

  it.each([-1, 0.5, NaN, Infinity, 2147483648])(
    'rejects invalid point quantities (%s)',
    (points) => {
      expect(() => redemptionDiscount(points, 25000)).toThrow(
        BadRequestException,
      );
    },
  );

  it('rejects a discount greater than the payable amount', () => {
    expect(() => redemptionDiscount(2501, 25000)).toThrow('vượt số tiền');
  });

  it.each([null, -1, 1.5, '20'])(
    'rejects malformed API inputs (%s)',
    async (pointsToRedeem) => {
      await expect(
        new ValidationPipe({ transform: true }).transform(
          {
            items: [
              { productId: 'coffee', quantity: 1, sizeId: 'S', toppingIds: [] },
            ],
            pointsToRedeem,
          },
          { type: 'body', metatype: CreateOrderDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
