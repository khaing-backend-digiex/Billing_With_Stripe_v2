import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreditModule } from '../credit/credit.module';
import { AuthModule } from '../auth/auth.module';
@Module({
  imports: [CreditModule, AuthModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, StripeService, PrismaService],
  exports: [BillingService],
})
export class BillingModule {}
