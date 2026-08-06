import { Injectable, Logger } from '@nestjs/common';
import { PaymentService } from '@/billing/payment.service';
import { WebhookEvent, PaymentSession } from '@/billing/payments/types/payment.types';
import { PrismaService } from '@/prisma/prisma.service';
import { CreditService } from '@/credit/credit.service';
import { PlanType, SubStatus } from '../../../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS } from '@/common/constants/plan.constants';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { AppLogger } from '@/logger/app-logger';
import { STRIPE_EVENT_CHECKOUT_COMPLETED, SECONDS_TO_MS } from '@/common/constants/stripe.constants';
import {
  METADATA_TYPE_ADDON,
  DEFAULT_CREDITS_STRING,
  METADATA_KEY_TYPE,
  METADATA_KEY_CREDITS,
  METADATA_KEY_USER_ID,
  METADATA_KEY_PLAN_TYPE,
} from '@/common/constants/billing.constants';

const ERROR_MISSING_USER_ID = 'Missing userId in session metadata';
const ERROR_MISSING_USER_ID_OR_PLAN_TYPE = 'Missing userId or planType in session metadata';
const ERROR_SUBSCRIPTION_NOT_FOUND = 'Subscription not found for id';

@Injectable()
export class CheckoutSessionCompletedStrategy implements WebhookStrategy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
    private readonly paymentService: PaymentService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('CheckoutSessionCompletedStrategy');
  }

  supports(eventType: string): boolean {
    return eventType === STRIPE_EVENT_CHECKOUT_COMPLETED;
  }

  async handle(event: WebhookEvent): Promise<void> {
    const session = this.paymentService.mapRawCheckoutSession(event.payload);
    const sessionId = session.id;

    this.logger.log(`Checkout session completed: sessionId=${sessionId}, customerId=${session.customerId}, mode=${session.mode}`);

    try {
      if (session.metadata?.[METADATA_KEY_TYPE] === METADATA_TYPE_ADDON) {
        await this.handleAddonPurchase(session);
      } else {
        await this.handleSubscriptionPurchase(session);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Checkout session processing failed: sessionId=${sessionId} - ${errorMessage}`);
      throw error;
    }
  }

  private async handleAddonPurchase(session: PaymentSession): Promise<void> {
    const userId = session.metadata?.[METADATA_KEY_USER_ID];
    const credits = parseInt(session.metadata?.[METADATA_KEY_CREDITS] || DEFAULT_CREDITS_STRING, 10);
    const stripePaymentId = session.paymentIntentId as string;

    if (!userId) {
      throw new Error(ERROR_MISSING_USER_ID);
    }

    this.logger.log(`Processing addon purchase: sessionId=${session.id}, userId=${userId}, credits=${credits}`);

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

    this.logger.log(`Addon purchase completed: sessionId=${session.id}, userId=${userId}, credits=${credits}, paymentId=${stripePaymentId}`);
  }

  private async handleSubscriptionPurchase(session: PaymentSession): Promise<void> {
    const userId = session.metadata?.[METADATA_KEY_USER_ID];
    const planType = session.metadata?.[METADATA_KEY_PLAN_TYPE] as PlanType;
    const stripeSubscriptionId = session.subscriptionId as string;

    if (!userId || !planType) {
      throw new Error(ERROR_MISSING_USER_ID_OR_PLAN_TYPE);
    }

    this.logger.log(`Processing subscription purchase: sessionId=${session.id}, userId=${userId}, planType=${planType}, subscriptionId=${stripeSubscriptionId}`);

    const stripeSubscription = await this.paymentService.getSubscription(stripeSubscriptionId);

    if (!stripeSubscription) {
      this.logger.error(`${ERROR_SUBSCRIPTION_NOT_FOUND}: sessionId=${session.id}, subscriptionId=${stripeSubscriptionId}`);
      throw new Error(`${ERROR_SUBSCRIPTION_NOT_FOUND}: ${stripeSubscriptionId}`);
    }

    const currentPeriodStart = new Date(stripeSubscription.currentPeriodStart * SECONDS_TO_MS);
    const currentPeriodEnd = new Date(stripeSubscription.currentPeriodEnd * SECONDS_TO_MS);

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

    this.logger.log(`Subscription purchase completed: sessionId=${session.id}, userId=${userId}, planType=${planType}, subscriptionId=${stripeSubscriptionId}`);
  }
}
