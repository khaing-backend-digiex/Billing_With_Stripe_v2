import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanType } from '../../../generated/prisma/client';

export class PriceResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'price_1234567890' })
  stripePriceId!: string;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: 1000, description: 'Price in smallest currency unit (cents)' })
  amount!: number;

  @ApiPropertyOptional({ example: 'month' })
  interval?: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-08-01T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-01T10:30:00.000Z' })
  updatedAt!: string;
}

export class ProductWithPricesResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'prod_1234567890' })
  stripeProductId!: string;

  @ApiProperty({ example: 'Pro Plan' })
  name!: string;

  @ApiProperty({ enum: PlanType, example: PlanType.PRO_MONTHLY })
  planType!: PlanType;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-08-01T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-01T10:30:00.000Z' })
  updatedAt!: string;

  @ApiProperty({ type: [PriceResponseDto] })
  prices!: PriceResponseDto[];
}

export class ExchangeRateResponseDto {
  @ApiProperty({ example: 'USD' })
  targetCurrency!: string;

  @ApiProperty({ example: 0.000042, description: 'Exchange rate from base currency (VND)' })
  rate!: number;

  @ApiProperty({ example: '2026-08-03T10:30:00.000Z' })
  updatedAt!: string;
}
