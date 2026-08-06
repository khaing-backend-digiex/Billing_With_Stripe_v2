import { Controller, Post, Headers, RawBodyRequest, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentService } from '@/billing/payment.service';
import { PrismaService } from '@/prisma/prisma.service';
import { WebhookStatus, Prisma } from '../../generated/prisma/client';
import { SkipTransform } from '@/common/decorators/skip-transform.decorator';
import { WebhookProcessorService } from '@/billing/webhook-processor.service';
import { AppLogger } from '@/logger/app-logger';
import { MAX_INVOICE_RETRY_ATTEMPTS } from '@/common/constants/billing.constants';
import { HEADER_STRIPE_SIGNATURE } from '@/common/constants/http.constants';

@ApiTags('Webhooks')
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly prisma: PrismaService,
    private readonly webhookProcessor: WebhookProcessorService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('StripeWebhookController');
  }

  private extractEventSummary(eventType: string, payload: any): Record<string, any> {
    const summary: Record<string, any> = {};

    switch (eventType) {
      case 'checkout.session.completed':
        summary.sessionId = payload.id;
        summary.customerId = payload.customer;
        summary.mode = payload.mode;
        summary.subscriptionId = payload.subscription;
        break;

      case 'invoice.paid':
      case 'invoice.payment_failed':
        summary.invoiceId = payload.id;
        summary.subscriptionId = payload.subscription;
        summary.amountPaid = payload.amount_paid;
        summary.amountDue = payload.amount_due;
        summary.status = payload.status;
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        summary.subscriptionId = payload.id;
        summary.customerId = payload.customer;
        summary.status = payload.status;
        summary.currentPeriodStart = payload.current_period_start;
        summary.currentPeriodEnd = payload.current_period_end;
        summary.cancelAtPeriodEnd = payload.cancel_at_period_end;
        break;

      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
        summary.paymentIntentId = payload.id;
        summary.customerId = payload.customer;
        summary.amount = payload.amount;
        summary.status = payload.status;
        break;

      default:
        summary.fieldNames = Object.keys(payload);
        summary.note = 'Unhandled event type - logging field names only';
        break;
    }

    return summary;
  }

  @Post()
  @SkipTransform()
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  async handleWebhook(
    @Headers(HEADER_STRIPE_SIGNATURE) signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const payload = req.rawBody?.toString() || '';

    let event;
    try {
      event = this.paymentService.verifyWebhookSignature(payload, signature);
    } catch (error) {
      this.logger.error(`Webhook signature verification failed: ${error}`);
      throw error;
    }

    this.logger.log(`Webhook received: id=${event.id}, type=${event.type}, timestamp=${new Date().toISOString()}`);

    const summary = this.extractEventSummary(event.type, event.payload);
    this.logger.log(`Event details: ${JSON.stringify(summary)}`);

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });

    if (existing) {
      this.logger.warn(`Duplicate webhook ignored: id=${event.id}, type=${event.type}`);
      return { received: true, duplicate: true };
    }

    await this.prisma.webhookEvent.create({
      data: {
        stripeEventId: event.id,
        type: event.type,
        payload: event.payload as Prisma.InputJsonValue,
        status: WebhookStatus.PENDING,
        retryCount: 0,
        maxRetries: MAX_INVOICE_RETRY_ATTEMPTS,
        nextRetryAt: new Date(),
      },
    });

    this.logger.log(`Event saved to database: id=${event.id}, type=${event.type}`);

    return { received: true };
  }
}
