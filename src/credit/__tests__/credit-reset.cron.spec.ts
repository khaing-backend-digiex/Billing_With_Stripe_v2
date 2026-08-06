import { Test, TestingModule } from '@nestjs/testing';
import { CreditResetCronService } from '@/credit/credit-reset.cron';
import { PrismaService } from '@/prisma/prisma.service';
import { CreditService } from '@/credit/credit.service';
import { AppLogger } from '@/logger/app-logger';
import { PlanType, SubStatus } from '../../../generated/prisma/client';
import { PLAN_CREDIT_LIMITS } from '@/common/constants/plan.constants';

describe('CreditResetCronService', () => {
  let service: CreditResetCronService;
  let prisma: PrismaService;
  let creditService: CreditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditResetCronService,
        {
          provide: PrismaService,
          useValue: {
            subscription: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: CreditService,
          useValue: {
            resetPlanCredits: jest.fn(),
          },
        },
        {
          provide: AppLogger,
          useValue: {
            setContext: jest.fn(),
            log: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CreditResetCronService>(CreditResetCronService);
    prisma = module.get<PrismaService>(PrismaService);
    creditService = module.get<CreditService>(CreditService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const setupTestDate = (date: Date) => {
    jest.useFakeTimers();
    jest.setSystemTime(date);
  };

  const createMockSubscription = (
    plan: PlanType,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    lastResetAt: Date
  ) => ({
    id: 'sub_1',
    userId: 'user_1',
    plan,
    status: SubStatus.ACTIVE,
    currentPeriodStart,
    currentPeriodEnd,
    user: {
      creditBalance: {
        lastResetAt,
      },
    },
  });

  describe('Date drift prevention', () => {
    it('should not drift from Jan 31 over 12 months', async () => {
      const start = new Date(2023, 0, 31); // Jan 31, 2023
      const end = new Date(2024, 0, 31);
      
      const sub = createMockSubscription(PlanType.PRO_MONTHLY, start, end, new Date(2023, 0, 31));
      
      (prisma.subscription.findMany as jest.Mock).mockResolvedValue([sub]);

      // Check on Feb 28, 2023
      setupTestDate(new Date(2023, 1, 28));
      await service.handleCreditReset();
      expect(creditService.resetPlanCredits).toHaveBeenCalledTimes(1);

      // Reset mock
      jest.clearAllMocks();
      
      // Update last reset to Feb 28
      sub.user.creditBalance.lastResetAt = new Date(2023, 1, 28);
      
      // Fast forward to March 31, 2023. If date drift occurred, it would try to reset on Mar 28.
      // But we want to ensure it waits until Mar 31.
      setupTestDate(new Date(2023, 2, 31));
      await service.handleCreditReset();
      expect(creditService.resetPlanCredits).toHaveBeenCalledTimes(1);
    });
  });

  describe('Leap year handling', () => {
    it('should reset on Feb 28 in non-leap years and Feb 29 in leap years', async () => {
      const start = new Date(2024, 1, 29); // Feb 29, 2024 (leap year)
      const end = new Date(2030, 1, 28);
      
      const sub = createMockSubscription(PlanType.PRO_ANNUAL, start, end, new Date(2024, 1, 29));
      (prisma.subscription.findMany as jest.Mock).mockResolvedValue([sub]);

      // Test 2025 (Feb 28)
      setupTestDate(new Date(2025, 1, 28));
      await service.handleCreditReset();
      expect(creditService.resetPlanCredits).toHaveBeenCalledTimes(1);
      sub.user.creditBalance.lastResetAt = new Date(2025, 1, 28);
      jest.clearAllMocks();

      // Test 2026 (Feb 28)
      setupTestDate(new Date(2026, 1, 28));
      await service.handleCreditReset();
      expect(creditService.resetPlanCredits).toHaveBeenCalledTimes(1);
      sub.user.creditBalance.lastResetAt = new Date(2026, 1, 28);
      jest.clearAllMocks();

      // Test 2028 (Feb 29)
      setupTestDate(new Date(2028, 1, 29));
      await service.handleCreditReset();
      expect(creditService.resetPlanCredits).toHaveBeenCalledTimes(1);
    });
  });

  describe('Missed cron cycles', () => {
    it('should calculate multiple periods ahead if missed', async () => {
      const start = new Date(2023, 0, 15); // Jan 15, 2023
      const end = new Date(2024, 0, 15);
      
      // Last reset was on Jan 15, 2023
      const sub = createMockSubscription(PlanType.PRO_MONTHLY, start, end, new Date(2023, 0, 15));
      (prisma.subscription.findMany as jest.Mock).mockResolvedValue([sub]);

      // Simulate skipping to April 16, 2023 (missed Feb and Mar)
      setupTestDate(new Date(2023, 3, 16));
      await service.handleCreditReset();
      
      // Should reset for the April 15 period
      expect(creditService.resetPlanCredits).toHaveBeenCalledTimes(1);
      
      // Next time it shouldn't reset until May 15
      sub.user.creditBalance.lastResetAt = new Date(2023, 3, 15);
      jest.clearAllMocks();
      setupTestDate(new Date(2023, 4, 14));
      await service.handleCreditReset();
      expect(creditService.resetPlanCredits).not.toHaveBeenCalled();
    });
  });

  describe('End of subscription period', () => {
    it('should not reset credits if reset date exceeds currentPeriodEnd', async () => {
      const start = new Date(2023, 0, 15);
      const end = new Date(2023, 1, 15); // Ends on Feb 15
      
      const sub = createMockSubscription(PlanType.PRO_MONTHLY, start, end, new Date(2023, 0, 15));
      (prisma.subscription.findMany as jest.Mock).mockResolvedValue([sub]);

      // Test Feb 16 (after end date)
      setupTestDate(new Date(2023, 1, 16));
      await service.handleCreditReset();
      
      // Should not reset because the most recent reset date (Feb 15) is after or equal to currentPeriodEnd
      expect(creditService.resetPlanCredits).not.toHaveBeenCalled();
    });
  });
});
