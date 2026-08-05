import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsEnum, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { PlanType } from '../../../generated/prisma/client';
import { CATALOG_DEFAULT_LIMIT, CATALOG_MAX_LIMIT } from '@/common/constants/pagination.constants';

export class ProductListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: CATALOG_DEFAULT_LIMIT, minimum: 1, maximum: CATALOG_MAX_LIMIT })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CATALOG_MAX_LIMIT)
  @IsOptional()
  limit?: number = CATALOG_DEFAULT_LIMIT;

  @ApiPropertyOptional({ enum: PlanType })
  @IsEnum(PlanType)
  @IsOptional()
  planType?: PlanType;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
