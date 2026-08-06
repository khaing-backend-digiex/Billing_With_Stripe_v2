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
    return payload;
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

    try {
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
    } catch (error: any) {
      // Prisma P2002 error code means Unique constraint failed
      if (error.code === 'P2002') {
        this.logger.warn(`Concurrent duplicate webhook ignored: id=${event.id}, type=${event.type}`);
        return { received: true, duplicate: true };
      }
      throw error;
    }

    return { received: true };
  }
}
