import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { SubStatus } from '../../../generated/prisma/client';
import { BILLING_DEFAULT_LIMIT, BILLING_MAX_LIMIT } from '@/common/constants/pagination.constants';

export class SubscriptionListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: BILLING_DEFAULT_LIMIT, minimum: 1, maximum: BILLING_MAX_LIMIT })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(BILLING_MAX_LIMIT)
  @IsOptional()
  limit?: number = BILLING_DEFAULT_LIMIT;

  @ApiPropertyOptional({ enum: SubStatus })
  @IsEnum(SubStatus)
  @IsOptional()
  status?: SubStatus;
}
