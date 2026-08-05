import { Injectable, Logger } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { PaymentService } from '@/billing/payment.service';
import { WebhookEvent } from '@/billing/payments/types/payment.types';
import { PrismaService } from '@/prisma/prisma.service';
import { CreditService } from '@/credit/credit.service';
import { PlanType, SubStatus, Prisma } from '../../../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS } from '@/common/constants/plan.constants';
import { AppLogger } from '@/logger/app-logger';
import { STRIPE_EVENT_SUBSCRIPTION_UPDATED } from '@/common/constants/stripe-event.constants';
import {
  STRIPE_SUBSCRIPTION_STATUS_ACTIVE,
  STRIPE_SUBSCRIPTION_STATUS_PAST_DUE,
  STRIPE_SUBSCRIPTION_STATUS_CANCELED,
  STRIPE_SUBSCRIPTION_STATUS_INCOMPLETE_EXPIRED,
  STRIPE_SUBSCRIPTION_STATUS_UNPAID,
  SECONDS_TO_MS,
} from '@/common/constants/stripe.constants';

const STRIPE_STATUS_MAP: Record<string, SubStatus> = {
  [STRIPE_SUBSCRIPTION_STATUS_ACTIVE]: SubStatus.ACTIVE,
  [STRIPE_SUBSCRIPTION_STATUS_PAST_DUE]: SubStatus.PAST_DUE,
  [STRIPE_SUBSCRIPTION_STATUS_CANCELED]: SubStatus.CANCELED,
  [STRIPE_SUBSCRIPTION_STATUS_INCOMPLETE_EXPIRED]: SubStatus.EXPIRED,
  [STRIPE_SUBSCRIPTION_STATUS_UNPAID]: SubStatus.EXPIRED,
};

@Injectable()
export class CustomerSubscriptionUpdatedStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
    private readonly paymentService: PaymentService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('CustomerSubscriptionUpdatedStrategy');
  }

  supports(eventType: string): boolean {
    return eventType === STRIPE_EVENT_SUBSCRIPTION_UPDATED;
  }

  async handle(event: WebhookEvent): Promise<void> {
    const subscription = this.paymentService.mapRawSubscription(event.payload);
    const stripeSubscriptionId = subscription.id;

    this.logger.log(`Processing customer.subscription.updated: ${stripeSubscriptionId}`);

    const localSubscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });

    if (!localSubscription) {
      this.logger.warn(`Local subscription not found for stripeSubscriptionId: ${stripeSubscriptionId}`);
      return;
    }

    const stripeStatus = subscription.status;
    const newStatus = this.mapStripeStatus(stripeStatus);

    const priceMetadata = subscription.items[0]?.priceMetadata;
    const newPlanType = priceMetadata?.planType as PlanType | undefined;

    const currentPeriodStart = new Date(subscription.currentPeriodStart * SECONDS_TO_MS);
    const currentPeriodEnd = new Date(subscription.currentPeriodEnd * SECONDS_TO_MS);

    await this.prisma.$transaction(async (tx) => {
      const updateData: Prisma.SubscriptionUpdateInput = {
        currentPeriodStart,
        currentPeriodEnd,
      };

      if (newPlanType && newPlanType !== localSubscription.plan) {
        updateData.plan = newPlanType;
      }

      if (newStatus !== localSubscription.status) {
        updateData.status = newStatus;
      }

      await tx.subscription.update({
        where: { id: localSubscription.id },
        data: updateData,
      });

      if (newPlanType && newPlanType !== localSubscription.plan) {
        const credits = PLAN_CREDIT_LIMITS[newPlanType];
        await this.creditService.resetPlanCredits(localSubscription.userId, credits, tx);
      }
    });

    this.logger.log(`Subscription updated: ${localSubscription.id}`);
  }

  private mapStripeStatus(stripeStatus: string): SubStatus {
    return STRIPE_STATUS_MAP[stripeStatus] ?? SubStatus.ACTIVE;
  }
}
