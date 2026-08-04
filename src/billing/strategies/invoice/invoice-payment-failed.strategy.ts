import { Injectable } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { AppLogger } from '@/logger/app-logger';
import { PaymentService } from '@/billing/payment.service';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import { PrismaService } from '@/prisma/prisma.service';
import { CreditService } from '@/credit/credit.service';
import { MAX_INVOICE_RETRY_ATTEMPTS } from '@/common/constants/billing.constants';
import { SubStatus } from '../../../../generated/prisma/client';
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
    return eventType === 'invoice.payment_failed';
  }

  async handle(event: WebhookEvent): Promise<void> {
    const failedInvoice = this.paymentService.mapRawInvoice(event.payload);
    const invoiceId = failedInvoice.id;

    this.logger.log(`Processing invoice.payment_failed: ${invoiceId}`);

    const stripeSubscriptionId = failedInvoice.subscriptionId;

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

    const attemptCount = failedInvoice.attemptCount || 1;

    if (attemptCount < MAX_INVOICE_RETRY_ATTEMPTS) {
      this.logger.log(`Invoice ${invoiceId} payment failed. Attempt ${attemptCount} of ${MAX_INVOICE_RETRY_ATTEMPTS}. Stripe will retry.`);
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

    this.logger.log(`Payment failed ${MAX_INVOICE_RETRY_ATTEMPTS} times: subscription ${subscription.id} marked as PAST_DUE, credits frozen`);
  }
}
