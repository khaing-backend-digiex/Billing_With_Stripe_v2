import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutSessionCompletedStrategy } from '../../strategies/checkout/checkout-session-completed.strategy';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreditService } from '../../../credit/credit.service';
import { StripeService } from '../../stripe.service';
import Stripe from 'stripe';

describe('CheckoutSessionCompletedStrategy', () => {
  let strategy: CheckoutSessionCompletedStrategy;
  let prismaService: PrismaService;
  let creditService: CreditService;
  let stripeService: StripeService;

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
          provide: StripeService,
          useValue: {
            getSubscription: jest.fn().mockResolvedValue({
              items: {
                data: [
                  {
                    current_period_start: Math.floor(Date.now() / 1000),
                    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
                  },
                ],
              },
            }),
          },
        },
      ],
    }).compile();

    strategy = module.get<CheckoutSessionCompletedStrategy>(CheckoutSessionCompletedStrategy);
    prismaService = module.get<PrismaService>(PrismaService);
    creditService = module.get<CreditService>(CreditService);
    stripeService = module.get<StripeService>(StripeService);
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
    it('should handle subscription purchase', async () => {
      const event = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            mode: 'subscription',
            subscription: 'sub_test',
            metadata: {
              userId: 'user_test',
              planType: 'PRO_MONTHLY',
            },
          },
        },
      } as unknown as Stripe.Event;

      await strategy.handle(event);

      expect(stripeService.getSubscription).toHaveBeenCalledWith('sub_test');
      expect(prismaService.$transaction).toHaveBeenCalled();
    });

    it('should handle addon purchase', async () => {
      const event = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            mode: 'payment',
            payment_intent: 'pi_test',
            metadata: {
              userId: 'user_test',
              type: 'addon',
              credits: '15',
            },
          },
        },
      } as unknown as Stripe.Event;

      await strategy.handle(event);

      expect(prismaService.$transaction).toHaveBeenCalled();
      expect(creditService.addAddonCredits).toHaveBeenCalledWith('user_test', 15, expect.anything());
    });
  });
});
