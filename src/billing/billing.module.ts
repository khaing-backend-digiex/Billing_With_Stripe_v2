import { Module, forwardRef } from '@nestjs/common';
import { BillingController } from '@/billing/billing.controller';
import { BillingService } from '@/billing/billing.service';
import { StripeWebhookController } from '@/billing/stripe-webhook.controller';
import { PaymentService, PAYMENT_ADAPTER_TOKEN } from '@/billing/payment.service';
import { StripeAdapter } from '@/billing/payments/adapters/stripe.adapter';
import { CreditModule } from '@/credit/credit.module';
import { AuthModule } from '@/auth/auth.module';
import { WebhookStrategyFactory } from '@/billing/strategies/webhook-strategy.factory';
import { WebhookProcessorService } from '@/billing/webhook-processor.service';
import { CheckoutSessionCompletedStrategy } from '@/billing/strategies/checkout/checkout-session-completed.strategy';
import { InvoiceCreatedStrategy } from '@/billing/strategies/invoice/invoice-created.strategy';
import { InvoiceFinalizedStrategy } from '@/billing/strategies/invoice/invoice-finalized.strategy';
import { InvoicePaidStrategy } from '@/billing/strategies/invoice/invoice-paid.strategy';
import { InvoiceVoidedStrategy } from '@/billing/strategies/invoice/invoice-voided.strategy';
import { InvoicePaymentFailedStrategy } from '@/billing/strategies/invoice/invoice-payment-failed.strategy';
import { CustomerSubscriptionUpdatedStrategy } from '@/billing/strategies/subscription/customer-subscription-updated.strategy';
import { CustomerSubscriptionDeletedStrategy } from '@/billing/strategies/subscription/customer-subscription-deleted.strategy';
import { ProductDeletedStrategy } from '@/billing/strategies/catalog/product-deleted.strategy';
import { ProductUpsertStrategy } from '@/billing/strategies/catalog/product-upsert.strategy';
import { PriceUpsertStrategy } from '@/billing/strategies/catalog/price-upsert.strategy';
import { PriceDeletedStrategy } from '@/billing/strategies/catalog/price-deleted.strategy';
import { SetupIntentSucceededStrategy } from '@/billing/strategies/payment-method/setup-intent-succeeded.strategy';
import { PaymentMethodAttachedStrategy } from '@/billing/strategies/payment-method/payment-method-attached.strategy';
import { PaymentMethodUpdatedStrategy } from '@/billing/strategies/payment-method/payment-method-updated.strategy';
import { PaymentMethodDetachedStrategy } from '@/billing/strategies/payment-method/payment-method-detached.strategy';
import { ScheduleModule } from '@nestjs/schedule';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { WEBHOOK_STRATEGIES_TOKEN } from '@/billing/strategies/webhook-strategy.factory';

const webhookStrategies = [
  CheckoutSessionCompletedStrategy,
  InvoiceCreatedStrategy,
  InvoiceFinalizedStrategy,
  InvoicePaidStrategy,
  InvoiceVoidedStrategy,
  InvoicePaymentFailedStrategy,
  CustomerSubscriptionUpdatedStrategy,
  CustomerSubscriptionDeletedStrategy,
  ProductDeletedStrategy,
  ProductUpsertStrategy,
  PriceUpsertStrategy,
  PriceDeletedStrategy,
  SetupIntentSucceededStrategy,
  PaymentMethodAttachedStrategy,
  PaymentMethodUpdatedStrategy,
  PaymentMethodDetachedStrategy,
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
      provide: PAYMENT_ADAPTER_TOKEN,
      useClass: StripeAdapter,
    },
    ...webhookStrategies,
    {
      provide: WEBHOOK_STRATEGIES_TOKEN,
      useFactory: (...strategies: WebhookStrategy[]) => strategies,
      inject: webhookStrategies,
    },
    WebhookStrategyFactory,
    WebhookProcessorService,
  ],
  exports: [BillingService, PaymentService],
})
export class BillingModule { }
