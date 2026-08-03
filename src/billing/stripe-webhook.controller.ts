import { Controller, Post, Headers, RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookStatus } from '../../generated/prisma/client';
import { SkipTransform } from '../common/decorators/skip-transform.decorator';

@ApiTags('Webhooks')
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @SkipTransform()
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const payload = req.rawBody?.toString() || '';

    const event = this.stripeService.verifyWebhookSignature(payload, signature);

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
        payload: event.data.object as any,
        status: WebhookStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        nextRetryAt: new Date(),
      },
    });

    return { received: true };
  }
}
