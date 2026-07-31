import { Test, TestingModule } from '@nestjs/testing';
import { WebhookStrategyFactory } from '../../strategies/webhook-strategy.factory';
import { CheckoutSessionCompletedStrategy } from '../../strategies/checkout/checkout-session-completed.strategy';
import { InvoicePaidStrategy } from '../../strategies/invoice/invoice-paid.strategy';
import { InvoicePaymentFailedStrategy } from '../../strategies/invoice/invoice-payment-failed.strategy';
import { CustomerSubscriptionUpdatedStrategy } from '../../strategies/subscription/customer-subscription-updated.strategy';
import { CustomerSubscriptionDeletedStrategy } from '../../strategies/subscription/customer-subscription-deleted.strategy';

describe('WebhookStrategyFactory', () => {
  let factory: WebhookStrategyFactory;
  let strategies: any[];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookStrategyFactory,
        {
          provide: 'WEBHOOK_STRATEGIES',
          useFactory: () => [
            {
              supports: (eventType: string) => eventType === 'checkout.session.completed',
            },
            {
              supports: (eventType: string) => eventType === 'invoice.paid',
            },
            {
              supports: (eventType: string) => eventType === 'invoice.payment_failed',
            },
            {
              supports: (eventType: string) => eventType === 'customer.subscription.updated',
            },
            {
              supports: (eventType: string) => eventType === 'customer.subscription.deleted',
            },
          ],
        },
      ],
    }).compile();

    factory = module.get<WebhookStrategyFactory>(WebhookStrategyFactory);
  });

  it('should be defined', () => {
    expect(factory).toBeDefined();
  });

  describe('getStrategy', () => {
    it('should return strategy for checkout.session.completed', () => {
      const strategy = factory.getStrategy('checkout.session.completed');
      expect(strategy).toBeDefined();
      expect(strategy!.supports('checkout.session.completed')).toBe(true);
    });

    it('should return strategy for invoice.paid', () => {
      const strategy = factory.getStrategy('invoice.paid');
      expect(strategy).toBeDefined();
      expect(strategy!.supports('invoice.paid')).toBe(true);
    });

    it('should return strategy for invoice.payment_failed', () => {
      const strategy = factory.getStrategy('invoice.payment_failed');
      expect(strategy).toBeDefined();
      expect(strategy!.supports('invoice.payment_failed')).toBe(true);
    });

    it('should return strategy for customer.subscription.updated', () => {
      const strategy = factory.getStrategy('customer.subscription.updated');
      expect(strategy).toBeDefined();
      expect(strategy!.supports('customer.subscription.updated')).toBe(true);
    });

    it('should return strategy for customer.subscription.deleted', () => {
      const strategy = factory.getStrategy('customer.subscription.deleted');
      expect(strategy).toBeDefined();
      expect(strategy!.supports('customer.subscription.deleted')).toBe(true);
    });

    it('should return null for unsupported event type', () => {
      const strategy = factory.getStrategy('unsupported.event');
      expect(strategy).toBeNull();
    });
  });

  describe('duplicate validation', () => {
    it('should throw error when duplicate strategies are registered', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            WebhookStrategyFactory,
            {
              provide: 'WEBHOOK_STRATEGIES',
              useFactory: () => [
                {
                  supports: (eventType: string) => eventType === 'invoice.paid',
                },
                {
                  supports: (eventType: string) => eventType === 'invoice.paid',
                },
              ],
            },
          ],
        }).compile()
      ).rejects.toThrow();
    });
  });
});
