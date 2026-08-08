import { Injectable } from '@nestjs/common';
import { WebhookStrategy } from '../webhook-strategy.interface';
import { PrismaService } from '@/prisma/prisma.service';
import { PaymentService } from '@/billing/payment.service';
import { AppLogger } from '@/logger/app-logger';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import { STRIPE_EVENT_INVOICE_CREATED } from '@/common/constants/stripe-event.constants';
import { InvoiceStatus } from '../../../../generated/prisma/client';

@Injectable()
export class InvoiceCreatedStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('InvoiceCreatedStrategy');
  }

  supports(eventType: string): boolean {
    return eventType === STRIPE_EVENT_INVOICE_CREATED;
  }

  async handle(event: WebhookEvent): Promise<void> {
    const invoiceData = this.paymentService.mapRawInvoice(event.payload);

    this.logger.log(
      `Invoice created: ${invoiceData.id}, subscription: ${invoiceData.subscriptionId}, amount: ${invoiceData.amountDue}`,
    );

    if (!invoiceData.subscriptionId) {
      this.logger.warn(`Invoice ${invoiceData.id} has no subscription, skipping`);
      return;
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: invoiceData.subscriptionId },
    });

    if (!subscription) {
      this.logger.warn(
        `Subscription ${invoiceData.subscriptionId} not found for invoice ${invoiceData.id}`,
      );
      return;
    }

    await this.prisma.invoice.create({
      data: {
        stripeInvoiceId: invoiceData.id,
        subscriptionId: subscription.id,
        userId: subscription.userId,
        amountDue: invoiceData.amountDue,
        amountPaid: invoiceData.amountPaid,
        currency: invoiceData.currency,
        status: InvoiceStatus.DRAFT,
        hostedInvoiceUrl: invoiceData.hostedInvoiceUrl,
        invoicePdf: invoiceData.invoicePdf,
        periodStart: new Date(invoiceData.periodStart * 1000),
        periodEnd: new Date(invoiceData.periodEnd * 1000),
      },
    });

    this.logger.log(`Invoice ${invoiceData.id} created in database`);
  }
}
