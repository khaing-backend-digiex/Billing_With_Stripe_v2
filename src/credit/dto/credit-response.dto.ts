import { ApiProperty } from '@nestjs/swagger';

export class CreditBalanceResponseDto {
  @ApiProperty({ example: 100, description: 'Remaining plan credits' })
  planCredits!: number;

  @ApiProperty({ example: 50, description: 'Available add-on credits' })
  addonCreditsAvailable!: number;

  @ApiProperty({ example: 0, description: 'Frozen add-on credits' })
  addonCreditsFrozen!: number;

  @ApiProperty({ example: '2026-08-01T10:30:00.000Z' })
  lastResetAt!: string;

  @ApiProperty({ example: '2026-08-01T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-01T10:30:00.000Z' })
  updatedAt!: string;
}
