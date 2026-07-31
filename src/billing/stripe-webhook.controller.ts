import { Controller, Post, Headers, Body, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('billing/webhook')
export class StripeWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly billingService: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
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
      },
    });

    switch (event.type) {
      case 'checkout.session.completed':
        await this.billingService.handleCheckoutCompleted(event.data.object as any);
        break;
      case 'invoice.paid':
        await this.billingService.handleInvoicePaid(event.data.object as any);
        break;
      case 'invoice.payment_failed':
        await this.billingService.handleInvoicePaymentFailed(event.data.object as any);
        break;
      case 'customer.subscription.deleted':
        await this.billingService.handleSubscriptionDeleted((event.data.object as any).id);
        break;
    }

    return { received: true };
  }
}
