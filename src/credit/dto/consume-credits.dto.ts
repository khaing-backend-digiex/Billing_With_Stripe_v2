import { IsNumber, Min } from 'class-validator';

export class ConsumeCreditsDto {
  @IsNumber()
  @Min(1)
  amount!: number;
}
