import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookStrategyInterface } from '../webhook-strategy.interface';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreditService } from '../../../credit/credit.service';
import { SubStatus } from '../../../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS } from '../../../constants/plan.constants';

@Injectable()
export class InvoicePaidStrategy implements WebhookStrategyInterface {
  private readonly logger = new Logger(InvoicePaidStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
  ) {}

  supports(eventType: string): boolean {
    return eventType === 'invoice.paid';
  }

  async handle(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const invoiceId = invoice.id;

    this.logger.log(`Processing invoice.paid: ${invoiceId}`);

    const subscriptionId = (invoice as any).subscription as string | undefined;

    if (!subscriptionId) {
      this.logger.warn(`Invoice ${invoiceId} has no subscription (one-time payment)`);
      return;
    }

    const stripeSubscriptionId = subscriptionId;

    const subscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      this.logger.warn(`Subscription not found for stripeSubscriptionId: ${stripeSubscriptionId}`);
      return;
    }

    if (subscription.status === SubStatus.CANCELED) {
      this.logger.warn(`Subscription ${subscription.id} is CANCELED, cannot reactivate`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      if (subscription.status === SubStatus.PAST_DUE) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: SubStatus.ACTIVE },
        });

        await this.creditService.unfreezeAddonCredits(subscription.userId, tx);
      }

      const creditAmount = PLAN_CREDIT_LIMITS[subscription.plan];
      await this.creditService.resetPlanCredits(subscription.userId, creditAmount, tx);
    });

    this.logger.log(`Invoice paid: reset credits and reactivated subscription ${subscription.id}`);
  }
}
