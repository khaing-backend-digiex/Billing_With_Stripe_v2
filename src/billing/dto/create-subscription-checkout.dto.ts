import { IsString, IsIn, IsNotEmpty } from 'class-validator';

export class CreateSubscriptionCheckoutDto {
  @IsString()
  priceId!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['VND', 'USD', 'EUR', 'GBP'])
  currency!: string;
}
