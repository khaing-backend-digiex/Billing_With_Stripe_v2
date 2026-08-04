import { Test, TestingModule } from '@nestjs/testing';
import { StripeWebhookController } from '@/billing/stripe-webhook.controller';
import { PaymentService } from '@/billing/payment.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AppLogger } from '@/logger/app-logger';
import { ServiceError } from '@/common/exceptions/service-error.exception';
import { WebhookStatus } from '../../../generated/prisma/client';
import { WebhookProcessorService } from '@/billing/webhook-processor.service';
import { WebhookEvent } from '@/billing/payments/types/payment.types';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let paymentService: PaymentService;
  let prismaService: PrismaService;
  let webhookProcessor: WebhookProcessorService;

  const mockPaymentService = {
    verifyWebhookSignature: jest.fn(),
  };

  const mockPrismaService = {
    webhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockWebhookProcessor = {
    processEvent: jest.fn(),
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
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WebhookProcessorService, useValue: mockWebhookProcessor },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    controller = module.get<StripeWebhookController>(StripeWebhookController);
    paymentService = module.get<PaymentService>(PaymentService);
    prismaService = module.get<PrismaService>(PrismaService);
    webhookProcessor = module.get<WebhookProcessorService>(WebhookProcessorService);

    jest.clearAllMocks();
  });

  describe('handleWebhook', () => {
    const mockEvent: WebhookEvent = {
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      payload: {
        id: 'cs_test_123',
        metadata: { userId: 'user-1', planType: 'PRO_MONTHLY' },
      },
    };

    const mockRequest = {
      rawBody: Buffer.from(JSON.stringify(mockEvent.payload)),
    };

    it('should verify signature and store event', async () => {
      mockPaymentService.verifyWebhookSignature.mockReturnValue(mockEvent);
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue(null);
      mockPrismaService.webhookEvent.create.mockResolvedValue({ id: 'wh_123' });

      const result = await controller.handleWebhook('sig_test', mockRequest as any);

      expect(paymentService.verifyWebhookSignature).toHaveBeenCalledWith(
        mockRequest.rawBody.toString(),
        'sig_test'
      );
      expect(prismaService.webhookEvent.create).toHaveBeenCalledWith({
        data: {
          stripeEventId: mockEvent.id,
          type: mockEvent.type,
          payload: mockEvent.payload,
          status: WebhookStatus.PENDING,
          retryCount: 0,
          maxRetries: 3,
          nextRetryAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ received: true });
    });

    it('should return duplicate flag for existing event', async () => {
      mockPaymentService.verifyWebhookSignature.mockReturnValue(mockEvent);
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue({ id: 'wh_existing' });

      const result = await controller.handleWebhook('sig_test', mockRequest as any);

      expect(result).toEqual({ received: true, duplicate: true });
      expect(prismaService.webhookEvent.create).not.toHaveBeenCalled();
    });

    it('should throw ServiceError on invalid signature', async () => {
      mockPaymentService.verifyWebhookSignature.mockImplementation(() => {
        throw new ServiceError('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature');
      });

      await expect(
        controller.handleWebhook('invalid_sig', mockRequest as any)
      ).rejects.toThrow(ServiceError);
    });

    it('should throw ServiceError when signature header is missing', async () => {
      mockPaymentService.verifyWebhookSignature.mockImplementation(() => {
        throw new ServiceError('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature');
      });

      await expect(
        controller.handleWebhook(undefined as any, mockRequest as any)
      ).rejects.toThrow(ServiceError);
    });

    it('should handle rawBody as string', async () => {
      const requestWithStringBody = {
        rawBody: JSON.stringify(mockEvent.payload),
      };

      mockPaymentService.verifyWebhookSignature.mockReturnValue(mockEvent);
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue(null);
      mockPrismaService.webhookEvent.create.mockResolvedValue({ id: 'wh_123' });

      await controller.handleWebhook('sig_test', requestWithStringBody as any);

      expect(paymentService.verifyWebhookSignature).toHaveBeenCalledWith(
        JSON.stringify(mockEvent.payload),
        'sig_test'
      );
    });

    it('should handle empty rawBody', async () => {
      const requestWithEmptyBody = { rawBody: '' };

      mockPaymentService.verifyWebhookSignature.mockImplementation(() => {
        throw new ServiceError('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature');
      });

      await expect(
        controller.handleWebhook('sig_test', requestWithEmptyBody as any)
      ).rejects.toThrow(ServiceError);
    });
  });
});
