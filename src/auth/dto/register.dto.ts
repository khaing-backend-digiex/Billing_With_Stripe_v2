import { IsEmail, IsString, MinLength, IsDateString, IsNotEmpty, Matches } from 'class-validator';
import { IsPastDateString } from '@/auth/decorators/is-past-date.decorator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, { message: 'Password must contain at least one letter and one number' })
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
