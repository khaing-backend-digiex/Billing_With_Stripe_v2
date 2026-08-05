import { IsString, IsIn, IsNotEmpty } from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@/common/constants/currency.constants';

export class CreateSubscriptionCheckoutDto {
  @IsString()
  priceId!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string;
}
