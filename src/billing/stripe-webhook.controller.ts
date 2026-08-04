import { Controller, Post, Headers, RawBodyRequest, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookStatus, Prisma } from '../../generated/prisma/client';
import { SkipTransform } from '../common/decorators/skip-transform.decorator';
import { WebhookProcessorService } from './webhook-processor.service';
import { AppLogger } from '../logger/app-logger';
import { MAX_INVOICE_RETRY_ATTEMPTS } from '../constants/billing.constants';

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

  @Post()
  @SkipTransform()
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const payload = req.rawBody?.toString() || '';

    const event = this.paymentService.verifyWebhookSignature(payload, signature);

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });

    if (existing) {
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

    return { received: true };
  }
}
