import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookStrategyInterface } from '../webhook-strategy.interface';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreditService } from '../../../credit/credit.service';
import { SubStatus, PlanType } from '../../../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS } from '../../../constants/plan.constants';

@Injectable()
export class CustomerSubscriptionDeletedStrategy implements WebhookStrategyInterface {
  private readonly logger = new Logger(CustomerSubscriptionDeletedStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
  ) {}

  supports(eventType: string): boolean {
    return eventType === 'customer.subscription.deleted';
  }

  async handle(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const stripeSubscriptionId = subscription.id;

    this.logger.log(`Processing customer.subscription.deleted: ${stripeSubscriptionId}`);

    const localSubscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });

    if (!localSubscription) {
      this.logger.warn(`Local subscription not found for stripeSubscriptionId: ${stripeSubscriptionId}`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: localSubscription.id },
        data: { status: SubStatus.CANCELED },
      });

      await this.creditService.freezeAddonCredits(localSubscription.userId, tx);

      const freeCredits = PLAN_CREDIT_LIMITS[PlanType.FREE];
      await this.creditService.resetPlanCredits(localSubscription.userId, freeCredits, tx);
    });

    this.logger.log(`Subscription deleted: ${localSubscription.id} downgraded to FREE tier`);
  }
}
