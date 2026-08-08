import { Injectable, Logger } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { PaymentService } from '@/billing/payment.service';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import { PrismaService } from '@/prisma/prisma.service';
import { AppLogger } from '@/logger/app-logger';
import { STRIPE_EVENT_PAYMENT_METHOD_ATTACHED } from '@/common/constants/stripe-event.constants';

@Injectable()
export class PaymentMethodAttachedStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('PaymentMethodAttachedStrategy');
  }

  supports(eventType: string): boolean {
    return eventType === STRIPE_EVENT_PAYMENT_METHOD_ATTACHED;
  }

  async handle(event: WebhookEvent): Promise<void> {
    const paymentMethod = event.payload as any;
    const paymentMethodId = paymentMethod.id;

    this.logger.log(`Payment method attached: paymentMethodId=${paymentMethodId}, customer=${paymentMethod.customer}`);

    const customerId = paymentMethod.customer;
    const userId = paymentMethod.metadata?.userId;

    if (!customerId) {
      this.logger.warn(`Payment method missing customer: paymentMethodId=${paymentMethodId}`);
      return;
    }

    if (!userId) {
      this.logger.warn(`Payment method missing userId in metadata: paymentMethodId=${paymentMethodId}`);
      return;
    }

    if (!paymentMethod.card) {
      this.logger.warn(`Payment method is not a card: paymentMethodId=${paymentMethodId}`);
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const existingPaymentMethod = await tx.paymentMethod.findUnique({
          where: { stripePaymentMethodId: paymentMethodId },
        });

        if (existingPaymentMethod) {
          this.logger.log(`Payment method already exists: paymentMethodId=${paymentMethodId}`);
          return;
        }

        const existingCount = await tx.paymentMethod.count({
          where: { userId },
        });

        const isDefault = existingCount === 0;

        await tx.paymentMethod.create({
          data: {
            userId,
            stripePaymentMethodId: paymentMethodId,
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
            expMonth: paymentMethod.card.exp_month,
            expYear: paymentMethod.card.exp_year,
            isDefault,
          },
        });

        this.logger.log(`Payment method saved: userId=${userId}, paymentMethodId=${paymentMethodId}, isDefault=${isDefault}`);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Payment method attached processing failed: paymentMethodId=${paymentMethodId} - ${errorMessage}`);
      throw error;
    }
  }
}
