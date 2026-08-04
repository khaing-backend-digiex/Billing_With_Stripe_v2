import { Module, forwardRef } from '@nestjs/common';
import { CreditController } from '@/credit/credit.controller';
import { CreditService } from '@/credit/credit.service';
import { CreditResetCronService } from '@/credit/credit-reset.cron';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthModule } from '@/auth/auth.module';
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [CreditController],
  providers: [CreditService, CreditResetCronService, PrismaService],
  exports: [CreditService],
})
export class CreditModule {}
