import { Injectable, Logger } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { PaymentService } from '@/billing/payment.service';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import { PrismaService } from '@/prisma/prisma.service';
import { CreditService } from '@/credit/credit.service';
import { SubStatus, PlanType } from '../../../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS } from '@/common/constants/plan.constants';
import { AppLogger } from '@/logger/app-logger';
import { STRIPE_EVENT_SUBSCRIPTION_DELETED } from '@/common/constants/stripe-event.constants';

@Injectable()
export class CustomerSubscriptionDeletedStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
    private readonly paymentService: PaymentService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('CustomerSubscriptionDeletedStrategy');
  }

  supports(eventType: string): boolean {
    return eventType === STRIPE_EVENT_SUBSCRIPTION_DELETED;
  }

  async handle(event: WebhookEvent): Promise<void> {
    const subscription = this.paymentService.mapRawSubscription(event.payload);
    const stripeSubscriptionId = subscription.id;

    this.logger.log(`Subscription deleted: subscriptionId=${stripeSubscriptionId}`);

    const localSubscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });

    if (!localSubscription) {
      this.logger.warn(`Subscription not found for deletion: subscriptionId=${stripeSubscriptionId}`);
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: localSubscription.id },
          data: { status: SubStatus.CANCELED },
        });
        this.logger.log(`Subscription status changed to CANCELED: subscriptionId=${localSubscription.id}, userId=${localSubscription.userId}`);

        await this.creditService.freezeAddonCredits(localSubscription.userId, tx);
        this.logger.log(`Addon credits frozen: userId=${localSubscription.userId}`);

        const freeCredits = PLAN_CREDIT_LIMITS[PlanType.FREE];
        await this.creditService.resetPlanCredits(localSubscription.userId, freeCredits, tx);
        this.logger.log(`Plan credits reset to FREE tier: userId=${localSubscription.userId}, credits=${freeCredits}`);
      });

      this.logger.log(`Subscription deleted: subscriptionId=${localSubscription.id}, userId=${localSubscription.userId}, downgraded to FREE tier`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Subscription deletion failed: subscriptionId=${stripeSubscriptionId} - ${errorMessage}`);
      throw error;
    }
  }
}
