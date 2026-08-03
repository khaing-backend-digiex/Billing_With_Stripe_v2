import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { CreditService } from '../credit/credit.service';
import { PlanType, SubStatus } from '../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS } from '../constants/plan.constants';
import { AppLogger } from '../logger/app-logger';
import { ServiceError } from '../common/exceptions/service-error.exception';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly creditService: CreditService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('BillingService');
  }

  async createSubscriptionCheckout(userId: string, priceId: string, currency: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ServiceError('USER_NOT_FOUND', 'User not found');

    const price = await this.prisma.stripePrice.findUnique({
      where: { stripePriceId: priceId },
      include: { product: true },
    });
    if (!price) throw new ServiceError('PRICE_NOT_FOUND', 'Price not found');

    const session = await this.stripeService.createCheckoutSession({
      customerId: user.stripeCustomerId!,
      priceId,
      mode: 'subscription',
      successUrl: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${process.env.FRONTEND_URL}/billing/cancel`,
      metadata: {
        userId,
        planType: price.product.planType,
      },
    });

    return { url: session.url };
  }

  async createAddonCheckout(userId: string, priceId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ServiceError('USER_NOT_FOUND', 'User not found');

    const activeSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: SubStatus.ACTIVE,
        plan: { in: [PlanType.PRO_MONTHLY, PlanType.PRO_ANNUAL] },
      },
    });
    if (!activeSubscription) {
      throw new ServiceError('ADDON_REQUIRES_PRO', 'Add-on purchases require Pro subscription');
    }

    const price = await this.prisma.stripePrice.findUnique({
      where: { stripePriceId: priceId },
      include: { product: true },
    });
    if (!price) throw new ServiceError('PRICE_NOT_FOUND', 'Price not found');

    const session = await this.stripeService.createCheckoutSession({
      customerId: user.stripeCustomerId!,
      priceId,
      mode: 'payment',
      successUrl: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${process.env.FRONTEND_URL}/billing/cancel`,
      metadata: {
        userId,
        type: 'addon',
        credits: '15',
      },
    });

    return { url: session.url };
  }

  async getUserSubscriptions(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async handleCheckoutCompleted(sessionId: string) {
    const session = await this.stripeService.getCheckoutSession(sessionId);
    
    if (session.mode === 'subscription') {
      await this.activateSubscription(session);
    } else if (session.mode === 'payment' && session.metadata?.type === 'addon') {
      await this.addAddonCredits(session);
    }
  }

  private async activateSubscription(session: any) {
    const userId = session.metadata.userId;
    const planType = session.metadata.planType as PlanType;
    const stripeSubscriptionId = session.subscription as string;

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

      const stripeSub = await this.stripeService.getSubscription(stripeSubscriptionId);

      await tx.subscription.create({
        data: {
          userId,
          stripeSubscriptionId,
          plan: planType,
          status: SubStatus.ACTIVE,
          currentPeriodStart: new Date(stripeSub.items.data[0].current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSub.items.data[0].current_period_end * 1000),
        },
      });

      const credits = PLAN_CREDIT_LIMITS[planType];
      await this.creditService.resetPlanCredits(userId, credits, tx);

      if (planType !== PlanType.FREE) {
        await this.creditService.unfreezeAddonCredits(userId, tx);
      }
    });
  }

  private async addAddonCredits(session: any) {
    const userId = session.metadata.userId;
    const credits = parseInt(session.metadata.credits, 10);
    const stripePaymentId = session.payment_intent as string;

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
  }

  async handleInvoicePaid(invoice: any) {
    const subscriptionId = invoice.subscription as string;
    
    await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (subscription && subscription.plan === PlanType.PRO_MONTHLY) {
        await this.creditService.resetPlanCredits(subscription.userId, 100, tx);
      }
    });
  }

  async handleInvoicePaymentFailed(invoice: any) {
    const subscriptionId = invoice.subscription as string;
    
    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: SubStatus.PAST_DUE },
    });
  }

  async handleSubscriptionDeleted(subscriptionId: string) {
    await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (!subscription) return;

      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: SubStatus.CANCELED },
      });

      if (subscription.plan === PlanType.PRO_MONTHLY || subscription.plan === PlanType.PRO_ANNUAL) {
        await this.creditService.freezeAddonCredits(subscription.userId, tx);
        await this.creditService.resetPlanCredits(subscription.userId, 50, tx);
      }
    });
  }

  async upgradeSubscription(userId: string, newPriceId: string) {
    const activeSubscription = await this.prisma.subscription.findFirst({
      where: { userId, status: SubStatus.ACTIVE },
    });
    if (!activeSubscription) throw new ServiceError('SUBSCRIPTION_NOT_FOUND', 'No active subscription');

    const newPrice = await this.prisma.stripePrice.findUnique({
      where: { stripePriceId: newPriceId },
      include: { product: true },
    });
    if (!newPrice) throw new ServiceError('PRICE_NOT_FOUND', 'Price not found');

    const currentPlan = activeSubscription.plan;
    const newPlan = newPrice.product.planType;

    if (this.isSameTierUpgrade(currentPlan, newPlan)) {
      await this.stripeService.updateSubscription(activeSubscription.stripeSubscriptionId, {
        newPriceId,
        prorationBehavior: 'create_prorations',
      });

      await this.prisma.subscription.update({
        where: { id: activeSubscription.id },
        data: { plan: newPlan },
      });
    } else {
      throw new ServiceError('CROSS_TIER_UPGRADE_DENIED', 'Cross-tier changes require cancel and create');
    }

    return this.getUserSubscriptions(userId);
  }

  private isSameTierUpgrade(current: PlanType, next: PlanType): boolean {
    const proPlans: PlanType[] = [PlanType.PRO_MONTHLY, PlanType.PRO_ANNUAL];
    return proPlans.includes(current) && proPlans.includes(next);
  }
}
