import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanType, SubStatus } from '../../../generated/prisma/client';

export class CheckoutUrlResponseDto {
  @ApiProperty({ example: 'https://checkout.stripe.com/pay/cs_test_...' })
  url!: string | null;
}

export class SubscriptionResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'sub_1234567890' })
  stripeSubscriptionId!: string;

  @ApiProperty({ enum: PlanType, example: PlanType.PRO_MONTHLY })
  plan!: PlanType;

  @ApiProperty({ enum: SubStatus, example: SubStatus.ACTIVE })
  status!: SubStatus;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  currentPeriodStart?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  currentPeriodEnd?: string;

  @ApiProperty({ example: '2026-08-01T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-01T10:30:00.000Z' })
  updatedAt!: string;
}
