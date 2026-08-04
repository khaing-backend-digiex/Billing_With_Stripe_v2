import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { IPaymentAdapter } from '@/billing/payments/types/payment-adapter.interface';
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
import { AppLogger } from '@/logger/app-logger';
import { ErrorCode } from '@/common/enums/error-code.enum';
import { ServiceError } from '@/common/exceptions/service-error.exception';

@Injectable()
export class StripeAdapter implements IPaymentAdapter {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('StripeAdapter');

    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!secretKey) {
      throw new ServiceError(ErrorCode.INTERNAL_ERROR, 'STRIPE_SECRET_KEY is not defined');
    }

    if (!webhookSecret) {
      throw new ServiceError(ErrorCode.INTERNAL_ERROR, 'STRIPE_WEBHOOK_SECRET is not defined');
    }

    this.webhookSecret = webhookSecret;

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-06-24.dahlia',
    });
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String((error as Record<string, unknown>).message);
    }
    return String(error);
  }

  private handleStripeError(error: unknown, message: string, endpoint: string): never {
    this.logger.error(message, error instanceof Error ? error.stack : undefined);
    throw new ServiceError(ErrorCode.STRIPE_API_ERROR, message, { originalError: this.extractErrorMessage(error), endpoint });
  }

  private mapRawProduct(product: Stripe.Product): PaymentProduct {
    return { id: product.id, name: product.name, active: product.active, metadata: product.metadata as Record<string, string> };
  }

  private mapRawPrice(price: Stripe.Price): PaymentPrice {
    return {
      id: price.id,
      productId: typeof price.product === 'string' ? price.product : price.product.id,
      amount: price.unit_amount || 0,
      currency: price.currency,
      interval: price.recurring?.interval,
      active: price.active,
    };
  }

  async createProduct(name: string, metadata?: Record<string, string>): Promise<PaymentProduct> {
    try {
      const product = await this.stripe.products.create({ name, metadata });
      return this.mapRawProduct(product);
    } catch (error) {
      this.handleStripeError(error, 'Failed to create product', 'products.create');
    }
  }

  async updateProduct(productId: string, updates: { name?: string; active?: boolean }): Promise<PaymentProduct> {
    try {
      const product = await this.stripe.products.update(productId, updates);
      return this.mapRawProduct(product);
    } catch (error) {
      this.handleStripeError(error, 'Failed to update product', 'products.update');
    }
  }

  async getProduct(productId: string): Promise<PaymentProduct> {
    try {
      const product = await this.stripe.products.retrieve(productId);
      return this.mapRawProduct(product);
    } catch (error) {
      this.handleStripeError(error, 'Failed to get product', 'products.retrieve');
    }
  }

  async createPrice(productId: string, amount: number, currency: string, interval?: 'month' | 'year'): Promise<PaymentPrice> {
    try {
      const priceData: Stripe.PriceCreateParams = { product: productId, unit_amount: amount, currency: currency.toLowerCase() };
      if (interval) priceData.recurring = { interval };
      const price = await this.stripe.prices.create(priceData);
      return this.mapRawPrice(price);
    } catch (error) {
      this.handleStripeError(error, 'Failed to create price', 'prices.create');
    }
  }

  async updatePrice(priceId: string, updates: { active?: boolean }): Promise<PaymentPrice> {
    try {
      const price = await this.stripe.prices.update(priceId, updates);
      return this.mapRawPrice(price);
    } catch (error) {
      this.handleStripeError(error, 'Failed to update price', 'prices.update');
    }
  }

  async getPrice(priceId: string): Promise<PaymentPrice> {
    try {
      const price = await this.stripe.prices.retrieve(priceId);
      return this.mapRawPrice(price);
    } catch (error) {
      this.handleStripeError(error, 'Failed to get price', 'prices.retrieve');
    }
  }

  async listPrices(productId: string): Promise<PaymentPrice[]> {
    try {
      const prices = await this.stripe.prices.list({ product: productId, active: true });
      return prices.data.map(price => this.mapRawPrice(price));
    } catch (error) {
      this.handleStripeError(error, 'Failed to list prices', 'prices.list');
    }
  }

  async createCustomer(email: string, name?: string, metadata?: Record<string, string>): Promise<PaymentCustomer> {
    try {
      const customer = await this.stripe.customers.create({ email, name, metadata });
      return { id: customer.id, email: customer.email || email, name: customer.name || undefined, metadata: customer.metadata as Record<string, string> };
    } catch (error) {
      this.handleStripeError(error, 'Failed to create customer', 'customers.create');
    }
  }

  async deleteCustomer(customerId: string): Promise<void> {
    try {
      await this.stripe.customers.del(customerId);
    } catch (error) {
      this.handleStripeError(error, 'Failed to delete customer', 'customers.del');
    }
  }

  async getCustomer(customerId: string): Promise<PaymentCustomer | null> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      if (customer.deleted) return null;
      return { id: customer.id, email: customer.email || '', name: customer.name || undefined, metadata: customer.metadata as Record<string, string> };
    } catch (error) {
      this.handleStripeError(error, 'Failed to retrieve customer', 'customers.retrieve');
    }
  }

  async customerExists(customerId: string): Promise<boolean> {
    const customer = await this.getCustomer(customerId);
    return customer !== null;
  }

  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    mode: 'subscription' | 'payment';
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentSession> {
    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: params.priceId, quantity: 1 }],
        mode: params.mode,
        customer: params.customerId,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
      });
      return { 
        id: session.id, 
        url: session.url,
        subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
        paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
        metadata: session.metadata as Record<string, string>,
      };
    } catch (error) {
      this.handleStripeError(error, 'Failed to create checkout session', 'checkout.sessions.create');
    }
  }

  async getCheckoutSession(sessionId: string): Promise<PaymentSession> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      return { 
        id: session.id, 
        url: session.url,
        subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
        paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
        metadata: session.metadata as Record<string, string>,
      };
    } catch (error) {
      this.handleStripeError(error, 'Failed to retrieve checkout session', 'checkout.sessions.retrieve');
    }
  }

  async createSubscription(customerId: string, priceId: string, metadata?: Record<string, string>): Promise<PaymentSubscription> {
    try {
      const sub = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        metadata,
      });
      return this.mapRawSubscription(sub);
    } catch (error) {
      this.handleStripeError(error, 'Failed to create subscription', 'subscriptions.create');
    }
  }

  async updateSubscription(
    subscriptionId: string,
    params: {
      newPriceId: string;
      prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
      metadata?: Record<string, string>;
    }
  ): Promise<PaymentSubscription> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      const sub = await this.stripe.subscriptions.update(subscriptionId, {
        items: [{ id: subscription.items.data[0].id, price: params.newPriceId }],
        proration_behavior: params.prorationBehavior || 'create_prorations',
        metadata: params.metadata,
      });
      return this.mapRawSubscription(sub);
    } catch (error) {
      this.handleStripeError(error, 'Failed to update subscription', 'subscriptions.update');
    }
  }

  async cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<void> {
    try {
      await this.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    } catch (error) {
      this.handleStripeError(error, 'Failed to cancel subscription', 'subscriptions.update');
    }
  }

  async cancelSubscriptionNow(subscriptionId: string): Promise<void> {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId);
    } catch (error) {
      this.handleStripeError(error, 'Failed to cancel subscription', 'subscriptions.cancel');
    }
  }

  async getSubscription(subscriptionId: string): Promise<PaymentSubscription | null> {
    try {
      const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
      return this.mapRawSubscription(sub);
    } catch (error) {
      this.handleStripeError(error, 'Failed to retrieve subscription', 'subscriptions.retrieve');
    }
  }

  async listSubscriptions(customerId: string): Promise<PaymentSubscription[]> {
    try {
      const subs = await this.stripe.subscriptions.list({ customer: customerId });
      return subs.data.map(sub => this.mapRawSubscription(sub));
    } catch (error) {
      this.handleStripeError(error, 'Failed to list subscriptions', 'subscriptions.list');
    }
  }

  async upgradeSubscriptionTier(subscriptionId: string, newPriceId: string): Promise<PaymentSubscription> {
    return this.updateSubscription(subscriptionId, { newPriceId, prorationBehavior: 'create_prorations' });
  }

  async upgradeSubscriptionCycle(subscriptionId: string, newPriceId: string): Promise<PaymentSubscription> {
    return this.updateSubscription(subscriptionId, { newPriceId, prorationBehavior: 'none' });
  }

  async previewUpgradeSubscriptionTier(customerId: string, subscriptionId: string, newPriceId: string): Promise<unknown> {
    throw new ServiceError(ErrorCode.INTERNAL_ERROR, 'Not implemented');
  }

  async previewUpgradeSubscriptionCycle(customerId: string, subscriptionId: string, newPriceId: string): Promise<unknown> {
    throw new ServiceError(ErrorCode.INTERNAL_ERROR, 'Not implemented');
  }

  async getLatestPaidInvoice(subscriptionId: string): Promise<PaymentInvoice | null> {
    try {
      const invoices = await this.stripe.invoices.list({ subscription: subscriptionId, status: 'paid', limit: 1 });
      if (invoices.data.length === 0) return null;
      return this.mapRawInvoice(invoices.data[0]);
    } catch (error) {
      this.handleStripeError(error, 'Failed to get latest invoice', 'invoices.list');
    }
  }

  async createOffSessionSubscription(params: {
    customerId: string;
    priceId: string;
    paymentMethodId: string;
    metadata?: Record<string, string>;
  }): Promise<OffSessionSubscriptionResult> {
    try {
      const sub = await this.stripe.subscriptions.create({
        customer: params.customerId,
        items: [{ price: params.priceId }],
        default_payment_method: params.paymentMethodId,
        metadata: params.metadata,
        expand: ['latest_invoice.payment_intent'],
      });
      return { id: sub.id, status: sub.status };
    } catch (error) {
      this.handleStripeError(error, 'Failed to create off session subscription', 'subscriptions.create');
    }
  }

  async createOffSessionPayment(params: {
    customerId: string;
    paymentMethodId: string;
    amount: number;
    currency: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<OffSessionPaymentResult> {
    try {
      const pi = await this.stripe.paymentIntents.create({
        amount: params.amount,
        currency: params.currency,
        customer: params.customerId,
        payment_method: params.paymentMethodId,
        off_session: true,
        confirm: true,
        description: params.description,
        metadata: params.metadata,
      });
      return { id: pi.id, status: pi.status };
    } catch (error) {
      this.handleStripeError(error, 'Failed to create off session payment', 'paymentIntents.create');
    }
  }

  async createSetupIntent(customerId: string): Promise<SetupIntentResult> {
    try {
      const intent = await this.stripe.setupIntents.create({ customer: customerId });
      return { id: intent.id, clientSecret: intent.client_secret, status: intent.status };
    } catch (error) {
      this.handleStripeError(error, 'Failed to create setup intent', 'setupIntents.create');
    }
  }

  async getPaymentMethod(paymentMethodId: string): Promise<PaymentMethodDetails | null> {
    try {
      const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
      return this.mapRawPaymentMethod(pm);
    } catch (error) {
      this.handleStripeError(error, 'Failed to get payment method', 'paymentMethods.retrieve');
    }
  }

  async listPaymentMethods(customerId: string): Promise<PaymentMethodDetails[]> {
    try {
      const pms = await this.stripe.paymentMethods.list({ customer: customerId, type: 'card' });
      return pms.data.map(pm => this.mapRawPaymentMethod(pm));
    } catch (error) {
      this.handleStripeError(error, 'Failed to list payment methods', 'paymentMethods.list');
    }
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    try {
      await this.stripe.paymentMethods.detach(paymentMethodId);
    } catch (error) {
      this.handleStripeError(error, 'Failed to detach payment method', 'paymentMethods.detach');
    }
  }

  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    try {
      await this.stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
    } catch (error) {
      this.handleStripeError(error, 'Failed to set default payment method', 'customers.update');
    }
  }

  async getDefaultPaymentMethodId(customerId: string): Promise<string | null> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      if (customer.deleted) return null;
      const defaultPm = customer.invoice_settings?.default_payment_method;
      return typeof defaultPm === 'string' ? defaultPm : defaultPm?.id || null;
    } catch (error) {
      this.handleStripeError(error, 'Failed to get default payment method', 'customers.retrieve');
    }
  }

  async createBillingPortalSession(customerId: string, returnUrl?: string): Promise<BillingPortalSession> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return { id: session.id, url: session.url };
    } catch (error) {
      this.handleStripeError(error, 'Failed to create billing portal session', 'billingPortal.sessions.create');
    }
  }

  constructWebhookEvent(rawBody: Buffer | string, signature: string): WebhookEvent {
    try {
      const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
      return { id: event.id, type: event.type, payload: event.data.object };
    } catch (err) {
      throw new ServiceError(ErrorCode.INVALID_WEBHOOK_SIGNATURE, 'Invalid webhook signature');
    }
  }

  mapRawPaymentMethod(rawPaymentMethod: unknown): PaymentMethodDetails {
    const pm = rawPaymentMethod as Stripe.PaymentMethod;
    return {
      id: pm.id,
      type: pm.type,
      card: pm.card ? {
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
      } : undefined,
    };
  }

  mapRawSubscription(rawSubscription: unknown): PaymentSubscription {
    const sub = rawSubscription as Stripe.Subscription;
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    return {
      id: sub.id,
      customerId,
      status: sub.status,
      items: sub.items.data.map(item => ({ 
        id: item.id, 
        priceId: typeof item.price === 'string' ? item.price : item.price.id,
        priceMetadata: typeof item.price !== 'string' ? item.price.metadata as Record<string, string> : undefined,
      })),
      currentPeriodStart: sub.items.data.length > 0 
        ? Math.min(...sub.items.data.map(item => item.current_period_start)) 
        : 0,
      currentPeriodEnd: sub.items.data.length > 0 
        ? Math.max(...sub.items.data.map(item => item.current_period_end)) 
        : 0,
      cancelAt: sub.cancel_at,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    };
  }

  mapRawInvoice(rawInvoice: unknown): PaymentInvoice {
    const invoice = rawInvoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || null;
    
    const isLineItemProration = (line: Stripe.InvoiceLineItem) => 
      line.parent?.invoice_item_details?.proration || 
      line.parent?.subscription_item_details?.proration || 
      Boolean((line as unknown as { proration?: boolean }).proration);

    let subscriptionId = typeof invoice.subscription === 'string' 
      ? invoice.subscription 
      : invoice.subscription?.id || null;

    if (!subscriptionId && invoice.lines && invoice.lines.data) {
      const lines = invoice.lines.data;
      const lineToUse =
        lines.find((line) => !!line.subscription && !isLineItemProration(line)) ??
        lines.find((line) => !!line.subscription) ??
        lines[0];

      if (lineToUse) {
        subscriptionId = typeof lineToUse.subscription === 'string'
          ? lineToUse.subscription
          : lineToUse.subscription?.id || null;
      }
    }

    return {
      id: invoice.id,
      customerId,
      subscriptionId,
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      status: invoice.status,
      attemptCount: invoice.attempt_count,
      lines: (invoice.lines?.data || []).map(line => ({
        type: line.subscription ? 'subscription' : 'invoiceitem',
        isProration: isLineItemProration(line),
        subscriptionId: typeof line.subscription === 'string' 
          ? line.subscription 
          : line.subscription?.id || undefined,
        priceId: typeof line.pricing?.price_details?.price === 'string' 
          ? line.pricing.price_details.price 
          : line.pricing?.price_details?.price?.id || undefined,
        periodStart: line.period.start,
        periodEnd: line.period.end,
      })),
    };
  }
}
