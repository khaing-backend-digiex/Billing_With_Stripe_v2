import { Test, TestingModule } from '@nestjs/testing';
import { CreditService } from '@/credit/credit.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AppLogger } from '@/logger/app-logger';
import { ServiceError } from '@/common/exceptions/service-error.exception';

describe('CreditService', () => {
  let service: CreditService;
  let prisma: PrismaService;

  const mockPrisma = {
    creditBalance: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    setContext: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<CreditService>(CreditService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('consumeCredits', () => {
    it('should consume from plan credits first', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 50,
        addonCreditsAvailable: 20,
        addonCreditsFrozen: 0,
      };

      const updatedBalance = {
        ...mockBalance,
        planCredits: 40,
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });
      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrisma.creditBalance.update.mockResolvedValue(updatedBalance);

      const result = await service.consumeCredits('user-1', 10);

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { planCredits: 40 },
      });
      expect(result.planCredits).toBe(40);
    });

    it('should consume addon credits when plan credits exhausted', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 5,
        addonCreditsAvailable: 20,
        addonCreditsFrozen: 0,
      };

      const updatedBalance = {
        userId: 'user-1',
        planCredits: 0,
        addonCreditsAvailable: 15,
        addonCreditsFrozen: 0,
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });
      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrisma.creditBalance.update.mockResolvedValue(updatedBalance);

      const result = await service.consumeCredits('user-1', 10);

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { planCredits: 0, addonCreditsAvailable: 15 },
      });
      expect(result.planCredits).toBe(0);
      expect(result.addonCreditsAvailable).toBe(15);
    });

    it('should throw ServiceError when insufficient credits', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 5,
        addonCreditsAvailable: 3,
        addonCreditsFrozen: 0,
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });
      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);

      await expect(service.consumeCredits('user-1', 20)).rejects.toThrow(
        ServiceError,
      );
    });

    it('should throw ServiceError when balance not found', async () => {
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });
      mockPrisma.creditBalance.findUnique.mockResolvedValue(null);

      await expect(service.consumeCredits('user-1', 10)).rejects.toThrow(
        ServiceError,
      );
    });

    it('should handle concurrent access with transaction', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 50,
        addonCreditsAvailable: 20,
        addonCreditsFrozen: 0,
      };

      const updatedBalance = {
        ...mockBalance,
        planCredits: 45,
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });
      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrisma.creditBalance.update.mockResolvedValue(updatedBalance);

      const result = await service.consumeCredits('user-1', 5);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result.planCredits).toBe(45);
    });

    it('should throw ServiceError when amount is 0 or negative', async () => {
      await expect(service.consumeCredits('user-1', 0)).rejects.toThrow(ServiceError);
      await expect(service.consumeCredits('user-1', -5)).rejects.toThrow(ServiceError);
    });
  });

  describe('getCreditBalance', () => {
    it('should return credit balance for user', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 50,
        addonCreditsAvailable: 20,
        addonCreditsFrozen: 0,
      };

      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);

      const result = await service.getCreditBalance('user-1');

      expect(result).toEqual(mockBalance);
    });

    it('should throw ServiceError when balance not found', async () => {
      mockPrisma.creditBalance.findUnique.mockResolvedValue(null);

      await expect(service.getCreditBalance('user-1')).rejects.toThrow(
        ServiceError,
      );
    });
  });

  describe('resetPlanCredits', () => {
    it('should reset plan credits to specified amount', async () => {
      mockPrisma.creditBalance.update.mockResolvedValue({
        userId: 'user-1',
        planCredits: 100,
        addonCreditsAvailable: 20,
        addonCreditsFrozen: 0,
      });

      await service.resetPlanCredits('user-1', 100);

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { planCredits: 100, lastResetAt: expect.any(Date) },
      });
    });

    it('should use provided transaction client', async () => {
      const mockTx = {
        creditBalance: { update: jest.fn().mockResolvedValue({}) },
      };

      await service.resetPlanCredits('user-1', 100, mockTx as any);

      expect(mockTx.creditBalance.update).toHaveBeenCalled();
      expect(mockPrisma.creditBalance.update).not.toHaveBeenCalled();
    });
  });

  describe('addAddonCredits', () => {
    it('should add addon credits to existing balance', async () => {
      mockPrisma.creditBalance.update.mockResolvedValue({
        userId: 'user-1',
        planCredits: 50,
        addonCreditsAvailable: 35,
        addonCreditsFrozen: 0,
      });

      await service.addAddonCredits('user-1', 15);

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { addonCreditsAvailable: { increment: 15 } },
      });
    });

    it('should use provided transaction client', async () => {
      const mockTx = {
        creditBalance: { update: jest.fn().mockResolvedValue({}) },
      };

      await service.addAddonCredits('user-1', 15, mockTx as any);

      expect(mockTx.creditBalance.update).toHaveBeenCalled();
      expect(mockPrisma.creditBalance.update).not.toHaveBeenCalled();
    });
  });

  describe('freezeAddonCredits', () => {
    it('should freeze all addon credits', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 50,
        addonCreditsAvailable: 20,
        addonCreditsFrozen: 0,
      };

      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrisma.creditBalance.update.mockResolvedValue({
        ...mockBalance,
        addonCreditsAvailable: 0,
        addonCreditsFrozen: 20,
      });

      await service.freezeAddonCredits('user-1');

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { addonCreditsAvailable: 0, addonCreditsFrozen: { increment: 20 } },
      });
    });

    it('should throw ServiceError when balance not found', async () => {
      mockPrisma.creditBalance.findUnique.mockResolvedValue(null);

      await expect(service.freezeAddonCredits('user-1')).rejects.toThrow(
        ServiceError,
      );
    });

    it('should use provided transaction client', async () => {
      const mockBalance = { userId: 'user-1', planCredits: 50, addonCreditsAvailable: 20, addonCreditsFrozen: 0 };
      const mockTx = {
        creditBalance: {
          findUnique: jest.fn().mockResolvedValue(mockBalance),
          update: jest.fn().mockResolvedValue({})
        },
      };

      await service.freezeAddonCredits('user-1', mockTx as any);

      expect(mockTx.creditBalance.update).toHaveBeenCalled();
      expect(mockPrisma.creditBalance.update).not.toHaveBeenCalled();
    });
  });

  describe('unfreezeAddonCredits', () => {
    it('should unfreeze all frozen addon credits', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 50,
        addonCreditsAvailable: 0,
        addonCreditsFrozen: 20,
      };

      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrisma.creditBalance.update.mockResolvedValue({
        ...mockBalance,
        addonCreditsAvailable: 20,
        addonCreditsFrozen: 0,
      });

      await service.unfreezeAddonCredits('user-1');

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { addonCreditsAvailable: { increment: 20 }, addonCreditsFrozen: 0 },
      });
    });

    it('should throw ServiceError when balance not found', async () => {
      mockPrisma.creditBalance.findUnique.mockResolvedValue(null);

      await expect(service.unfreezeAddonCredits('user-1')).rejects.toThrow(
        ServiceError,
      );
    });

    it('should use provided transaction client', async () => {
      const mockBalance = { userId: 'user-1', planCredits: 50, addonCreditsAvailable: 0, addonCreditsFrozen: 20 };
      const mockTx = {
        creditBalance: {
          findUnique: jest.fn().mockResolvedValue(mockBalance),
          update: jest.fn().mockResolvedValue({})
        },
      };

      await service.unfreezeAddonCredits('user-1', mockTx as any);

      expect(mockTx.creditBalance.update).toHaveBeenCalled();
      expect(mockPrisma.creditBalance.update).not.toHaveBeenCalled();
    });
  });

  describe('revokeSubscriptionCredits', () => {
    it('should revoke all subscription credits', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 50,
        addonCreditsAvailable: 20,
        addonCreditsFrozen: 10,
      };

      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrisma.creditBalance.update.mockResolvedValue({
        ...mockBalance,
        planCredits: 0,
        addonCreditsAvailable: 0,
        addonCreditsFrozen: 0,
      });

      await service.revokeSubscriptionCredits('user-1');

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { planCredits: 0, addonCreditsAvailable: 0, addonCreditsFrozen: 0 },
      });
    });

    it('should throw ServiceError when balance not found', async () => {
      mockPrisma.creditBalance.findUnique.mockResolvedValue(null);

      await expect(service.revokeSubscriptionCredits('user-1')).rejects.toThrow(
        ServiceError,
      );
    });

    it('should use provided transaction client', async () => {
      const mockBalance = { userId: 'user-1', planCredits: 50, addonCreditsAvailable: 20, addonCreditsFrozen: 10 };
      const mockTx = {
        creditBalance: {
          findUnique: jest.fn().mockResolvedValue(mockBalance),
          update: jest.fn().mockResolvedValue({})
        },
      };

      await service.revokeSubscriptionCredits('user-1', mockTx as any);

      expect(mockTx.creditBalance.update).toHaveBeenCalled();
      expect(mockPrisma.creditBalance.update).not.toHaveBeenCalled();
    });
  });

  describe('ensureFreePlanAfterTerminal', () => {
    it('should set FREE plan credits when planCredits is 0', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 0,
        addonCreditsAvailable: 0,
        addonCreditsFrozen: 0,
      };

      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrisma.creditBalance.update.mockResolvedValue({
        ...mockBalance,
        planCredits: 50,
        lastResetAt: expect.any(Date),
      });

      await service.ensureFreePlanAfterTerminal('user-1');

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { planCredits: 50, lastResetAt: expect.any(Date) },
      });
    });

    it('should not update when planCredits is not 0', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 25,
        addonCreditsAvailable: 0,
        addonCreditsFrozen: 0,
      };

      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);

      await service.ensureFreePlanAfterTerminal('user-1');

      expect(mockPrisma.creditBalance.update).not.toHaveBeenCalled();
    });

    it('should throw ServiceError when balance not found', async () => {
      mockPrisma.creditBalance.findUnique.mockResolvedValue(null);

      await expect(service.ensureFreePlanAfterTerminal('user-1')).rejects.toThrow(
        ServiceError,
      );
    });

    it('should use provided transaction client', async () => {
      const mockBalance = { userId: 'user-1', planCredits: 0, addonCreditsAvailable: 0, addonCreditsFrozen: 0 };
      const mockTx = {
        creditBalance: {
          findUnique: jest.fn().mockResolvedValue(mockBalance),
          update: jest.fn().mockResolvedValue({})
        },
      };

      await service.ensureFreePlanAfterTerminal('user-1', mockTx as any);

      expect(mockTx.creditBalance.update).toHaveBeenCalled();
      expect(mockPrisma.creditBalance.update).not.toHaveBeenCalled();
    });
  });
});
