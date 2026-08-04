import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { AppLogger } from '../logger/app-logger';
import { ErrorCode } from '../common/enums/error-code.enum';
import { ServiceError } from '../common/exceptions/service-error.exception';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('StripeService');

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

  async createProduct(name: string, metadata?: Record<string, string>): Promise<Stripe.Product> {
    try {
      return await this.stripe.products.create({
        name,
        metadata,
      });
    } catch (error) {
      this.handleStripeError(error, 'Failed to create product', 'products.create');
    }
  }

  async createPrice(
    productId: string,
    amount: number,
    currency: string,
    interval?: 'month' | 'year',
  ): Promise<Stripe.Price> {
    try {
      const priceData: Stripe.PriceCreateParams = {
        product: productId,
        unit_amount: amount,
        currency: currency.toLowerCase(),
      };

      if (interval) {
        priceData.recurring = { interval };
      }

      return await this.stripe.prices.create(priceData);
    } catch (error) {
      this.handleStripeError(error, 'Failed to create price', 'prices.create');
    }
  }

  async updateProduct(productId: string, updates: { name?: string; active?: boolean }): Promise<Stripe.Product> {
    try {
      return await this.stripe.products.update(productId, updates);
    } catch (error) {
      this.handleStripeError(error, 'Failed to update product', 'products.update');
    }
  }

  async updatePrice(priceId: string, updates: { active?: boolean }): Promise<Stripe.Price> {
    try {
      return await this.stripe.prices.update(priceId, updates);
    } catch (error) {
      this.handleStripeError(error, 'Failed to update price', 'prices.update');
    }
  }

  async createCheckoutSession(params: {
    priceId: string;
    customerId: string;
    mode: 'subscription' | 'payment';
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Checkout.Session> {
    try {
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

      return await this.stripe.checkout.sessions.create(sessionParams);
    } catch (error) {
      this.handleStripeError(error, 'Failed to create checkout session', 'checkout.sessions.create');
    }
  }

  async createCustomer(email: string, metadata?: Record<string, string>): Promise<Stripe.Customer> {
    try {
      return await this.stripe.customers.create({
        email,
        metadata,
      });
    } catch (error) {
      this.handleStripeError(error, 'Failed to create customer', 'customers.create');
    }
  }

  async createSubscription(params: {
    customerId: string;
    priceId: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.create({
        customer: params.customerId,
        items: [
          {
            price: params.priceId,
          },
        ],
        metadata: params.metadata,
      });
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
    },
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);

      return await this.stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: params.newPriceId,
          },
        ],
        proration_behavior: params.prorationBehavior || 'create_prorations',
        metadata: params.metadata,
      });
    } catch (error) {
      this.handleStripeError(error, 'Failed to update subscription', 'subscriptions.update');
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.cancel(subscriptionId);
    } catch (error) {
      this.handleStripeError(error, 'Failed to cancel subscription', 'subscriptions.cancel');
    }
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      this.handleStripeError(error, 'Failed to retrieve subscription', 'subscriptions.retrieve');
    }
  }

  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      return await this.stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      this.handleStripeError(error, 'Failed to retrieve checkout session', 'checkout.sessions.retrieve');
    }
  }

  verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (err) {
      throw new ServiceError(ErrorCode.INVALID_WEBHOOK_SIGNATURE, 'Invalid webhook signature');
    }
  }

  async getProduct(productId: string): Promise<Stripe.Product> {
    try {
      return await this.stripe.products.retrieve(productId);
    } catch (error) {
      this.handleStripeError(error, 'Failed to retrieve product', 'products.retrieve');
    }
  }

  async getPrice(priceId: string): Promise<Stripe.Price> {
    try {
      return await this.stripe.prices.retrieve(priceId);
    } catch (error) {
      this.handleStripeError(error, 'Failed to retrieve price', 'prices.retrieve');
    }
  }

  async listPrices(productId: string): Promise<Stripe.Price[]> {
    try {
      const prices = await this.stripe.prices.list({
        product: productId,
        active: true,
      });
      return prices.data;
    } catch (error) {
      this.handleStripeError(error, 'Failed to list prices', 'prices.list');
    }
  }
}
