import { Injectable } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import { STRIPE_EVENT_PRODUCT_DELETED } from '@/common/constants/stripe-event.constants';
import { PrismaService } from '@/prisma/prisma.service';
import Stripe from 'stripe';

@Injectable()
export class ProductDeletedStrategy implements WebhookStrategy {
  constructor(private readonly prisma: PrismaService) {}

  supports(eventType: string): boolean {
    return eventType === STRIPE_EVENT_PRODUCT_DELETED;
  }

  async handle(event: WebhookEvent): Promise<void> {
    const product = event.payload as Stripe.Product;

    await this.prisma.stripeProduct.delete({
      where: {
        stripeProductId: product.id,
      },
    }).catch((e) => {
       if (e.code !== 'P2025') {
        throw e;
      }
    });
  }
}
