import { Injectable, Logger } from '@nestjs/common';
import { PaymentService } from '../../payment.service';
import { WebhookEvent, PaymentSession } from '../../payments/types/payment.types';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreditService } from '../../../credit/credit.service';
import { PlanType, SubStatus } from '../../../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS } from '../../../constants/plan.constants';
import { WebhookStrategy } from '../webhook-strategy.interface';

@Injectable()
export class CheckoutSessionCompletedStrategy implements WebhookStrategy {
  private readonly logger = new Logger(CheckoutSessionCompletedStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
    private readonly paymentService: PaymentService,
  ) {}

  supports(eventType: string): boolean {
    return eventType === 'checkout.session.completed';
  }

  async handle(event: WebhookEvent): Promise<void> {
    const session = event.payload as PaymentSession;
    const sessionId = session.id;

    this.logger.log(`Processing checkout.session.completed: ${sessionId}`);

    if (session.metadata?.type === 'addon') {
      await this.handleAddonPurchase(session);
    } else {
      await this.handleSubscriptionPurchase(session);
    }
  }

  private async handleAddonPurchase(session: PaymentSession): Promise<void> {
    const userId = session.metadata?.userId;
    const credits = parseInt(session.metadata?.credits || '0', 10);
    const stripePaymentId = session.paymentIntentId as string;

    if (!userId) {
      throw new Error('Missing userId in session metadata');
    }

    this.logger.log(`Processing addon purchase: ${credits} credits for user ${userId}`);

    await this.prisma.$transaction(async (tx) => {
      await tx.addonPurchase.create({
        data: {
          userId,
          creditsGranted: credits,
          stripePaymentId,
        },
      });

      await this.creditService.addAddonCredits(userId, credits, tx);
    });

    this.logger.log(`Addon purchase completed: ${credits} credits added to user ${userId}`);
  }

  private async handleSubscriptionPurchase(session: PaymentSession): Promise<void> {
    const userId = session.metadata?.userId;
    const planType = session.metadata?.planType as PlanType;
    const stripeSubscriptionId = session.subscriptionId as string;

    if (!userId || !planType) {
      throw new Error('Missing userId or planType in session metadata');
    }

    this.logger.log(`Processing subscription purchase: ${planType} for user ${userId}`);

    const stripeSubscription = await this.paymentService.getSubscription(stripeSubscriptionId);

    if (!stripeSubscription) {
      this.logger.error(`Subscription not found for id: ${stripeSubscriptionId}`);
      throw new Error(`Subscription not found for id: ${stripeSubscriptionId}`);
    }

    const currentPeriodStart = new Date(stripeSubscription.currentPeriodStart * 1000);
    const currentPeriodEnd = new Date(stripeSubscription.currentPeriodEnd * 1000);

    await this.prisma.$transaction(async (tx) => {
      const currentActive = await tx.subscription.findFirst({
        where: { userId, status: SubStatus.ACTIVE },
      });

      if (currentActive) {
        await tx.subscription.update({
          where: { id: currentActive.id },
          data: { status: SubStatus.CANCELED },
        });
      }

      await tx.subscription.create({
        data: {
          userId,
          stripeSubscriptionId,
          plan: planType,
          status: SubStatus.ACTIVE,
          currentPeriodStart,
          currentPeriodEnd,
        },
      });

      const credits = PLAN_CREDIT_LIMITS[planType];
      await this.creditService.resetPlanCredits(userId, credits, tx);

      if (planType !== PlanType.FREE) {
        await this.creditService.unfreezeAddonCredits(userId, tx);
      }
    });

    this.logger.log(`Subscription purchase completed: ${planType} for user ${userId}`);
  }
}
