import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreditModule } from '../credit/credit.module';
import { AuthModule } from '../auth/auth.module';
import { WebhookStrategyFactory } from './strategies/webhook-strategy.factory';
import { WebhookProcessorService } from './webhook-processor.service';
import { CheckoutSessionCompletedStrategy } from './strategies/checkout/checkout-session-completed.strategy';
import { InvoicePaidStrategy } from './strategies/invoice/invoice-paid.strategy';
import { InvoicePaymentFailedStrategy } from './strategies/invoice/invoice-payment-failed.strategy';
import { CustomerSubscriptionUpdatedStrategy } from './strategies/subscription/customer-subscription-updated.strategy';
import { CustomerSubscriptionDeletedStrategy } from './strategies/subscription/customer-subscription-deleted.strategy';
import { ScheduleModule } from '@nestjs/schedule';

const webhookStrategies = [
  CheckoutSessionCompletedStrategy,
  InvoicePaidStrategy,
  InvoicePaymentFailedStrategy,
  CustomerSubscriptionUpdatedStrategy,
  CustomerSubscriptionDeletedStrategy,
];

@Module({
  imports: [
    ScheduleModule.forRoot(),
    CreditModule,
    AuthModule,
  ],
  controllers: [BillingController, StripeWebhookController],
  providers: [
    BillingService,
    StripeService,
    PrismaService,
    ...webhookStrategies,
    {
      provide: 'WEBHOOK_STRATEGIES',
      useFactory: (...strategies) => strategies,
      inject: webhookStrategies,
    },
    WebhookStrategyFactory,
    WebhookProcessorService,
  ],
  exports: [BillingService],
})
export class BillingModule {}
