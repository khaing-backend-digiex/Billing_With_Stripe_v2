import { Controller, Post, Headers, Body, RawBodyRequest, Req, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookStatus } from '../../generated/prisma/client';

@Controller('billing/webhook')
export class StripeWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const payload = req.rawBody?.toString() || '';

    let event;
    try {
      event = this.stripeService.verifyWebhookSignature(payload, signature);
    } catch (error) {
      throw new BadRequestException('Invalid webhook signature');
    }

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
