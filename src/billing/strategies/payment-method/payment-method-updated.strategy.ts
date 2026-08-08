import { Injectable, Logger } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import { PrismaService } from '@/prisma/prisma.service';
import { AppLogger } from '@/logger/app-logger';
import { STRIPE_EVENT_PAYMENT_METHOD_UPDATED } from '@/common/constants/stripe-event.constants';

@Injectable()
export class PaymentMethodUpdatedStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('PaymentMethodUpdatedStrategy');
  }

  supports(eventType: string): boolean {
    return eventType === STRIPE_EVENT_PAYMENT_METHOD_UPDATED;
  }

  async handle(event: WebhookEvent): Promise<void> {
    const paymentMethod = event.payload as any;
    const paymentMethodId = paymentMethod.id;

    this.logger.log(`Payment method updated: paymentMethodId=${paymentMethodId}`);

    if (!paymentMethod.card) {
      this.logger.warn(`Payment method is not a card: paymentMethodId=${paymentMethodId}`);
      return;
    }

    try {
      const existingPaymentMethod = await this.prisma.paymentMethod.findUnique({
        where: { stripePaymentMethodId: paymentMethodId },
      });

      if (!existingPaymentMethod) {
        this.logger.warn(`Payment method not found in database, skipping update: paymentMethodId=${paymentMethodId}`);
        return;
      }

      await this.prisma.paymentMethod.update({
        where: { stripePaymentMethodId: paymentMethodId },
        data: {
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          expMonth: paymentMethod.card.exp_month,
          expYear: paymentMethod.card.exp_year,
        },
      });

      this.logger.log(`Payment method updated: paymentMethodId=${paymentMethodId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Payment method update processing failed: paymentMethodId=${paymentMethodId} - ${errorMessage}`);
      throw error;
    }
  }
}
