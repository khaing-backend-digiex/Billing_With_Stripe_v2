import { Test, TestingModule } from '@nestjs/testing';
import { StripeWebhookController } from '../stripe-webhook.controller';
import { StripeService } from '../stripe.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../logger/app-logger';
import { ServiceError } from '../../common/exceptions/service-error.exception';
import { WebhookStatus } from '../../../generated/prisma/client';
import Stripe from 'stripe';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let stripeService: StripeService;
  let prismaService: PrismaService;

  const mockStripeService = {
    verifyWebhookSignature: jest.fn(),
  };

  const mockPrismaService = {
    webhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
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
      controllers: [StripeWebhookController],
      providers: [
        { provide: StripeService, useValue: mockStripeService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    controller = module.get<StripeWebhookController>(StripeWebhookController);
    stripeService = module.get<StripeService>(StripeService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('handleWebhook', () => {
    const mockEvent = {
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          metadata: { userId: 'user-1', planType: 'PRO_MONTHLY' },
        },
      },
    } as unknown as Stripe.Event;

    const mockRequest = {
      rawBody: Buffer.from(JSON.stringify(mockEvent.data.object)),
    };

    it('should verify signature and store event', async () => {
      mockStripeService.verifyWebhookSignature.mockReturnValue(mockEvent);
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue(null);
      mockPrismaService.webhookEvent.create.mockResolvedValue({ id: 'wh_123' });

      const result = await controller.handleWebhook('sig_test', mockRequest as any);

      expect(stripeService.verifyWebhookSignature).toHaveBeenCalledWith(
        mockRequest.rawBody.toString(),
        'sig_test'
      );
      expect(prismaService.webhookEvent.create).toHaveBeenCalledWith({
        data: {
          stripeEventId: mockEvent.id,
          type: mockEvent.type,
          payload: mockEvent.data.object,
          status: WebhookStatus.PENDING,
          retryCount: 0,
          maxRetries: 3,
          nextRetryAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ received: true });
    });

    it('should return duplicate flag for existing event', async () => {
      mockStripeService.verifyWebhookSignature.mockReturnValue(mockEvent);
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue({ id: 'wh_existing' });

      const result = await controller.handleWebhook('sig_test', mockRequest as any);

      expect(result).toEqual({ received: true, duplicate: true });
      expect(prismaService.webhookEvent.create).not.toHaveBeenCalled();
    });

    it('should throw ServiceError on invalid signature', async () => {
      mockStripeService.verifyWebhookSignature.mockImplementation(() => {
        throw new ServiceError('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature');
      });

      await expect(
        controller.handleWebhook('invalid_sig', mockRequest as any)
      ).rejects.toThrow(ServiceError);
    });

    it('should throw ServiceError when signature header is missing', async () => {
      mockStripeService.verifyWebhookSignature.mockImplementation(() => {
        throw new ServiceError('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature');
      });

      await expect(
        controller.handleWebhook(undefined as any, mockRequest as any)
      ).rejects.toThrow(ServiceError);
    });

    it('should handle rawBody as string', async () => {
      const requestWithStringBody = {
        rawBody: JSON.stringify(mockEvent.data.object),
      };

      mockStripeService.verifyWebhookSignature.mockReturnValue(mockEvent);
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue(null);
      mockPrismaService.webhookEvent.create.mockResolvedValue({ id: 'wh_123' });

      await controller.handleWebhook('sig_test', requestWithStringBody as any);

      expect(stripeService.verifyWebhookSignature).toHaveBeenCalledWith(
        JSON.stringify(mockEvent.data.object),
        'sig_test'
      );
    });

    it('should handle empty rawBody', async () => {
      const requestWithEmptyBody = { rawBody: '' };

      mockStripeService.verifyWebhookSignature.mockImplementation(() => {
        throw new ServiceError('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature');
      });

      await expect(
        controller.handleWebhook('sig_test', requestWithEmptyBody as any)
      ).rejects.toThrow(ServiceError);
    });
  });
});
