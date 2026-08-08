import { Test, TestingModule } from '@nestjs/testing';
import { SetupIntentSucceededStrategy } from '@/billing/strategies/payment-method/setup-intent-succeeded.strategy';
import { PaymentMethodAttachedStrategy } from '@/billing/strategies/payment-method/payment-method-attached.strategy';
import { PaymentMethodUpdatedStrategy } from '@/billing/strategies/payment-method/payment-method-updated.strategy';
import { PaymentMethodDetachedStrategy } from '@/billing/strategies/payment-method/payment-method-detached.strategy';
import { PrismaService } from '@/prisma/prisma.service';
import { PaymentService } from '@/billing/payment.service';
import { AppLogger } from '@/logger/app-logger';
import {
  STRIPE_EVENT_SETUP_INTENT_SUCCEEDED,
  STRIPE_EVENT_PAYMENT_METHOD_ATTACHED,
  STRIPE_EVENT_PAYMENT_METHOD_UPDATED,
  STRIPE_EVENT_PAYMENT_METHOD_DETACHED,
} from '@/common/constants/stripe-event.constants';

describe('Payment Method Webhook Strategies', () => {
  let setupIntentStrategy: SetupIntentSucceededStrategy;
  let attachedStrategy: PaymentMethodAttachedStrategy;
  let updatedStrategy: PaymentMethodUpdatedStrategy;
  let detachedStrategy: PaymentMethodDetachedStrategy;
  let prisma: PrismaService;
  let paymentService: PaymentService;

  const mockPrisma = {
    paymentMethod: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockPaymentService = {
    getPaymentMethod: jest.fn(),
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
        SetupIntentSucceededStrategy,
        PaymentMethodAttachedStrategy,
        PaymentMethodUpdatedStrategy,
        PaymentMethodDetachedStrategy,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    setupIntentStrategy = module.get<SetupIntentSucceededStrategy>(SetupIntentSucceededStrategy);
    attachedStrategy = module.get<PaymentMethodAttachedStrategy>(PaymentMethodAttachedStrategy);
    updatedStrategy = module.get<PaymentMethodUpdatedStrategy>(PaymentMethodUpdatedStrategy);
    detachedStrategy = module.get<PaymentMethodDetachedStrategy>(PaymentMethodDetachedStrategy);
    prisma = module.get<PrismaService>(PrismaService);
    paymentService = module.get<PaymentService>(PaymentService);

    jest.clearAllMocks();
  });

  describe('SetupIntentSucceededStrategy', () => {
    it('should support setup_intent.succeeded event', () => {
      expect(setupIntentStrategy.supports(STRIPE_EVENT_SETUP_INTENT_SUCCEEDED)).toBe(true);
      expect(setupIntentStrategy.supports('other.event')).toBe(false);
    });

    it('should save payment method on setup intent success', async () => {
      const mockPaymentMethod = {
        id: 'pm_123',
        card: {
          brand: 'visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2025,
        },
      };

      const mockEvent = {
        id: 'evt_123',
        type: STRIPE_EVENT_SETUP_INTENT_SUCCEEDED,
        payload: {
          id: 'seti_123',
          customer: 'cus_123',
          payment_method: 'pm_123',
          metadata: { userId: 'user-123' },
        },
      };

      mockPaymentService.getPaymentMethod.mockResolvedValue(mockPaymentMethod);
      mockPrisma.paymentMethod.findUnique.mockResolvedValue(null);
      mockPrisma.paymentMethod.count.mockResolvedValue(0);
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma));

      await setupIntentStrategy.handle(mockEvent);

      expect(mockPrisma.paymentMethod.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          stripePaymentMethodId: 'pm_123',
          brand: 'visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2025,
          isDefault: true,
        },
      });
    });

    it('should skip if payment method already exists', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: STRIPE_EVENT_SETUP_INTENT_SUCCEEDED,
        payload: {
          id: 'seti_123',
          customer: 'cus_123',
          payment_method: 'pm_123',
          metadata: { userId: 'user-123' },
        },
      };

      mockPaymentService.getPaymentMethod.mockResolvedValue({
        id: 'pm_123',
        card: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2025 },
      });
      mockPrisma.paymentMethod.findUnique.mockResolvedValue({ id: 'existing-pm' });
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma));

      await setupIntentStrategy.handle(mockEvent);

      expect(mockPrisma.paymentMethod.create).not.toHaveBeenCalled();
    });

    it('should skip if userId missing from metadata', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: STRIPE_EVENT_SETUP_INTENT_SUCCEEDED,
        payload: {
          id: 'seti_123',
          customer: 'cus_123',
          payment_method: 'pm_123',
          metadata: {},
        },
      };

      await setupIntentStrategy.handle(mockEvent);

      expect(mockPaymentService.getPaymentMethod).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('missing userId'));
    });
  });

  describe('PaymentMethodAttachedStrategy', () => {
    it('should support payment_method.attached event', () => {
      expect(attachedStrategy.supports(STRIPE_EVENT_PAYMENT_METHOD_ATTACHED)).toBe(true);
      expect(attachedStrategy.supports('other.event')).toBe(false);
    });

    it('should save payment method on attach', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: STRIPE_EVENT_PAYMENT_METHOD_ATTACHED,
        payload: {
          id: 'pm_123',
          customer: 'cus_123',
          metadata: { userId: 'user-123' },
          card: {
            brand: 'mastercard',
            last4: '5555',
            exp_month: 6,
            exp_year: 2026,
          },
        },
      };

      mockPrisma.paymentMethod.findUnique.mockResolvedValue(null);
      mockPrisma.paymentMethod.count.mockResolvedValue(1);
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma));

      await attachedStrategy.handle(mockEvent);

      expect(mockPrisma.paymentMethod.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          stripePaymentMethodId: 'pm_123',
          brand: 'mastercard',
          last4: '5555',
          expMonth: 6,
          expYear: 2026,
          isDefault: false,
        },
      });
    });

    it('should skip if payment method is not a card', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: STRIPE_EVENT_PAYMENT_METHOD_ATTACHED,
        payload: {
          id: 'pm_123',
          customer: 'cus_123',
          metadata: { userId: 'user-123' },
          type: 'bank_transfer',
        },
      };

      await attachedStrategy.handle(mockEvent);

      expect(mockPrisma.paymentMethod.create).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not a card'));
    });
  });

  describe('PaymentMethodUpdatedStrategy', () => {
    it('should support payment_method.updated event', () => {
      expect(updatedStrategy.supports(STRIPE_EVENT_PAYMENT_METHOD_UPDATED)).toBe(true);
      expect(updatedStrategy.supports('other.event')).toBe(false);
    });

    it('should update payment method details', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: STRIPE_EVENT_PAYMENT_METHOD_UPDATED,
        payload: {
          id: 'pm_123',
          card: {
            brand: 'visa',
            last4: '9999',
            exp_month: 3,
            exp_year: 2027,
          },
        },
      };

      mockPrisma.paymentMethod.findUnique.mockResolvedValue({
        id: 'existing-pm',
        stripePaymentMethodId: 'pm_123',
      });

      await updatedStrategy.handle(mockEvent);

      expect(mockPrisma.paymentMethod.update).toHaveBeenCalledWith({
        where: { stripePaymentMethodId: 'pm_123' },
        data: {
          brand: 'visa',
          last4: '9999',
          expMonth: 3,
          expYear: 2027,
        },
      });
    });

    it('should skip if payment method not found in database', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: STRIPE_EVENT_PAYMENT_METHOD_UPDATED,
        payload: {
          id: 'pm_123',
          card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2025 },
        },
      };

      mockPrisma.paymentMethod.findUnique.mockResolvedValue(null);

      await updatedStrategy.handle(mockEvent);

      expect(mockPrisma.paymentMethod.update).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not found in database'));
    });
  });

  describe('PaymentMethodDetachedStrategy', () => {
    it('should support payment_method.detached event', () => {
      expect(detachedStrategy.supports(STRIPE_EVENT_PAYMENT_METHOD_DETACHED)).toBe(true);
      expect(detachedStrategy.supports('other.event')).toBe(false);
    });

    it('should delete payment method and reassign default', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: STRIPE_EVENT_PAYMENT_METHOD_DETACHED,
        payload: {
          id: 'pm_123',
        },
      };

      mockPrisma.paymentMethod.findUnique.mockResolvedValue({
        id: 'existing-pm',
        stripePaymentMethodId: 'pm_123',
        userId: 'user-123',
        isDefault: true,
      });

      mockPrisma.paymentMethod.findFirst.mockResolvedValue({
        id: 'other-pm',
        stripePaymentMethodId: 'pm_456',
        userId: 'user-123',
      });

      await detachedStrategy.handle(mockEvent);

      expect(mockPrisma.paymentMethod.delete).toHaveBeenCalledWith({
        where: { stripePaymentMethodId: 'pm_123' },
      });

      expect(mockPrisma.paymentMethod.update).toHaveBeenCalledWith({
        where: { id: 'other-pm' },
        data: { isDefault: true },
      });
    });

    it('should delete payment method without reassigning if not default', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: STRIPE_EVENT_PAYMENT_METHOD_DETACHED,
        payload: {
          id: 'pm_123',
        },
      };

      mockPrisma.paymentMethod.findUnique.mockResolvedValue({
        id: 'existing-pm',
        stripePaymentMethodId: 'pm_123',
        userId: 'user-123',
        isDefault: false,
      });

      await detachedStrategy.handle(mockEvent);

      expect(mockPrisma.paymentMethod.delete).toHaveBeenCalledWith({
        where: { stripePaymentMethodId: 'pm_123' },
      });

      expect(mockPrisma.paymentMethod.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.paymentMethod.update).not.toHaveBeenCalled();
    });

    it('should skip if payment method not found in database', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: STRIPE_EVENT_PAYMENT_METHOD_DETACHED,
        payload: {
          id: 'pm_123',
        },
      };

      mockPrisma.paymentMethod.findUnique.mockResolvedValue(null);

      await detachedStrategy.handle(mockEvent);

      expect(mockPrisma.paymentMethod.delete).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not found in database'));
    });
  });
});
