import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { CreditService } from '@/credit/credit.service';
import { PlanType, SubStatus } from '../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS } from '@/common/constants/plan.constants';
import { AppLogger } from '@/logger/app-logger';

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
  async handleMonthlyReset() {
    const today = new Date();
    const isFirstDayOfMonth = today.getDate() === 1;

    if (!isFirstDayOfMonth) {
      return;
    }

    this.logger.log('Running monthly credit reset');

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
      try {
        if (subscription.plan === PlanType.FREE || subscription.plan === PlanType.PRO_ANNUAL || subscription.plan === PlanType.PRO_MONTHLY) {
          const credits = PLAN_CREDIT_LIMITS[subscription.plan];
          await this.creditService.resetPlanCredits(subscription.userId, credits);
          this.logger.log(`Reset credits for user ${subscription.userId} to ${credits}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to reset credits for user ${subscription.userId}: ${errorMessage}`);
      }
    }

    this.logger.log('Monthly credit reset completed');
  }
}
