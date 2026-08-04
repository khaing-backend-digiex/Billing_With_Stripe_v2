import { Module, forwardRef } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PaymentService } from './payment.service';
import { StripeAdapter } from './payments/adapters/stripe.adapter';
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
import { WebhookStrategy } from './strategies/webhook-strategy.interface';

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
    forwardRef(() => CreditModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [BillingController, StripeWebhookController],
  providers: [
    BillingService,
    PaymentService,
    {
      provide: 'PAYMENT_ADAPTER',
      useClass: StripeAdapter,
    },
    ...webhookStrategies,
    {
      provide: 'WEBHOOK_STRATEGIES',
      useFactory: (...strategies: WebhookStrategy[]) => strategies,
      inject: webhookStrategies,
    },
    WebhookStrategyFactory,
    WebhookProcessorService,
  ],
  exports: [BillingService, PaymentService],
})
export class BillingModule { }
