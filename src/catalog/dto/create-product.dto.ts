import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum, Min } from 'class-validator';
import { PlanType } from '../../../generated/prisma/client';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  basePrice!: number;

  @IsEnum(PlanType)
  planType!: PlanType;

  @IsOptional()
  @IsString()
  interval?: 'month' | 'year';
}
