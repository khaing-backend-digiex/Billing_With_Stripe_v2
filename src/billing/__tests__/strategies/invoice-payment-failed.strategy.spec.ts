import { Test, TestingModule } from '@nestjs/testing';
import { InvoicePaymentFailedStrategy } from '@/billing/strategies/invoice/invoice-payment-failed.strategy';
import { PrismaService } from '@/prisma/prisma.service';
import { PaymentService } from '@/billing/payment.service';
import { CreditService } from '@/credit/credit.service';
import { AppLogger } from '@/logger/app-logger';
import { SubStatus } from '../../../../generated/prisma/client';

describe('InvoicePaymentFailedStrategy - Enhanced Logic', () => {
  let strategy: InvoicePaymentFailedStrategy;
  let prismaService: PrismaService;
  let paymentService: PaymentService;
  let creditService: CreditService;

  const mockPrismaService = {
    subscription: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    creditBalance: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockPaymentService = {
    mapRawInvoice: jest.fn(),
    cancelSubscription: jest.fn(),
  };

  const mockCreditService = {
    freezeAddonCredits: jest.fn(),
    revokeSubscriptionCredits: jest.fn(),
    ensureFreePlanAfterTerminal: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    setContext: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicePaymentFailedStrategy,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: CreditService, useValue: mockCreditService },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    strategy = module.get<InvoicePaymentFailedStrategy>(InvoicePaymentFailedStrategy);
    prismaService = module.get<PrismaService>(PrismaService);
    paymentService = module.get<PaymentService>(PaymentService);
    creditService = module.get<CreditService>(CreditService);

    jest.clearAllMocks();
  });

  describe('Auto-cancel logic after max retries', () => {
    const mockSubscription = {
      id: 'sub_123',
      stripeSubscriptionId: 'sub_stripe_123',
      userId: 'user_123',
      status: SubStatus.ACTIVE,
    };

    beforeEach(() => {
      mockPrismaService.$transaction.mockImplementation((callback: any) => callback(mockPrismaService));
    });

    it('should cancel subscription after max retries', async () => {
      const mockInvoice = {
        id: 'inv_123',
        subscriptionId: 'sub_stripe_123',
        attemptCount: 3,
      };

      mockPaymentService.mapRawInvoice.mockReturnValue(mockInvoice);
      mockPrismaService.subscription.findUnique.mockResolvedValue(mockSubscription);

      await strategy.handle({ id: 'evt_123', type: 'test', payload: {} });

      expect(paymentService.cancelSubscription).toHaveBeenCalledWith('sub_stripe_123');
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub_123' },
        data: { status: SubStatus.CANCELED },
      });
      expect(creditService.revokeSubscriptionCredits).toHaveBeenCalledWith('user_123', expect.anything());
      expect(creditService.ensureFreePlanAfterTerminal).toHaveBeenCalledWith('user_123', expect.anything());
    });

    it('should freeze credits if under max retries', async () => {
      const mockInvoice = {
        id: 'inv_123',
        subscriptionId: 'sub_stripe_123',
        attemptCount: 1,
      };

      mockPaymentService.mapRawInvoice.mockReturnValue(mockInvoice);
      mockPrismaService.subscription.findUnique.mockResolvedValue(mockSubscription);

      await strategy.handle({ id: 'evt_123', type: 'test', payload: {} });

      expect(paymentService.cancelSubscription).not.toHaveBeenCalled();
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub_123' },
        data: { status: SubStatus.PAST_DUE },
      });
      expect(creditService.freezeAddonCredits).toHaveBeenCalledWith('user_123', expect.anything());
    });
  });
});
