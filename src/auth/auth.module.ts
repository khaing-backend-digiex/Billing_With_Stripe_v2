import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from '@/auth/auth.service';
import { AuthController } from '@/auth/auth.controller';
import { PrismaModule } from '@/prisma/prisma.module';
import { BillingModule } from '@/billing/billing.module';
import { CreditModule } from '@/credit/credit.module';
import { ENV_JWT_SECRET, ENV_JWT_EXPIRES_IN } from '@/common/constants/env.constants';
import { JWT_EXPIRES_IN } from '@/common/constants/auth.constants';
import { ERROR_JWT_SECRET_NOT_DEFINED } from '@/common/constants/error-messages.constants';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => BillingModule),
    forwardRef(() => CreditModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>(ENV_JWT_SECRET);
        if (!secret) {
          throw new Error(ERROR_JWT_SECRET_NOT_DEFINED);
        }
        return {
          secret,
          signOptions: {
            expiresIn: configService.get<string>(ENV_JWT_EXPIRES_IN, JWT_EXPIRES_IN) as import('ms').StringValue,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
