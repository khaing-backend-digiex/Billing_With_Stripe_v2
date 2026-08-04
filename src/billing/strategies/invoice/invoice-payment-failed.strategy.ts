import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookStrategyInterface } from '../webhook-strategy.interface';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreditService } from '../../../credit/credit.service';
import { SubStatus } from '../../../../generated/prisma/client';

import { AppLogger } from '../../../logger/app-logger';

@Injectable()
export class InvoicePaymentFailedStrategy implements WebhookStrategyInterface {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('InvoicePaymentFailedStrategy');
  }

  supports(eventType: string): boolean {
    return eventType === 'invoice.payment_failed';
  }

  async handle(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const invoiceId = invoice.id;

    this.logger.log(`Processing invoice.payment_failed: ${invoiceId}`);

    const invoiceWithSub = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
    const subscriptionId = typeof invoiceWithSub.subscription === 'string'
      ? invoiceWithSub.subscription
      : invoiceWithSub.subscription?.id;

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

    const attemptCount = invoice.attempt_count;

    if (attemptCount < 3) {
      this.logger.warn(
        `Payment failed for subscription ${subscription.id} (attempt ${attemptCount}/3). Grace period active.`,
      );
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: SubStatus.PAST_DUE },
      });

      await this.creditService.freezeAddonCredits(subscription.userId, tx);

      await tx.creditBalance.update({
        where: { userId: subscription.userId },
        data: { planCredits: 0 },
      });
    });

    this.logger.log(`Payment failed 3 times: subscription ${subscription.id} marked as PAST_DUE, credits frozen`);
  }
}
