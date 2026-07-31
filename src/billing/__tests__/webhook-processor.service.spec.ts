import { Test, TestingModule } from '@nestjs/testing';
import { WebhookProcessorService } from '../webhook-processor.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookStrategyFactory } from '../strategies/webhook-strategy.factory';
import { WebhookStatus } from '../../../generated/prisma/client';

describe('WebhookProcessorService', () => {
  let service: WebhookProcessorService;
  let prismaService: PrismaService;
  let strategyFactory: WebhookStrategyFactory;

  const mockPrismaService = {
    webhookEvent: {
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const mockStrategyFactory = {
    getStrategy: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookProcessorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WebhookStrategyFactory, useValue: mockStrategyFactory },
      ],
    }).compile();

    service = module.get<WebhookProcessorService>(WebhookProcessorService);
    prismaService = module.get<PrismaService>(PrismaService);
    strategyFactory = module.get<WebhookStrategyFactory>(WebhookStrategyFactory);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processPendingEvents', () => {
    it('should do nothing when no pending events', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      await service.processPendingEvents();

      expect(prismaService.webhookEvent.update).not.toHaveBeenCalled();
    });

    it('should process pending events', async () => {
      const mockEvent = {
        id: 'wh_1',
        stripeEventId: 'evt_1',
        type: 'invoice.paid',
        payload: { id: 'in_1' },
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockPrismaService.$queryRaw.mockResolvedValue([mockEvent]);

      const mockStrategy = { handle: jest.fn().mockResolvedValue(undefined) };
      mockStrategyFactory.getStrategy.mockReturnValue(mockStrategy);

      await service.processPendingEvents();

      expect(prismaService.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'wh_1' },
        data: { status: WebhookStatus.PROCESSING },
      });
      expect(prismaService.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'wh_1' },
        data: {
          status: WebhookStatus.DONE,
          processedAt: expect.any(Date),
        },
      });
    });

    it('should mark event DONE when no strategy found', async () => {
      const mockEvent = {
        id: 'wh_1',
        stripeEventId: 'evt_1',
        type: 'unsupported.event',
        payload: {},
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockPrismaService.$queryRaw.mockResolvedValue([mockEvent]);
      mockStrategyFactory.getStrategy.mockReturnValue(null);

      await service.processPendingEvents();

      expect(prismaService.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'wh_1' },
        data: { status: WebhookStatus.DONE },
      });
    });

    it('should retry on failure with 1-day interval', async () => {
      const mockEvent = {
        id: 'wh_1',
        stripeEventId: 'evt_1',
        type: 'invoice.paid',
        payload: { id: 'in_1' },
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockPrismaService.$queryRaw.mockResolvedValue([mockEvent]);

      const mockStrategy = { handle: jest.fn().mockRejectedValue(new Error('DB error')) };
      mockStrategyFactory.getStrategy.mockReturnValue(mockStrategy);

      await service.processPendingEvents();

      expect(prismaService.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'wh_1' },
        data: {
          status: WebhookStatus.PENDING,
          retryCount: 1,
          lastError: 'DB error',
          nextRetryAt: expect.any(Date),
        },
      });
    });

    it('should mark FAILED after max retries', async () => {
      const mockEvent = {
        id: 'wh_1',
        stripeEventId: 'evt_1',
        type: 'invoice.paid',
        payload: { id: 'in_1' },
        retryCount: 2,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockPrismaService.$queryRaw.mockResolvedValue([mockEvent]);

      const mockStrategy = { handle: jest.fn().mockRejectedValue(new Error('DB error')) };
      mockStrategyFactory.getStrategy.mockReturnValue(mockStrategy);

      await service.processPendingEvents();

      expect(prismaService.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'wh_1' },
        data: {
          status: WebhookStatus.FAILED,
          retryCount: 3,
          lastError: 'DB error',
        },
      });
    });
  });
});
