import { Module, forwardRef } from '@nestjs/common';
import { BillingController } from '@/billing/billing.controller';
import { BillingService } from '@/billing/billing.service';
import { StripeWebhookController } from '@/billing/stripe-webhook.controller';
import { PaymentService } from '@/billing/payment.service';
import { StripeAdapter } from '@/billing/payments/adapters/stripe.adapter';
import { CreditModule } from '@/credit/credit.module';
import { AuthModule } from '@/auth/auth.module';
import { WebhookStrategyFactory } from '@/billing/strategies/webhook-strategy.factory';
import { WebhookProcessorService } from '@/billing/webhook-processor.service';
import { CheckoutSessionCompletedStrategy } from '@/billing/strategies/checkout/checkout-session-completed.strategy';
import { InvoicePaidStrategy } from '@/billing/strategies/invoice/invoice-paid.strategy';
import { InvoicePaymentFailedStrategy } from '@/billing/strategies/invoice/invoice-payment-failed.strategy';
import { CustomerSubscriptionUpdatedStrategy } from '@/billing/strategies/subscription/customer-subscription-updated.strategy';
import { CustomerSubscriptionDeletedStrategy } from '@/billing/strategies/subscription/customer-subscription-deleted.strategy';
import { ScheduleModule } from '@nestjs/schedule';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';

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
