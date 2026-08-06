import { Injectable } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import {
  STRIPE_EVENT_PRICE_DELETED,
  STRIPE_EVENT_PLAN_DELETED,
} from '@/common/constants/stripe-event.constants';
import { PrismaService } from '@/prisma/prisma.service';
import Stripe from 'stripe';

@Injectable()
export class PriceDeletedStrategy implements WebhookStrategy {
  constructor(private readonly prisma: PrismaService) {}

  supports(eventType: string): boolean {
    return (
      eventType === STRIPE_EVENT_PRICE_DELETED ||
      eventType === STRIPE_EVENT_PLAN_DELETED
    );
  }

  async handle(event: WebhookEvent): Promise<void> {
    const price = event.payload as Stripe.Price | Stripe.Plan;

    await this.prisma.stripePrice.delete({
      where: {
        stripePriceId: price.id,
      },
    }).catch((e) => {
       if (e.code !== 'P2025') {
        throw e;
      }
    });
  }
}
