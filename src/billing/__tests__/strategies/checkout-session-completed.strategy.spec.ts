import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutSessionCompletedStrategy } from '../../strategies/checkout/checkout-session-completed.strategy';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreditService } from '../../../credit/credit.service';
import { PaymentService } from '../../payment.service';
import { WebhookEvent } from '../../payments/types/payment.types';

describe('CheckoutSessionCompletedStrategy', () => {
  let strategy: CheckoutSessionCompletedStrategy;
  let prismaService: PrismaService;
  let creditService: CreditService;
  let paymentService: PaymentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutSessionCompletedStrategy,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn((callback) => callback({
              subscription: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({}),
              },
              addonPurchase: {
                create: jest.fn().mockResolvedValue({}),
              },
              creditBalance: {
                update: jest.fn().mockResolvedValue({}),
              },
            })),
          },
        },
        {
          provide: CreditService,
          useValue: {
            addAddonCredits: jest.fn().mockResolvedValue({}),
            resetPlanCredits: jest.fn().mockResolvedValue({}),
            unfreezeAddonCredits: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: PaymentService,
          useValue: {
            getSubscription: jest.fn().mockResolvedValue({
              id: 'sub_123',
              currentPeriodStart: Math.floor(Date.now() / 1000),
              currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            }),
            mapRawSession: jest.fn((payload) => payload),
          },
        },
      ],
    }).compile();

    strategy = module.get<CheckoutSessionCompletedStrategy>(CheckoutSessionCompletedStrategy);
    prismaService = module.get<PrismaService>(PrismaService);
    creditService = module.get<CreditService>(CreditService);
    paymentService = module.get<PaymentService>(PaymentService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('supports', () => {
    it('should return true for checkout.session.completed', () => {
      expect(strategy.supports('checkout.session.completed')).toBe(true);
    });

    it('should return false for other event types', () => {
      expect(strategy.supports('invoice.paid')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should process ADDON purchase successfully', async () => {
      const mockEvent: WebhookEvent = {
        id: 'evt_1',
        type: 'checkout.session.completed',
        payload: {
          id: 'cs_123',
          metadata: {
            userId: 'user_1',
            type: 'addon',
            credits: '100',
            priceId: 'price_addon',
          },
        },
      };

      await strategy.handle(mockEvent);

      expect(creditService.addAddonCredits).toHaveBeenCalledWith('user_1', 100, expect.anything());
    });

    it('should process SUBSCRIPTION purchase successfully', async () => {
      const mockEvent: WebhookEvent = {
        id: 'evt_2',
        type: 'checkout.session.completed',
        payload: {
          id: 'cs_123',
          subscriptionId: 'sub_123',
          metadata: {
            userId: 'user_2',
            type: 'SUBSCRIPTION',
            planType: 'PRO_MONTHLY',
          },
        },
      };

      await strategy.handle(mockEvent);

      expect(paymentService.getSubscription).toHaveBeenCalledWith('sub_123');
    });
  });
});
