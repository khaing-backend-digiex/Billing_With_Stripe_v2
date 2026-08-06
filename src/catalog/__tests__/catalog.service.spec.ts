import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from '@/catalog/catalog.service';
import { ExchangeRateService } from '@/catalog/exchange-rate.service';
import { PaymentService } from '@/billing/payment.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AppLogger } from '@/logger/app-logger';
import { PlanType } from '../../../generated/prisma/client';

describe('CatalogService', () => {
  let service: CatalogService;

  const mockPrisma = {
    stripeProduct: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    stripePrice: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockPaymentService = {
    createProduct: jest.fn(),
    createPrice: jest.fn(),
    updateProduct: jest.fn(),
  };

  const mockExchangeRateService = {
    getExchangeRate: jest.fn(),
    getCachedRates: jest.fn(),
    baseCurrency: 'VND',
    supportedCurrencies: ['USD', 'EUR', 'GBP'],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: ExchangeRateService, useValue: mockExchangeRateService },
        { provide: AppLogger, useValue: { error: jest.fn(), warn: jest.fn(), log: jest.fn(), setContext: jest.fn() } },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
    jest.clearAllMocks();
  });

  describe('createProduct', () => {
    it('should create product with multi-currency prices', async () => {
      mockPaymentService.createProduct.mockResolvedValue({ id: 'prod_stripe_1' });
      mockPaymentService.createPrice.mockImplementation((_, amount, currency) =>
        Promise.resolve({ id: `price_${currency}` }),
      );
      mockExchangeRateService.getExchangeRate.mockImplementation((currency) => {
        const rates: Record<string, number> = { USD: 0.00004, EUR: 0.000036, GBP: 0.000032 };
        return Promise.resolve(rates[currency]);
      });

      mockPrisma.stripeProduct.create.mockResolvedValue({ id: 'prod_1' });

      await service.createProduct({
        name: 'Premium Plan',
        planType: PlanType.PRO_MONTHLY,
        basePrice: 500000,
        interval: 'month'
      });

      expect(mockPaymentService.createProduct).toHaveBeenCalledWith('Premium Plan', {
        planType: PlanType.PRO_MONTHLY,
      });

      expect(mockPaymentService.createPrice).toHaveBeenCalledTimes(4);
      expect(mockPaymentService.createPrice).toHaveBeenCalledWith('prod_stripe_1', 500000, 'VND', 'month');
      expect(mockPaymentService.createPrice).toHaveBeenCalledWith('prod_stripe_1', 20, 'USD', 'month');
      expect(mockPaymentService.createPrice).toHaveBeenCalledWith('prod_stripe_1', 18, 'EUR', 'month');
      expect(mockPaymentService.createPrice).toHaveBeenCalledWith('prod_stripe_1', 16, 'GBP', 'month');
    });
  });

  describe('refreshPrices', () => {
    it('should update prices based on new exchange rates', async () => {
      const mockProduct = {
        id: 'prod_1',
        stripeProductId: 'prod_stripe_1',
        prices: [
          { currency: 'VND', amount: 500000, interval: 'month' },
        ],
      };
      mockPrisma.stripeProduct.findUnique.mockResolvedValue(mockProduct);
      
      mockExchangeRateService.getExchangeRate.mockImplementation(async (currency) => {
        if (currency === 'USD') return 0.005;
        if (currency === 'EUR') return 0.004;
        if (currency === 'GBP') return 0.003;
        return 1;
      });

      mockPaymentService.createPrice.mockResolvedValue({ id: 'price_usd_new' });
      mockPrisma.stripePrice.create.mockResolvedValue({ id: 'price_new_db' });

      await service.refreshPrices('prod_1');

      expect(mockPaymentService.createPrice).toHaveBeenCalledWith('prod_stripe_1', 2500, 'USD', 'month');
      expect(mockPrisma.stripePrice.updateMany).toHaveBeenCalledWith({
        where: { productId: 'prod_1' },
        data: { isActive: false },
      });
    });
  });

  describe('findAllProducts', () => {
    it('should return all products with prices', async () => {
      const mockProducts = [{ id: '1', name: 'Pro', prices: [] }];
      mockPrisma.stripeProduct.findMany.mockResolvedValue(mockProducts);
      mockPrisma.stripeProduct.count.mockResolvedValue(1);

      const result = await service.findAllProducts({});

      expect(result).toEqual({
        data: mockProducts,
        total: 1,
        page: 1,
        limit: 20,
      });
    });
  });

  describe('findProductById', () => {
    it('should throw ServiceError if product not found', async () => {
      mockPrisma.stripeProduct.findUnique.mockResolvedValue(null);

      await expect(service.findProductById('nonexistent')).rejects.toThrow(
        'Product nonexistent not found',
      );
    });
  });

  describe('updateProduct', () => {
    it('should update product name', async () => {
      mockPrisma.stripeProduct.findUnique.mockResolvedValue({ id: '1', stripeProductId: 'prod_1' });
      mockPrisma.stripeProduct.update.mockResolvedValue({
        id: '1',
        name: 'New',
        prices: [],
      });

      const result = await service.updateProduct('1', { name: 'New' });

      expect(mockPaymentService.updateProduct).toHaveBeenCalledWith('prod_1', { name: 'New', active: undefined });
      expect(result.name).toBe('New');
    });
  });

  describe('getExchangeRates', () => {
    it('should return cached exchange rates', async () => {
      const mockRates = [{ targetCurrency: 'USD', rate: 0.00004, updatedAt: new Date() }];
      mockExchangeRateService.getCachedRates.mockResolvedValue(mockRates);

      const result = await service.getExchangeRates();

      expect(result).toEqual(mockRates);
    });
  });
});
