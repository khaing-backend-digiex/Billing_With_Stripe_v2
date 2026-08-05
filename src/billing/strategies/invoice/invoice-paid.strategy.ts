import { Injectable, Logger } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { PaymentService } from '@/billing/payment.service';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import { PrismaService } from '@/prisma/prisma.service';
import { CreditService } from '@/credit/credit.service';
import { SubStatus } from '../../../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS } from '@/common/constants/plan.constants';
import { AppLogger } from '@/logger/app-logger';
import { STRIPE_EVENT_INVOICE_PAID } from '@/common/constants/stripe-event.constants';

@Injectable()
export class InvoicePaidStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
    private readonly paymentService: PaymentService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('InvoicePaidStrategy');
  }

  supports(eventType: string): boolean {
    return eventType === STRIPE_EVENT_INVOICE_PAID;
  }

  async handle(event: WebhookEvent): Promise<void> {
    const paidInvoice = this.paymentService.mapRawInvoice(event.payload);
    const invoiceId = paidInvoice.id;

    this.logger.log(`Processing invoice.paid: ${invoiceId}`);

    const stripeSubscriptionId = paidInvoice.subscriptionId;

    if (!stripeSubscriptionId) {
      this.logger.warn(`Invoice ${invoiceId} has no subscription (one-time payment)`);
      return;
    }

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
