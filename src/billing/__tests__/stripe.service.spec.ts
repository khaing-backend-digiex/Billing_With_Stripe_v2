import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeAdapter } from '@/billing/payments/adapters/stripe.adapter';
import { AppLogger } from '@/logger/app-logger';
import Stripe from 'stripe';

jest.mock('stripe');

describe('StripeAdapter', () => {
  let service: StripeAdapter;
  let stripeMock: jest.Mocked<Stripe>;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'STRIPE_SECRET_KEY') return 'sk_test_mock_key';
      if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_test_mock_secret';
      return undefined;
    }),
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
      providers: [
        StripeAdapter,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AppLogger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<StripeAdapter>(StripeAdapter);
    stripeMock = service['stripe'] as jest.Mocked<Stripe>;

    // Initialize nested mock objects
    stripeMock.products = {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
    } as any;
    stripeMock.prices = {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
      list: jest.fn(),
    } as any;
    stripeMock.customers = {
      create: jest.fn(),
    } as any;
    stripeMock.subscriptions = {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
    } as any;
    stripeMock.checkout = {
      sessions: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    } as any;
    stripeMock.webhooks = {
      constructEvent: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createProduct', () => {
    it('should create a product', async () => {
      const mockProduct = { id: 'prod_123', name: 'Test Product' } as Stripe.Product;
      stripeMock.products.create = jest.fn().mockResolvedValue(mockProduct);

      const result = await service.createProduct('Test Product', { key: 'value' });

      expect(result).toEqual(mockProduct);
      expect(stripeMock.products.create).toHaveBeenCalledWith({
        name: 'Test Product',
        metadata: { key: 'value' },
      });
    });
  });

  describe('createPrice', () => {
    it('should create a recurring price', async () => {
      const mockPrice = { id: 'price_123', product: 'prod_123', unit_amount: 1000, currency: 'usd', active: true } as Stripe.Price;
      stripeMock.prices.create = jest.fn().mockResolvedValue(mockPrice);

      const result = await service.createPrice('prod_123', 1000, 'usd', 'month');

      expect(result.id).toEqual(mockPrice.id);
      expect(stripeMock.prices.create).toHaveBeenCalledWith({
        product: 'prod_123',
        unit_amount: 1000,
        currency: 'usd',
        recurring: { interval: 'month' },
      });
    });

    it('should create a one-time price', async () => {
      const mockPrice = { id: 'price_123', product: 'prod_123', unit_amount: 1500, currency: 'usd', active: true } as Stripe.Price;
      stripeMock.prices.create = jest.fn().mockResolvedValue(mockPrice);

      const result = await service.createPrice('prod_123', 1500, 'usd');

      expect(result.id).toEqual(mockPrice.id);
      expect(stripeMock.prices.create).toHaveBeenCalledWith({
        product: 'prod_123',
        unit_amount: 1500,
        currency: 'usd',
      });
    });
  });

  describe('createCheckoutSession', () => {
    it('should create a subscription checkout session', async () => {
      const mockSession = { id: 'cs_123', url: 'https://checkout.stripe.com/test' } as Stripe.Checkout.Session;
      stripeMock.checkout.sessions.create = jest.fn().mockResolvedValue(mockSession);

      const result = await service.createCheckoutSession({
        priceId: 'price_123',
        customerId: 'cus_123',
        mode: 'subscription',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        metadata: { userId: 'user_123' },
      });

      expect(result).toEqual(mockSession);
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith({
        payment_method_types: ['card'],
        line_items: [{ price: 'price_123', quantity: 1 }],
        mode: 'subscription',
        customer: 'cus_123',
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
        metadata: { userId: 'user_123' },
      });
    });
  });

  describe('createCustomer', () => {
    it('should create a customer', async () => {
      const mockCustomer = { id: 'cus_123', email: 'test@example.com' } as Stripe.Customer;
      stripeMock.customers.create = jest.fn().mockResolvedValue(mockCustomer);

      const result = await service.createCustomer('test@example.com', 'Test User', { userId: 'user_123' });

      expect(result).toEqual(mockCustomer);
      expect(stripeMock.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User',
        metadata: { userId: 'user_123' },
      });
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription', async () => {
      const mockSubscription = { 
        id: 'sub_123', 
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ id: 'si_123', price: 'price_123', current_period_start: 0, current_period_end: 0 }] }
      } as unknown as Stripe.Subscription;
      stripeMock.subscriptions.create = jest.fn().mockResolvedValue(mockSubscription);

      const result = await service.createSubscription(
        'cus_123',
        'price_123',
        { userId: 'user_123' }
      );

      expect(result.id).toEqual(mockSubscription.id);
      expect(stripeMock.subscriptions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        items: [{ price: 'price_123' }],
        metadata: { userId: 'user_123' },
      });
    });
  });

  describe('updateSubscription', () => {
    it('should update subscription with proration', async () => {
      const mockSubscription = {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ id: 'si_123', price: 'price_123', current_period_start: 0, current_period_end: 0 }] },
      } as unknown as Stripe.Subscription;

      const mockUpdatedSubscription = { 
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ id: 'si_123', price: 'price_456', current_period_start: 0, current_period_end: 0 }] }
      } as unknown as Stripe.Subscription;

      stripeMock.subscriptions.retrieve = jest.fn().mockResolvedValue(mockSubscription);
      stripeMock.subscriptions.update = jest.fn().mockResolvedValue(mockUpdatedSubscription);

      const result = await service.updateSubscription('sub_123', {
        newPriceId: 'price_456',
        prorationBehavior: 'create_prorations',
      });

      expect(result.id).toEqual(mockUpdatedSubscription.id);
      expect(stripeMock.subscriptions.update).toHaveBeenCalledWith('sub_123', {
        items: [{ id: 'si_123', price: 'price_456' }],
        proration_behavior: 'create_prorations',
      });
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel a subscription', async () => {
      const mockSubscription = { 
        id: 'sub_123', 
        customer: 'cus_123',
        status: 'canceled',
        items: { data: [{ id: 'si_123', price: 'price_123', current_period_start: 0, current_period_end: 0 }] }
      } as unknown as Stripe.Subscription;
      stripeMock.subscriptions.cancel = jest.fn().mockResolvedValue(mockSubscription);

      const result = await service.cancelSubscriptionNow('sub_123');

      expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith('sub_123');
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify webhook signature', () => {
      const mockEvent = { id: 'evt_123', type: 'checkout.session.completed', data: { object: {} } } as Stripe.Event;
      stripeMock.webhooks.constructEvent = jest.fn().mockReturnValue(mockEvent);

      const result = service.constructWebhookEvent('payload', 'signature');

      expect(result.id).toEqual(mockEvent.id);
      expect(stripeMock.webhooks.constructEvent).toHaveBeenCalledWith(
        'payload',
        'signature',
        'whsec_test_mock_secret'
      );
    });
  });

  describe('listPrices', () => {
    it('should list active prices for a product', async () => {
      const mockPrices = {
        data: [
          { id: 'price_123', product: 'prod_123', active: true },
          { id: 'price_456', product: 'prod_123', active: true },
        ],
      } as unknown as Stripe.ApiList<Stripe.Price>;

      stripeMock.prices.list = jest.fn().mockResolvedValue(mockPrices);

      const result = await service.listPrices('prod_123');

      expect(result.length).toEqual(mockPrices.data.length);
      expect(result[0].id).toEqual('price_123');
      expect(stripeMock.prices.list).toHaveBeenCalledWith({
        product: 'prod_123',
        active: true,
      });
    });
  });
});
