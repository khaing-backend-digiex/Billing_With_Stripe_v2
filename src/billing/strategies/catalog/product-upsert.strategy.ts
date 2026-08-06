import { Injectable } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import {
  STRIPE_EVENT_PRODUCT_CREATED,
  STRIPE_EVENT_PRODUCT_UPDATED,
} from '@/common/constants/stripe-event.constants';
import { PrismaService } from '@/prisma/prisma.service';
import { AppLogger } from '@/logger/app-logger';
import { PlanType } from '../../../../generated/prisma/client';
import Stripe from 'stripe';

@Injectable()
export class ProductUpsertStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('ProductUpsertStrategy');
  }

  supports(eventType: string): boolean {
    return (
      eventType === STRIPE_EVENT_PRODUCT_CREATED ||
      eventType === STRIPE_EVENT_PRODUCT_UPDATED
    );
  }

  async handle(event: WebhookEvent): Promise<void> {
    const product = event.payload as Stripe.Product;

    const planTypeStr = product.metadata?.planType;
    let planType: PlanType;

    if (!planTypeStr) {
      this.logger.warn(`Product ${product.id} does not have 'planType' in metadata. Skipping upsert.`);
      return;
    }

    if (Object.values(PlanType).includes(planTypeStr as PlanType)) {
      planType = planTypeStr as PlanType;
    } else {
      this.logger.warn(`Product ${product.id} has invalid 'planType': ${planTypeStr}. Skipping upsert.`);
      return;
    }

    await this.prisma.stripeProduct.upsert({
      where: {
        stripeProductId: product.id,
      },
      update: {
        name: product.name,
        planType,
        isActive: product.active,
      },
      create: {
        stripeProductId: product.id,
        name: product.name,
        planType,
        isActive: product.active,
      },
    });

    this.logger.log(`Upserted StripeProduct: ${product.id} (${product.name})`);
  }
}
