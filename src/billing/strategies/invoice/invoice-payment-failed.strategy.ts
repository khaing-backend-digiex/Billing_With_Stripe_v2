import { Injectable } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { AppLogger } from '@/logger/app-logger';
import { PaymentService } from '@/billing/payment.service';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import { PrismaService } from '@/prisma/prisma.service';
import { CreditService } from '@/credit/credit.service';
import { MAX_INVOICE_RETRY_ATTEMPTS } from '@/common/constants/billing.constants';
import { SubStatus } from '../../../../generated/prisma/client';
import { STRIPE_EVENT_INVOICE_FAILED } from '@/common/constants/stripe-event.constants';

const DEFAULT_ATTEMPT_COUNT = 1;
const ZERO_CREDITS = 0;

@Injectable()
export class InvoicePaymentFailedStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
    private readonly paymentService: PaymentService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(InvoicePaymentFailedStrategy.name);
  }

  supports(eventType: string): boolean {
    return eventType === STRIPE_EVENT_INVOICE_FAILED;
  }

  async handle(event: WebhookEvent): Promise<void> {
    const failedInvoice = this.paymentService.mapRawInvoice(event.payload);
    const invoiceId = failedInvoice.id;
    const stripeSubscriptionId = failedInvoice.subscriptionId;
    const attemptCount = failedInvoice.attemptCount || DEFAULT_ATTEMPT_COUNT;

    this.logger.log(`Invoice payment failed: invoiceId=${invoiceId}, subscriptionId=${stripeSubscriptionId}, attemptCount=${attemptCount}`);

    if (!stripeSubscriptionId) {
      this.logger.warn(`Invoice ${invoiceId} has no subscription (one-time payment)`);
      return;
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      this.logger.warn(`Subscription not found for failed invoice: invoiceId=${invoiceId}, subscriptionId=${stripeSubscriptionId}`);
      return;
    }

    if (attemptCount < MAX_INVOICE_RETRY_ATTEMPTS) {
      this.logger.log(`Invoice ${invoiceId} payment failed. Attempt ${attemptCount} of ${MAX_INVOICE_RETRY_ATTEMPTS}. Stripe will retry.`);
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Update subscription status to PAST_DUE
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: SubStatus.PAST_DUE },
        });
        this.logger.log(`Subscription status changed to PAST_DUE: subscriptionId=${subscription.id}`);

        // Freeze addon credits
        await this.creditService.freezeAddonCredits(subscription.userId, tx);
        this.logger.log(`Addon credits frozen: userId=${subscription.userId}`);

        // Reset plan credits to zero
        await tx.creditBalance.update({
          where: { userId: subscription.userId },
          data: { planCredits: ZERO_CREDITS },
        });
        this.logger.log(`Plan credits reset to zero: userId=${subscription.userId}`);
      });

      this.logger.log(`Payment failed ${MAX_INVOICE_RETRY_ATTEMPTS} times: subscription=${subscription.id}, status=PAST_DUE, credits frozen`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Invoice failure processing failed: invoiceId=${invoiceId} - ${errorMessage}`);
      throw error;
    }
  }
}
