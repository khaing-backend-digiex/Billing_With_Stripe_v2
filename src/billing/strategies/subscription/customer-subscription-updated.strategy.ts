import { Injectable, Logger } from '@nestjs/common';
import { WebhookStrategy } from '../webhook-strategy.interface';
import { PaymentService } from '../../payment.service';
import { WebhookEvent } from '../../payments/types/payment.types';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreditService } from '../../../credit/credit.service';
import { PlanType, SubStatus, Prisma } from '../../../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS } from '../../../constants/plan.constants';

const STRIPE_STATUS_MAP: Record<string, SubStatus> = {
  active: SubStatus.ACTIVE,
  past_due: SubStatus.PAST_DUE,
  canceled: SubStatus.CANCELED,
  incomplete_expired: SubStatus.EXPIRED,
  unpaid: SubStatus.EXPIRED,
};

@Injectable()
export class CustomerSubscriptionUpdatedStrategy implements WebhookStrategy {
  private readonly logger = new Logger(CustomerSubscriptionUpdatedStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
    private readonly paymentService: PaymentService,
  ) {}

  supports(eventType: string): boolean {
    return eventType === 'customer.subscription.updated';
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

    const currentPeriodStart = new Date(subscription.currentPeriodStart * 1000);
    const currentPeriodEnd = new Date(subscription.currentPeriodEnd * 1000);

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
