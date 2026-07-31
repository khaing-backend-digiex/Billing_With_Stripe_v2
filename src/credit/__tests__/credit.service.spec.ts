import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CreditService } from '../credit.service';
import { PrismaService } from '../../prisma/prisma.service';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditService,
        { provide: PrismaService, useValue: mockPrisma },
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
        addonCredits: 20,
        frozenAddonCredits: 0,
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });
      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrisma.creditBalance.update.mockResolvedValue({
        ...mockBalance,
        planCredits: 40,
      });

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
        addonCredits: 20,
        frozenAddonCredits: 0,
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });
      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrisma.creditBalance.update.mockResolvedValue({
        ...mockBalance,
        planCredits: 0,
        addonCredits: 15,
      });

      const result = await service.consumeCredits('user-1', 10);

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { planCredits: 0, addonCredits: 15 },
      });
      expect(result.planCredits).toBe(0);
      expect(result.addonCreditsAvailable).toBe(15);
    });

    it('should throw BadRequestException when insufficient credits', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 5,
        addonCredits: 3,
        frozenAddonCredits: 0,
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });
      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);

      await expect(service.consumeCredits('user-1', 20)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when balance not found', async () => {
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });
      mockPrisma.creditBalance.findUnique.mockResolvedValue(null);

      await expect(service.consumeCredits('user-1', 10)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle concurrent access with transaction', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 50,
        addonCredits: 20,
        frozenAddonCredits: 0,
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });
      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrisma.creditBalance.update.mockResolvedValue({
        ...mockBalance,
        planCredits: 45,
      });

      const result = await service.consumeCredits('user-1', 5);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result.planCredits).toBe(45);
    });
  });

  describe('getCreditBalance', () => {
    it('should return credit balance for user', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 50,
        addonCredits: 20,
        frozenAddonCredits: 0,
      };

      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);

      const result = await service.getCreditBalance('user-1');

      expect(result).toEqual(mockBalance);
    });

    it('should throw NotFoundException when balance not found', async () => {
      mockPrisma.creditBalance.findUnique.mockResolvedValue(null);

      await expect(service.getCreditBalance('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('resetPlanCredits', () => {
    it('should reset plan credits to specified amount', async () => {
      mockPrisma.creditBalance.update.mockResolvedValue({
        userId: 'user-1',
        planCredits: 100,
        addonCredits: 20,
        frozenAddonCredits: 0,
      });

      await service.resetPlanCredits('user-1', 100);

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { planCredits: 100 },
      });
    });
  });

  describe('addAddonCredits', () => {
    it('should add addon credits to existing balance', async () => {
      mockPrisma.creditBalance.update.mockResolvedValue({
        userId: 'user-1',
        planCredits: 50,
        addonCredits: 35,
        frozenAddonCredits: 0,
      });

      await service.addAddonCredits('user-1', 15);

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { addonCredits: { increment: 15 } },
      });
    });
  });

  describe('freezeAddonCredits', () => {
    it('should freeze all addon credits', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 50,
        addonCredits: 20,
        frozenAddonCredits: 0,
      };

      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrisma.creditBalance.update.mockResolvedValue({
        ...mockBalance,
        addonCredits: 0,
        frozenAddonCredits: 20,
      });

      await service.freezeAddonCredits('user-1');

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { addonCredits: 0, frozenAddonCredits: 20 },
      });
    });
  });

  describe('unfreezeAddonCredits', () => {
    it('should unfreeze all frozen addon credits', async () => {
      const mockBalance = {
        userId: 'user-1',
        planCredits: 50,
        addonCredits: 0,
        frozenAddonCredits: 20,
      };

      mockPrisma.creditBalance.findUnique.mockResolvedValue(mockBalance);
      mockPrisma.creditBalance.update.mockResolvedValue({
        ...mockBalance,
        addonCredits: 20,
        frozenAddonCredits: 0,
      });

      await service.unfreezeAddonCredits('user-1');

      expect(mockPrisma.creditBalance.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { addonCredits: 20, frozenAddonCredits: 0 },
      });
    });
  });
});
