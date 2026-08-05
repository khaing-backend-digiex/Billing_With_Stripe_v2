import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { PaymentService } from '@/billing/payment.service';
import { CreditService } from '@/credit/credit.service';
import { Prisma, PlanType, SubStatus } from '../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS, ADDON_CREDITS_PER_PURCHASE } from '@/common/constants/plan.constants';
import { AppLogger } from '@/logger/app-logger';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@/common/enums/error-code.enum';
import { ServiceError } from '@/common/exceptions/service-error.exception';
import {
  STRIPE_CHECKOUT_MODE_SUBSCRIPTION,
  STRIPE_CHECKOUT_MODE_PAYMENT,
  STRIPE_PRORATION_CREATE,
} from '@/common/constants/stripe.constants';
import {
  BILLING_SUCCESS_PATH,
  BILLING_CANCEL_PATH,
  METADATA_TYPE_ADDON,
  DEFAULT_PAGINATION_LIMIT,
} from '@/common/constants/billing.constants';
import { ENV_FRONTEND_URL } from '@/common/constants/env.constants';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly creditService: CreditService,
    private readonly logger: AppLogger,
    private readonly configService: ConfigService,
  ) {
    this.logger.setContext('BillingService');
  }

  private getCheckoutUrls() {
    const baseUrl = this.configService.get<string>(ENV_FRONTEND_URL);
    return {
      successUrl: `${baseUrl}${BILLING_SUCCESS_PATH}`,
      cancelUrl: `${baseUrl}${BILLING_CANCEL_PATH}`,
    };
  }

  async createSubscriptionCheckout(userId: string, priceId: string, currency: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ServiceError(ErrorCode.USER_NOT_FOUND, 'User not found');

    const price = await this.prisma.stripePrice.findUnique({
      where: { stripePriceId: priceId },
      include: { product: true },
    });
    if (!price) throw new ServiceError(ErrorCode.PRICE_NOT_FOUND, 'Price not found');

    if (!user.stripeCustomerId) {
      throw new ServiceError(ErrorCode.STRIPE_CUSTOMER_MISSING, 'User does not have a Stripe customer ID');
    }

    const session = await this.paymentService.createCheckoutSession({
      customerId: user.stripeCustomerId,
      priceId,
      mode: STRIPE_CHECKOUT_MODE_SUBSCRIPTION,
      ...this.getCheckoutUrls(),
      metadata: {
        userId,
        planType: price.product.planType,
      },
    });

    return { url: session.url };
  }

  async createAddonCheckout(userId: string, priceId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ServiceError(ErrorCode.USER_NOT_FOUND, 'User not found');

    const activeSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: SubStatus.ACTIVE,
        plan: { in: [PlanType.PRO_MONTHLY, PlanType.PRO_ANNUAL] },
      },
    });
    if (!activeSubscription) {
      throw new ServiceError(ErrorCode.ADDON_REQUIRES_PRO, 'Add-on purchases require Pro subscription');
    }

    const price = await this.prisma.stripePrice.findUnique({
      where: { stripePriceId: priceId },
      include: { product: true },
    });
    if (!price) throw new ServiceError(ErrorCode.PRICE_NOT_FOUND, 'Price not found');

    if (!user.stripeCustomerId) {
      throw new ServiceError(ErrorCode.STRIPE_CUSTOMER_MISSING, 'User does not have a Stripe customer ID');
    }

    const session = await this.paymentService.createCheckoutSession({
      customerId: user.stripeCustomerId,
      priceId,
      mode: STRIPE_CHECKOUT_MODE_PAYMENT,
      ...this.getCheckoutUrls(),
      metadata: {
        userId,
        type: METADATA_TYPE_ADDON,
        credits: String(ADDON_CREDITS_PER_PURCHASE),
      },
    });

    return { url: session.url };
  }

  async getUserSubscriptions(userId: string, query: { page?: number; limit?: number; status?: SubStatus }) {
    const { page = 1, limit = DEFAULT_PAGINATION_LIMIT, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SubscriptionWhereInput = { userId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return { data, total, page, limit };
  }


  async upgradeSubscription(userId: string, newPriceId: string) {
    const activeSubscription = await this.prisma.subscription.findFirst({
      where: { userId, status: SubStatus.ACTIVE },
    });
    if (!activeSubscription) throw new ServiceError(ErrorCode.SUBSCRIPTION_NOT_FOUND, 'No active subscription');

    const newPrice = await this.prisma.stripePrice.findUnique({
      where: { stripePriceId: newPriceId },
      include: { product: true },
    });
    if (!newPrice) throw new ServiceError(ErrorCode.PRICE_NOT_FOUND, 'Price not found');

    const currentPlan = activeSubscription.plan;
    const newPlan = newPrice.product.planType;

    if (this.isSameTierUpgrade(currentPlan, newPlan)) {
      await this.paymentService.updateSubscription(activeSubscription.stripeSubscriptionId, {
        newPriceId,
        prorationBehavior: STRIPE_PRORATION_CREATE,
      });

      await this.prisma.subscription.update({
        where: { id: activeSubscription.id },
        data: { plan: newPlan },
      });
    } else {
      throw new ServiceError(ErrorCode.CROSS_TIER_UPGRADE_DENIED, 'Cross-tier changes require cancel and create');
    }

    return this.getUserSubscriptions(userId, {});
  }

  private isSameTierUpgrade(current: PlanType, next: PlanType): boolean {
    const proPlans: PlanType[] = [PlanType.PRO_MONTHLY, PlanType.PRO_ANNUAL];
    return proPlans.includes(current) && proPlans.includes(next);
  }
}
