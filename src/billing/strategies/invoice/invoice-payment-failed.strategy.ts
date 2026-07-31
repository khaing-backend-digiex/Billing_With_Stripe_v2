import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookStrategyInterface } from '../webhook-strategy.interface';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreditService } from '../../../credit/credit.service';
import { SubStatus } from '../../../../generated/prisma/client';

@Injectable()
export class InvoicePaymentFailedStrategy implements WebhookStrategyInterface {
  private readonly logger = new Logger(InvoicePaymentFailedStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
  ) {}

  supports(eventType: string): boolean {
    return eventType === 'invoice.payment_failed';
  }

  async handle(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const invoiceId = invoice.id;

    this.logger.log(`Processing invoice.payment_failed: ${invoiceId}`);

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

    this.logger.log(`Payment failed: subscription ${subscription.id} marked as PAST_DUE, credits frozen`);
  }
}
