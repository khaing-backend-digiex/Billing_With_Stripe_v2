import { IsEmail, IsString, MinLength, IsDateString, IsNotEmpty } from 'class-validator';
import { IsPastDateString } from '../decorators/is-past-date.decorator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  firstname!: string;

  @IsString()
  @IsNotEmpty()
  lastname!: string;

  @IsDateString()
  @IsPastDateString()
  dateOfBirth!: string;
}
