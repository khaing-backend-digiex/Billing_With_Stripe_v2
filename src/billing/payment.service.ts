import { Injectable, Inject } from '@nestjs/common';
import { IPaymentAdapter } from '@/billing/payments/types/payment-adapter.interface';
import {
  PaymentCustomer,
  PaymentSubscription,
  PaymentSession,
  PaymentProduct,
  PaymentPrice,
  WebhookEvent,
} from '@/billing/payments/types/payment.types';

export const PAYMENT_ADAPTER_TOKEN = 'PAYMENT_ADAPTER';

@Injectable()
export class PaymentService {
  constructor(
    @Inject(PAYMENT_ADAPTER_TOKEN)
    private readonly paymentAdapter: IPaymentAdapter,
  ) {}

  async createProduct(name: string, metadata?: Record<string, string>): Promise<PaymentProduct> {
    return this.paymentAdapter.createProduct(name, metadata);
  }

  async createPrice(
    productId: string,
    amount: number,
    currency: string,
    interval?: 'month' | 'year',
  ): Promise<PaymentPrice> {
    return this.paymentAdapter.createPrice(productId, amount, currency, interval);
  }

  async updateProduct(productId: string, updates: { name?: string; active?: boolean }): Promise<PaymentProduct> {
    return this.paymentAdapter.updateProduct(productId, updates);
  }

  async updatePrice(priceId: string, updates: { active?: boolean }): Promise<PaymentPrice> {
    return this.paymentAdapter.updatePrice(priceId, updates);
  }

  async createCheckoutSession(params: {
    priceId: string;
    customerId: string;
    mode: 'subscription' | 'payment';
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentSession> {
    return this.paymentAdapter.createCheckoutSession({
      customerId: params.customerId,
      priceId: params.priceId,
      mode: params.mode,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      metadata: params.metadata,
    });
  }

  async createCustomer(email: string, metadata?: Record<string, string>): Promise<PaymentCustomer> {
    return this.paymentAdapter.createCustomer(email, undefined, metadata);
  }

  async createSubscription(params: {
    customerId: string;
    priceId: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentSubscription> {
    return this.paymentAdapter.createSubscription(params.customerId, params.priceId, params.metadata);
  }

  async updateSubscription(
    subscriptionId: string,
    params: {
      newPriceId: string;
      prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
      metadata?: Record<string, string>;
    },
  ): Promise<PaymentSubscription> {
    return this.paymentAdapter.updateSubscription(subscriptionId, {
      newPriceId: params.newPriceId,
      prorationBehavior: params.prorationBehavior,
      metadata: params.metadata,
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    return this.paymentAdapter.cancelSubscriptionNow(subscriptionId);
  }

  async getSubscription(subscriptionId: string): Promise<PaymentSubscription | null> {
    return this.paymentAdapter.getSubscription(subscriptionId);
  }

  async getCheckoutSession(sessionId: string): Promise<PaymentSession> {
    return this.paymentAdapter.getCheckoutSession(sessionId);
  }

  verifyWebhookSignature(payload: string | Buffer, signature: string): WebhookEvent {
    return this.paymentAdapter.constructWebhookEvent(payload, signature);
  }

  async getProduct(productId: string): Promise<PaymentProduct> {
    return this.paymentAdapter.getProduct(productId);
  }

  async getPrice(priceId: string): Promise<PaymentPrice> {
    return this.paymentAdapter.getPrice(priceId);
  }

  async listPrices(productId: string): Promise<PaymentPrice[]> {
    return this.paymentAdapter.listPrices(productId);
  }

  mapRawInvoice(rawInvoice: unknown) {
    return this.paymentAdapter.mapRawInvoice(rawInvoice);
  }

  mapRawSubscription(rawSubscription: unknown) {
    return this.paymentAdapter.mapRawSubscription(rawSubscription);
  }
}
