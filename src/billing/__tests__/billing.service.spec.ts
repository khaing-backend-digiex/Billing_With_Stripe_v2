import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from '@/billing/billing.service';
import { PrismaService } from '@/prisma/prisma.service';
import { PaymentService } from '@/billing/payment.service';
import { CreditService } from '@/credit/credit.service';
import { AppLogger } from '@/logger/app-logger';
import { ConfigService } from '@nestjs/config';
import { ServiceError } from '@/common/exceptions/service-error.exception';
import { ErrorCode } from '@/common/enums/error-code.enum';
import { PlanType, SubStatus } from '../../../generated/prisma/client';

describe('BillingService - Upgrade Validation', () => {
  let service: BillingService;
  let prismaService: PrismaService;
  let paymentService: PaymentService;

  const mockPrismaService = {
    subscription: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    },
    stripePrice: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    paymentMethod: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockPaymentService = {
    updateSubscription: jest.fn(),
    createCheckoutSession: jest.fn(),
    previewUpgrade: jest.fn(),
    createSetupIntent: jest.fn(),
    detachPaymentMethod: jest.fn(),
  };

  const mockCreditService = {
    resetPlanCredits: jest.fn(),
    unfreezeAddonCredits: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    setContext: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: CreditService, useValue: mockCreditService },
        { provide: AppLogger, useValue: mockLogger },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    prismaService = module.get<PrismaService>(PrismaService);
    paymentService = module.get<PaymentService>(PaymentService);

    jest.clearAllMocks();
  });

  describe('upgradeSubscription - Billing Cycle Changes', () => {
    const userId = 'user-123';
    const subscriptionId = 'sub-123';
    const stripeSubscriptionId = 'sub_stripe_123';

    it('should allow billing cycle upgrade from MONTHLY to ANNUAL', async () => {
      // Arrange
      const currentSubscription = {
        id: subscriptionId,
        userId,
        stripeSubscriptionId,
        plan: PlanType.PRO_MONTHLY,
        status: SubStatus.ACTIVE,
      };

      const newPrice = {
        stripePriceId: 'price_annual',
        product: {
          planType: PlanType.PRO_ANNUAL,
        },
      };

      mockPrismaService.subscription.findFirst.mockResolvedValue(currentSubscription);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(newPrice);
      mockPaymentService.updateSubscription.mockResolvedValue({});
      mockPrismaService.subscription.update.mockResolvedValue({});

      // Act
      const result = await service.upgradeSubscription(userId, 'price_annual');

      // Assert
      expect(paymentService.updateSubscription).toHaveBeenCalledWith(
        stripeSubscriptionId,
        {
          newPriceId: 'price_annual',
          prorationBehavior: 'create_prorations',
        }
      );
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { id: subscriptionId },
        data: { plan: PlanType.PRO_ANNUAL },
      });
    });

    it('should block billing cycle downgrade from ANNUAL to MONTHLY', async () => {
      // Arrange
      const currentSubscription = {
        id: subscriptionId,
        userId,
        stripeSubscriptionId,
        plan: PlanType.PRO_ANNUAL,
        status: SubStatus.ACTIVE,
      };

      const newPrice = {
        stripePriceId: 'price_monthly',
        product: {
          planType: PlanType.PRO_MONTHLY,
        },
      };

      mockPrismaService.subscription.findFirst.mockResolvedValue(currentSubscription);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(newPrice);

      // Act & Assert
      await expect(
        service.upgradeSubscription(userId, 'price_monthly')
      ).rejects.toThrow(ServiceError);

      await expect(
        service.upgradeSubscription(userId, 'price_monthly')
      ).rejects.toThrow('Billing cycle downgrades are not allowed');

      // Verify no API calls were made
      expect(paymentService.updateSubscription).not.toHaveBeenCalled();
      expect(mockPrismaService.subscription.update).not.toHaveBeenCalled();
    });

    it('should block same plan changes', async () => {
      // Arrange
      const currentSubscription = {
        id: subscriptionId,
        userId,
        stripeSubscriptionId,
        plan: PlanType.PRO_MONTHLY,
        status: SubStatus.ACTIVE,
      };

      const newPrice = {
        stripePriceId: 'price_monthly',
        product: {
          planType: PlanType.PRO_MONTHLY,
        },
      };

      mockPrismaService.subscription.findFirst.mockResolvedValue(currentSubscription);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(newPrice);

      // Act & Assert
      await expect(
        service.upgradeSubscription(userId, 'price_monthly')
      ).rejects.toThrow(ServiceError);

      await expect(
        service.upgradeSubscription(userId, 'price_monthly')
      ).rejects.toThrow('No change in subscription plan');

      // Verify no API calls were made
      expect(paymentService.updateSubscription).not.toHaveBeenCalled();
      expect(mockPrismaService.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('upgradeSubscription - Tier Changes', () => {
    const userId = 'user-123';
    const subscriptionId = 'sub-123';
    const stripeSubscriptionId = 'sub_stripe_123';

    it('should block tier changes (FREE to PRO)', async () => {
      // Arrange
      const currentSubscription = {
        id: subscriptionId,
        userId,
        stripeSubscriptionId,
        plan: PlanType.FREE,
        status: SubStatus.ACTIVE,
      };

      const newPrice = {
        stripePriceId: 'price_pro_monthly',
        product: {
          planType: PlanType.PRO_MONTHLY,
        },
      };

      mockPrismaService.subscription.findFirst.mockResolvedValue(currentSubscription);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(newPrice);

      // Act & Assert
      await expect(
        service.upgradeSubscription(userId, 'price_pro_monthly')
      ).rejects.toThrow(ServiceError);

      await expect(
        service.upgradeSubscription(userId, 'price_pro_monthly')
      ).rejects.toThrow('Cross-tier changes require cancel and create');

      // Verify no API calls were made
      expect(paymentService.updateSubscription).not.toHaveBeenCalled();
      expect(mockPrismaService.subscription.update).not.toHaveBeenCalled();
    });

    it('should block tier changes (PRO to FREE)', async () => {
      // Arrange
      const currentSubscription = {
        id: subscriptionId,
        userId,
        stripeSubscriptionId,
        plan: PlanType.PRO_ANNUAL,
        status: SubStatus.ACTIVE,
      };

      const newPrice = {
        stripePriceId: 'price_free',
        product: {
          planType: PlanType.FREE,
        },
      };

      mockPrismaService.subscription.findFirst.mockResolvedValue(currentSubscription);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(newPrice);

      // Act & Assert
      await expect(
        service.upgradeSubscription(userId, 'price_free')
      ).rejects.toThrow(ServiceError);

      await expect(
        service.upgradeSubscription(userId, 'price_free')
      ).rejects.toThrow('Cross-tier changes require cancel and create');

      // Verify no API calls were made
      expect(paymentService.updateSubscription).not.toHaveBeenCalled();
      expect(mockPrismaService.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('upgradeSubscription - Error Cases', () => {
    const userId = 'user-123';

    it('should throw error when no active subscription exists', async () => {
      // Arrange
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.upgradeSubscription(userId, 'price_annual')
      ).rejects.toThrow(ServiceError);

      await expect(
        service.upgradeSubscription(userId, 'price_annual')
      ).rejects.toThrow('No active subscription');
    });

    it('should throw error when price not found', async () => {
      // Arrange
      const currentSubscription = {
        id: 'sub-123',
        userId,
        stripeSubscriptionId: 'sub_stripe_123',
        plan: PlanType.PRO_MONTHLY,
        status: SubStatus.ACTIVE,
      };

      mockPrismaService.subscription.findFirst.mockResolvedValue(currentSubscription);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.upgradeSubscription(userId, 'invalid_price')
      ).rejects.toThrow(ServiceError);

      await expect(
        service.upgradeSubscription(userId, 'invalid_price')
      ).rejects.toThrow('Price not found');
    });
  });

  describe('getTransitionType - Future Tier Support', () => {
    it('should correctly identify billing cycle upgrade', () => {
      const getTransitionType = (service as any).getTransitionType.bind(service);
      
      expect(getTransitionType(PlanType.PRO_MONTHLY, PlanType.PRO_ANNUAL)).toBe('billing_cycle_upgrade');
    });

    it('should correctly identify billing cycle downgrade', () => {
      const getTransitionType = (service as any).getTransitionType.bind(service);
      
      expect(getTransitionType(PlanType.PRO_ANNUAL, PlanType.PRO_MONTHLY)).toBe('billing_cycle_downgrade');
    });

    it('should correctly identify same plan', () => {
      const getTransitionType = (service as any).getTransitionType.bind(service);
      
      expect(getTransitionType(PlanType.PRO_MONTHLY, PlanType.PRO_MONTHLY)).toBe('same_plan');
      expect(getTransitionType(PlanType.PRO_ANNUAL, PlanType.PRO_ANNUAL)).toBe('same_plan');
      expect(getTransitionType(PlanType.FREE, PlanType.FREE)).toBe('same_plan');
    });

    it('should correctly identify tier changes', () => {
      const getTransitionType = (service as any).getTransitionType.bind(service);
      
      expect(getTransitionType(PlanType.FREE, PlanType.PRO_MONTHLY)).toBe('tier_change');
      expect(getTransitionType(PlanType.PRO_MONTHLY, PlanType.FREE)).toBe('tier_change');
      expect(getTransitionType(PlanType.FREE, PlanType.PRO_ANNUAL)).toBe('tier_change');
      expect(getTransitionType(PlanType.PRO_ANNUAL, PlanType.FREE)).toBe('tier_change');
    });
  });

  describe('previewUpgrade', () => {
    const userId = 'user-123';
    const subscriptionId = 'sub-123';
    const stripeSubscriptionId = 'sub_stripe_123';

    it('should return preview for billing cycle upgrade', async () => {
      // Arrange
      const currentSubscription = {
        id: subscriptionId,
        userId,
        stripeSubscriptionId,
        plan: PlanType.PRO_MONTHLY,
        status: SubStatus.ACTIVE,
      };

      const newPrice = {
        stripePriceId: 'price_annual',
        product: {
          planType: PlanType.PRO_ANNUAL,
        },
      };

      const mockPreview = {
        prorationAmount: -5000,
        newCharge: 96000,
        netAmount: 91000,
        currency: 'vnd',
        nextBillingDate: new Date('2025-02-01'),
      };

      mockPrismaService.subscription.findFirst.mockResolvedValue(currentSubscription);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(newPrice);
      mockPaymentService.previewUpgrade.mockResolvedValue(mockPreview);

      // Act
      const result = await service.previewUpgrade(userId, 'price_annual');

      // Assert
      expect(result).toEqual(mockPreview);
      expect(mockPaymentService.previewUpgrade).toHaveBeenCalledWith(
        stripeSubscriptionId,
        'price_annual'
      );
    });

    it('should block preview for billing cycle downgrade', async () => {
      // Arrange
      const currentSubscription = {
        id: subscriptionId,
        userId,
        stripeSubscriptionId,
        plan: PlanType.PRO_ANNUAL,
        status: SubStatus.ACTIVE,
      };

      const newPrice = {
        stripePriceId: 'price_monthly',
        product: {
          planType: PlanType.PRO_MONTHLY,
        },
      };

      mockPrismaService.subscription.findFirst.mockResolvedValue(currentSubscription);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(newPrice);

      // Act & Assert
      await expect(
        service.previewUpgrade(userId, 'price_monthly')
      ).rejects.toThrow(ServiceError);

      await expect(
        service.previewUpgrade(userId, 'price_monthly')
      ).rejects.toThrow('Billing cycle downgrades are not allowed');

      expect(mockPaymentService.previewUpgrade).not.toHaveBeenCalled();
    });

    it('should block preview for same plan', async () => {
      // Arrange
      const currentSubscription = {
        id: subscriptionId,
        userId,
        stripeSubscriptionId,
        plan: PlanType.PRO_MONTHLY,
        status: SubStatus.ACTIVE,
      };

      const newPrice = {
        stripePriceId: 'price_monthly',
        product: {
          planType: PlanType.PRO_MONTHLY,
        },
      };

      mockPrismaService.subscription.findFirst.mockResolvedValue(currentSubscription);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(newPrice);

      // Act & Assert
      await expect(
        service.previewUpgrade(userId, 'price_monthly')
      ).rejects.toThrow(ServiceError);

      await expect(
        service.previewUpgrade(userId, 'price_monthly')
      ).rejects.toThrow('No change in subscription plan');

      expect(mockPaymentService.previewUpgrade).not.toHaveBeenCalled();
    });

    it('should throw error when no active subscription exists', async () => {
      // Arrange
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.previewUpgrade(userId, 'price_annual')
      ).rejects.toThrow(ServiceError);

      await expect(
        service.previewUpgrade(userId, 'price_annual')
      ).rejects.toThrow('No active subscription');
    });

    it('should throw error when price not found', async () => {
      // Arrange
      const currentSubscription = {
        id: subscriptionId,
        userId,
        stripeSubscriptionId,
        plan: PlanType.PRO_MONTHLY,
        status: SubStatus.ACTIVE,
      };

      mockPrismaService.subscription.findFirst.mockResolvedValue(currentSubscription);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.previewUpgrade(userId, 'invalid_price')
      ).rejects.toThrow(ServiceError);

      await expect(
        service.previewUpgrade(userId, 'invalid_price')
      ).rejects.toThrow('Price not found');
    });
  });

  describe('createSubscriptionCheckout - Subscription Limit Check', () => {
    const userId = 'user-123';
    const priceId = 'price_pro_monthly';
    const currency = 'USD';

    it('should throw SUBSCRIPTION_LIMIT_EXCEEDED when user has active subscription', async () => {
      // Arrange
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        stripeCustomerId: 'cus_123',
      };

      const activeSubscription = {
        id: 'sub-123',
        userId,
        stripeSubscriptionId: 'sub_stripe_123',
        plan: PlanType.PRO_MONTHLY,
        status: SubStatus.ACTIVE,
      };

      const mockPrice = {
        stripePriceId: priceId,
        product: {
          planType: PlanType.PRO_ANNUAL,
        },
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.subscription.findFirst.mockResolvedValue(activeSubscription);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(mockPrice);

      // Act & Assert
      await expect(
        service.createSubscriptionCheckout(userId, priceId, currency)
      ).rejects.toThrow(ServiceError);

      await expect(
        service.createSubscriptionCheckout(userId, priceId, currency)
      ).rejects.toThrow('User already has an active subscription');

      // Verify checkout session was not created
      expect(mockPaymentService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('should allow checkout when user has no active subscription', async () => {
      // Arrange
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        stripeCustomerId: 'cus_123',
      };

      const mockPrice = {
        stripePriceId: priceId,
        product: {
          planType: PlanType.PRO_MONTHLY,
        },
      };

      const mockSession = {
        url: 'https://checkout.stripe.com/test',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(mockPrice);
      mockPaymentService.createCheckoutSession.mockResolvedValue(mockSession);

      // Act
      const result = await service.createSubscriptionCheckout(userId, priceId, currency);

      // Assert
      expect(result).toEqual({ url: mockSession.url });
      expect(mockPaymentService.createCheckoutSession).toHaveBeenCalled();
    });

    it('should allow checkout when user has only canceled subscription', async () => {
      // Arrange
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        stripeCustomerId: 'cus_123',
      };

      const canceledSubscription = {
        id: 'sub-123',
        userId,
        stripeSubscriptionId: 'sub_stripe_123',
        plan: PlanType.PRO_MONTHLY,
        status: SubStatus.CANCELED,
      };

      const mockPrice = {
        stripePriceId: priceId,
        product: {
          planType: PlanType.PRO_MONTHLY,
        },
      };

      const mockSession = {
        url: 'https://checkout.stripe.com/test',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.subscription.findFirst.mockResolvedValue(null); // findFirst only looks for ACTIVE
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(mockPrice);
      mockPaymentService.createCheckoutSession.mockResolvedValue(mockSession);

      // Act
      const result = await service.createSubscriptionCheckout(userId, priceId, currency);

      // Assert
      expect(result).toEqual({ url: mockSession.url });
      expect(mockPaymentService.createCheckoutSession).toHaveBeenCalled();
    });

    it('should throw USER_NOT_FOUND when user does not exist', async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createSubscriptionCheckout(userId, priceId, currency)
      ).rejects.toThrow(ServiceError);

      await expect(
        service.createSubscriptionCheckout(userId, priceId, currency)
      ).rejects.toThrow('User not found');
    });

    it('should throw PRICE_NOT_FOUND when price does not exist', async () => {
      // Arrange
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        stripeCustomerId: 'cus_123',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createSubscriptionCheckout(userId, 'invalid_price', currency)
      ).rejects.toThrow(ServiceError);

      await expect(
        service.createSubscriptionCheckout(userId, 'invalid_price', currency)
      ).rejects.toThrow('Price not found');
    });

    it('should throw STRIPE_CUSTOMER_MISSING when user has no Stripe customer ID', async () => {
      // Arrange
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        stripeCustomerId: null,
      };

      const mockPrice = {
        stripePriceId: priceId,
        product: {
          planType: PlanType.PRO_MONTHLY,
        },
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.stripePrice.findUnique.mockResolvedValue(mockPrice);

      // Act & Assert
      await expect(
        service.createSubscriptionCheckout(userId, priceId, currency)
      ).rejects.toThrow(ServiceError);

      await expect(
        service.createSubscriptionCheckout(userId, priceId, currency)
      ).rejects.toThrow('User does not have a Stripe customer ID');
    });
  });

  describe('Payment Method Management', () => {
    const userId = 'user-123';
    const stripeCustomerId = 'cus_123';

    describe('listPaymentMethods', () => {
      it('should return payment methods for user', async () => {
        const mockUser = {
          id: userId,
          stripeCustomerId,
        };
        const mockPaymentMethods = [
          {
            id: 'pm_1',
            stripePaymentMethodId: 'pm_stripe_1',
            brand: 'visa',
            last4: '4242',
            expMonth: 12,
            expYear: 2025,
            isDefault: true,
          },
        ];

        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
        mockPrismaService.paymentMethod.findMany.mockResolvedValue(mockPaymentMethods);

        const result = await service.listPaymentMethods(userId);

        expect(result).toEqual(mockPaymentMethods);
        expect(mockPrismaService.paymentMethod.findMany).toHaveBeenCalledWith({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
      });

      it('should throw USER_NOT_FOUND when user does not exist', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(null);

        await expect(service.listPaymentMethods(userId)).rejects.toThrow(
          'User not found'
        );
      });

      it('should throw STRIPE_CUSTOMER_MISSING when user has no Stripe customer ID', async () => {
        const mockUser = {
          id: userId,
          stripeCustomerId: null,
        };

        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

        await expect(service.listPaymentMethods(userId)).rejects.toThrow(
          'User does not have a Stripe customer ID'
        );
      });
    });

    describe('deletePaymentMethod', () => {
      const paymentMethodId = 'pm_1';

      it('should delete payment method and detach from Stripe', async () => {
        const mockPaymentMethod = {
          id: paymentMethodId,
          userId,
          stripePaymentMethodId: 'pm_stripe_1',
        };

        mockPrismaService.paymentMethod.findFirst.mockResolvedValue(mockPaymentMethod);
        mockPaymentService.detachPaymentMethod.mockResolvedValue(undefined);
        mockPrismaService.paymentMethod.delete.mockResolvedValue(mockPaymentMethod);

        const result = await service.deletePaymentMethod(userId, paymentMethodId);

        expect(result).toEqual({ success: true });
        expect(mockPaymentService.detachPaymentMethod).toHaveBeenCalledWith(
          'pm_stripe_1'
        );
        expect(mockPrismaService.paymentMethod.delete).toHaveBeenCalledWith({
          where: { id: paymentMethodId },
        });
      });

      it('should throw PAYMENT_METHOD_NOT_FOUND when payment method does not exist', async () => {
        mockPrismaService.paymentMethod.findFirst.mockResolvedValue(null);

        await expect(
          service.deletePaymentMethod(userId, paymentMethodId)
        ).rejects.toThrow('Payment method not found');
      });

      it('should throw PAYMENT_METHOD_NOT_FOUND when payment method belongs to different user', async () => {
        mockPrismaService.paymentMethod.findFirst.mockResolvedValue(null);

        await expect(
          service.deletePaymentMethod(userId, paymentMethodId)
        ).rejects.toThrow('Payment method not found');
      });
    });

    describe('createSetupIntent', () => {
      it('should create setup intent for user with Stripe customer', async () => {
        const mockUser = {
          id: userId,
          stripeCustomerId,
        };
        const mockSetupIntent = {
          id: 'seti_123',
          clientSecret: 'seti_123_secret_456',
        };

        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
        mockPaymentService.createSetupIntent.mockResolvedValue(mockSetupIntent);

        const result = await service.createSetupIntent(userId);

        expect(result).toEqual(mockSetupIntent);
        expect(mockPaymentService.createSetupIntent).toHaveBeenCalledWith(
          stripeCustomerId
        );
      });

      it('should throw USER_NOT_FOUND when user does not exist', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(null);

        await expect(service.createSetupIntent(userId)).rejects.toThrow(
          'User not found'
        );
      });

      it('should throw STRIPE_CUSTOMER_MISSING when user has no Stripe customer ID', async () => {
        const mockUser = {
          id: userId,
          stripeCustomerId: null,
        };

        mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

        await expect(service.createSetupIntent(userId)).rejects.toThrow(
          'User does not have a Stripe customer ID'
        );
      });
    });
  });
});
