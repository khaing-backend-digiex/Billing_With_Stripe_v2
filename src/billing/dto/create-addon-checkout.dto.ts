import { IsString } from 'class-validator';

export class CreateAddonCheckoutDto {
  @IsString()
  priceId!: string;
}
