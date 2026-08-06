import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { CreditService } from '@/credit/credit.service';
import { PlanType, SubStatus } from '../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS } from '@/common/constants/plan.constants';
import { AppLogger } from '@/logger/app-logger';

const JANUARY_MONTH_INDEX = 0;

import { addCalendarMonths, monthsBetween } from '@/common/utils/date.util';

@Injectable()
export class CreditResetCronService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('CreditResetCronService');
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCreditReset() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    this.logger.log('Running credit reset cron');

    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        status: SubStatus.ACTIVE,
      },
      include: {
        user: {
          include: {
            creditBalance: true,
          },
        },
      },
    });

    for (const subscription of subscriptions) {
      if (!subscription.currentPeriodStart || !subscription.currentPeriodEnd) {
        continue;
      }
      if (subscription.plan === PlanType.ADDON) {
        continue;
      }

      try {
        const anchor = new Date(subscription.currentPeriodStart);
        anchor.setHours(0, 0, 0, 0);

        const currentPeriodEnd = new Date(subscription.currentPeriodEnd);
        currentPeriodEnd.setHours(0, 0, 0, 0);

        const resetMonths = subscription.plan === PlanType.PRO_ANNUAL ? 12 : 1;
        
        let periodNumber = Math.floor(monthsBetween(anchor, today) / resetMonths);
        let nextResetDate = addCalendarMonths(anchor, periodNumber * resetMonths);

        // Loop to increment period number until next reset date is in the future
        while (nextResetDate.getTime() <= today.getTime()) {
          periodNumber++;
          nextResetDate = addCalendarMonths(anchor, periodNumber * resetMonths);
        }

        const mostRecentResetDate = addCalendarMonths(anchor, (periodNumber - 1) * resetMonths);

        if (mostRecentResetDate.getTime() >= currentPeriodEnd.getTime()) {
          continue;
        }

        const creditBalance = subscription.user?.creditBalance;
        if (!creditBalance) continue;

        const lastReset = new Date(creditBalance.lastResetAt);
        lastReset.setHours(0, 0, 0, 0);

        if (mostRecentResetDate.getTime() > lastReset.getTime()) {
          const credits = PLAN_CREDIT_LIMITS[subscription.plan as keyof typeof PLAN_CREDIT_LIMITS];
          if (credits !== undefined) {
            await this.creditService.resetPlanCredits(subscription.userId, credits);
            this.logger.log(`Reset credits for user ${subscription.userId} to ${credits}`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to reset credits for user ${subscription.userId}: ${errorMessage}`);
      }
    }

    this.logger.log('Credit reset cron completed');
  }
}
