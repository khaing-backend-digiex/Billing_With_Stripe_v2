import { Injectable, Logger } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { PaymentService } from '@/billing/payment.service';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import { PrismaService } from '@/prisma/prisma.service';
import { AppLogger } from '@/logger/app-logger';
import { STRIPE_EVENT_SETUP_INTENT_SUCCEEDED } from '@/common/constants/stripe-event.constants';

@Injectable()
export class SetupIntentSucceededStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('SetupIntentSucceededStrategy');
  }

  supports(eventType: string): boolean {
    return eventType === STRIPE_EVENT_SETUP_INTENT_SUCCEEDED;
  }

  async handle(event: WebhookEvent): Promise<void> {
    const setupIntent = event.payload as any;
    const setupIntentId = setupIntent.id;

    this.logger.log(`Setup intent succeeded: setupIntentId=${setupIntentId}, customer=${setupIntent.customer}, paymentMethod=${setupIntent.payment_method}`);

    const customerId = setupIntent.customer;
    const paymentMethodId = setupIntent.payment_method;
    const userId = setupIntent.metadata?.userId;

    if (!customerId || !paymentMethodId) {
      this.logger.warn(`Setup intent missing required fields: customerId=${customerId}, paymentMethodId=${paymentMethodId}`);
      return;
    }

    if (!userId) {
      this.logger.warn(`Setup intent missing userId in metadata: setupIntentId=${setupIntentId}`);
      return;
    }

    try {
      const paymentMethod = await this.paymentService.getPaymentMethod(paymentMethodId);

      if (!paymentMethod || !paymentMethod.card) {
        this.logger.warn(`Payment method not found or not a card: paymentMethodId=${paymentMethodId}`);
        return;
      }

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
            brand: paymentMethod.card!.brand,
            last4: paymentMethod.card!.last4,
            expMonth: paymentMethod.card!.expMonth,
            expYear: paymentMethod.card!.expYear,
            isDefault,
          },
        });

        this.logger.log(`Payment method saved: userId=${userId}, paymentMethodId=${paymentMethodId}, isDefault=${isDefault}`);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Setup intent processing failed: setupIntentId=${setupIntentId} - ${errorMessage}`);
      throw error;
    }
  }
}
