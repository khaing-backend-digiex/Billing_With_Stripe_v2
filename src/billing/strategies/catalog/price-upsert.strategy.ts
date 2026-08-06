import { Injectable } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import {
  STRIPE_EVENT_PRICE_CREATED,
  STRIPE_EVENT_PRICE_UPDATED,
  STRIPE_EVENT_PLAN_CREATED,
  STRIPE_EVENT_PLAN_UPDATED,
} from '@/common/constants/stripe-event.constants';
import { PrismaService } from '@/prisma/prisma.service';
import { AppLogger } from '@/logger/app-logger';
import Stripe from 'stripe';

@Injectable()
export class PriceUpsertStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('PriceUpsertStrategy');
  }

  supports(eventType: string): boolean {
    return (
      eventType === STRIPE_EVENT_PRICE_CREATED ||
      eventType === STRIPE_EVENT_PRICE_UPDATED ||
      eventType === STRIPE_EVENT_PLAN_CREATED ||
      eventType === STRIPE_EVENT_PLAN_UPDATED
    );
  }

  async handle(event: WebhookEvent): Promise<void> {
    const price = event.payload as Stripe.Price | Stripe.Plan;

    const stripeProductId = typeof price.product === 'string'
      ? price.product
      : (price.product && !price.product.deleted ? price.product.id : null);

    if (!stripeProductId) {
      throw new Error(`Product is missing or deleted for price ${price.id}`);
    }

    const dbProduct = await this.prisma.stripeProduct.findUnique({
      where: { stripeProductId },
    });

    if (!dbProduct) {
      throw new Error(`Associated StripeProduct (${stripeProductId}) not found in database for price ${price.id}`);
    }

    const isPrice = price.object === 'price';
    const interval =
      isPrice
        ? (price as Stripe.Price).recurring?.interval ?? null
        : (price as Stripe.Plan).interval ?? null;
    const amount =
      isPrice
        ? (price as Stripe.Price).unit_amount ?? 0
        : (price as Stripe.Plan).amount ?? 0;

    await this.prisma.stripePrice.upsert({
      where: {
        stripePriceId: price.id,
      },
      update: {
        amount: amount,
        currency: price.currency,
        interval,
        isActive: price.active,
      },
      create: {
        stripePriceId: price.id,
        productId: dbProduct.id,
        amount: amount,
        currency: price.currency,
        interval,
        isActive: price.active,
      },
    });

    this.logger.log(`Upserted StripePrice: ${price.id}`);
  }
}
