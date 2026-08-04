import {
  PaymentCustomer,
  PaymentSubscription,
  PaymentInvoice,
  PaymentSession,
  PaymentMethodDetails,
  SetupIntentResult,
  OffSessionPaymentResult,
  OffSessionSubscriptionResult,
  BillingPortalSession,
  WebhookEvent,
  PaymentProduct,
  PaymentPrice,
} from '@/billing/payments/types/payment.types';

export interface IPaymentAdapter {
  createProduct(name: string, metadata?: Record<string, string>): Promise<PaymentProduct>;
  updateProduct(productId: string, updates: { name?: string; active?: boolean }): Promise<PaymentProduct>;
  getProduct(productId: string): Promise<PaymentProduct>;
  
  createPrice(productId: string, amount: number, currency: string, interval?: 'month' | 'year'): Promise<PaymentPrice>;
  updatePrice(priceId: string, updates: { active?: boolean }): Promise<PaymentPrice>;
  getPrice(priceId: string): Promise<PaymentPrice>;
  listPrices(productId: string): Promise<PaymentPrice[]>;

  createCustomer(email: string, name?: string, metadata?: Record<string, string>): Promise<PaymentCustomer>;
  deleteCustomer(customerId: string): Promise<void>;
  getCustomer(customerId: string): Promise<PaymentCustomer | null>;
  customerExists(customerId: string): Promise<boolean>;

  createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    mode: 'subscription' | 'payment';
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentSession>;
  getCheckoutSession(sessionId: string): Promise<PaymentSession>;

  createSubscription(customerId: string, priceId: string, metadata?: Record<string, string>): Promise<PaymentSubscription>;
  updateSubscription(
    subscriptionId: string,
    params: {
      newPriceId: string;
      prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
      metadata?: Record<string, string>;
    }
  ): Promise<PaymentSubscription>;
  cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<void>;
  cancelSubscriptionNow(subscriptionId: string): Promise<void>;
  getSubscription(subscriptionId: string): Promise<PaymentSubscription | null>;
  listSubscriptions(customerId: string): Promise<PaymentSubscription[]>;

  upgradeSubscriptionTier(subscriptionId: string, newPriceId: string): Promise<PaymentSubscription>;
  upgradeSubscriptionCycle(subscriptionId: string, newPriceId: string): Promise<PaymentSubscription>;
  previewUpgradeSubscriptionTier(customerId: string, subscriptionId: string, newPriceId: string): Promise<unknown>;
  previewUpgradeSubscriptionCycle(customerId: string, subscriptionId: string, newPriceId: string): Promise<unknown>;

  getLatestPaidInvoice(subscriptionId: string): Promise<PaymentInvoice | null>;

  createOffSessionSubscription(params: {
    customerId: string;
    priceId: string;
    paymentMethodId: string;
    metadata?: Record<string, string>;
  }): Promise<OffSessionSubscriptionResult>;

  createOffSessionPayment(params: {
    customerId: string;
    paymentMethodId: string;
    amount: number;
    currency: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<OffSessionPaymentResult>;

  createSetupIntent(customerId: string): Promise<SetupIntentResult>;
  getPaymentMethod(paymentMethodId: string): Promise<PaymentMethodDetails | null>;
  listPaymentMethods(customerId: string): Promise<PaymentMethodDetails[]>;
  detachPaymentMethod(paymentMethodId: string): Promise<void>;
  setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>;
  getDefaultPaymentMethodId(customerId: string): Promise<string | null>;

  createBillingPortalSession(customerId: string, returnUrl?: string): Promise<BillingPortalSession>;

  constructWebhookEvent(rawBody: Buffer | string, signature: string): WebhookEvent;
  
  mapRawPaymentMethod(rawPaymentMethod: unknown): PaymentMethodDetails;
  mapRawSubscription(rawSubscription: unknown): PaymentSubscription;
  mapRawInvoice(rawInvoice: unknown): PaymentInvoice;
}
