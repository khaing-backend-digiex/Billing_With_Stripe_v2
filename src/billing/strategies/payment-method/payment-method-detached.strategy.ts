import { Injectable, Logger } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import { PrismaService } from '@/prisma/prisma.service';
import { AppLogger } from '@/logger/app-logger';
import { STRIPE_EVENT_PAYMENT_METHOD_DETACHED } from '@/common/constants/stripe-event.constants';

@Injectable()
export class PaymentMethodDetachedStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('PaymentMethodDetachedStrategy');
  }

  supports(eventType: string): boolean {
    return eventType === STRIPE_EVENT_PAYMENT_METHOD_DETACHED;
  }

  async handle(event: WebhookEvent): Promise<void> {
    const paymentMethod = event.payload as any;
    const paymentMethodId = paymentMethod.id;

    this.logger.log(`Payment method detached: paymentMethodId=${paymentMethodId}`);

    try {
      const existingPaymentMethod = await this.prisma.paymentMethod.findUnique({
        where: { stripePaymentMethodId: paymentMethodId },
      });

      if (!existingPaymentMethod) {
        this.logger.warn(`Payment method not found in database, skipping delete: paymentMethodId=${paymentMethodId}`);
        return;
      }

      const wasDefault = existingPaymentMethod.isDefault;
      const userId = existingPaymentMethod.userId;

      await this.prisma.paymentMethod.delete({
        where: { stripePaymentMethodId: paymentMethodId },
      });

      if (wasDefault) {
        const remainingPaymentMethod = await this.prisma.paymentMethod.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        });

        if (remainingPaymentMethod) {
          await this.prisma.paymentMethod.update({
            where: { id: remainingPaymentMethod.id },
            data: { isDefault: true },
          });

          this.logger.log(`Set new default payment method: userId=${userId}, paymentMethodId=${remainingPaymentMethod.stripePaymentMethodId}`);
        }
      }

      this.logger.log(`Payment method deleted: paymentMethodId=${paymentMethodId}, wasDefault=${wasDefault}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Payment method detach processing failed: paymentMethodId=${paymentMethodId} - ${errorMessage}`);
      throw error;
    }
  }
}
