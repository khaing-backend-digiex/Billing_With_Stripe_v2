import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined');
    }
    
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not defined');
    }

    this.webhookSecret = webhookSecret;
    
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-06-24.dahlia',
    });
  }

  async createProduct(name: string, metadata?: Record<string, string>): Promise<Stripe.Product> {
    return this.stripe.products.create({
      name,
      metadata,
    });
  }

  async createPrice(
    productId: string,
    amount: number,
    currency: string,
    interval?: 'month' | 'year',
  ): Promise<Stripe.Price> {
    const priceData: Stripe.PriceCreateParams = {
      product: productId,
      unit_amount: amount,
      currency: currency.toLowerCase(),
    };

    if (interval) {
      priceData.recurring = { interval };
    }

    return this.stripe.prices.create(priceData);
  }

  async updateProduct(productId: string, updates: { name?: string; active?: boolean }): Promise<Stripe.Product> {
    return this.stripe.products.update(productId, updates);
  }

  async updatePrice(priceId: string, updates: { active?: boolean }): Promise<Stripe.Price> {
    return this.stripe.prices.update(priceId, updates);
  }

  async createCheckoutSession(params: {
    priceId: string;
    customerId: string;
    mode: 'subscription' | 'payment';
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Checkout.Session> {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
      mode: params.mode,
      customer: params.customerId,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    };

    return this.stripe.checkout.sessions.create(sessionParams);
  }

  async createCustomer(email: string, metadata?: Record<string, string>): Promise<Stripe.Customer> {
    return this.stripe.customers.create({
      email,
      metadata,
    });
  }

  async createSubscription(params: {
    customerId: string;
    priceId: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.create({
      customer: params.customerId,
      items: [
        {
          price: params.priceId,
        },
      ],
      metadata: params.metadata,
    });
  }

  async updateSubscription(
    subscriptionId: string,
    params: {
      newPriceId: string;
      prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
      metadata?: Record<string, string>;
    },
  ): Promise<Stripe.Subscription> {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);

    return this.stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: params.newPriceId,
        },
      ],
      proration_behavior: params.prorationBehavior || 'create_prorations',
      metadata: params.metadata,
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.cancel(subscriptionId);
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.retrieve(sessionId);
  }

  verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }

  async getProduct(productId: string): Promise<Stripe.Product> {
    return this.stripe.products.retrieve(productId);
  }

  async getPrice(priceId: string): Promise<Stripe.Price> {
    return this.stripe.prices.retrieve(priceId);
  }

  async listPrices(productId: string): Promise<Stripe.Price[]> {
    const prices = await this.stripe.prices.list({
      product: productId,
      active: true,
    });
    return prices.data;
  }
}
