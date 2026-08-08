import { Injectable } from '@nestjs/common';
import { WebhookStrategy } from '../webhook-strategy.interface';
import { PrismaService } from '@/prisma/prisma.service';
import { PaymentService } from '@/billing/payment.service';
import { AppLogger } from '@/logger/app-logger';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import { STRIPE_EVENT_INVOICE_VOIDED } from '@/common/constants/stripe-event.constants';
import { InvoiceStatus } from '../../../../generated/prisma/client';

@Injectable()
export class InvoiceVoidedStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly logger: AppLogger,
  ) {}

  supports(eventType: string): boolean {
    return eventType === STRIPE_EVENT_INVOICE_VOIDED;
  }

  async handle(event: WebhookEvent): Promise<void> {
    const invoiceData = this.paymentService.mapRawInvoice(event.payload);

    this.logger.log(`Invoice voided: ${invoiceData.id}`);

    const invoice = await this.prisma.invoice.findUnique({
      where: { stripeInvoiceId: invoiceData.id },
    });

    if (!invoice) {
      this.logger.warn(`Invoice ${invoiceData.id} not found in database`);
      return;
    }

    await this.prisma.invoice.update({
      where: { stripeInvoiceId: invoiceData.id },
      data: {
        status: InvoiceStatus.VOID,
        voidedAt: new Date(),
      },
    });

    this.logger.log(`Invoice ${invoiceData.id} marked as VOID`);
  }
}
