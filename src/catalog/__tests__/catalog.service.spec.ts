import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from '../catalog.service';
import { ExchangeRateService } from '../exchange-rate.service';
import { StripeService } from '../../billing/stripe.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../logger/app-logger';
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

  const mockStripeService = {
    createProduct: jest.fn(),
    createPrice: jest.fn(),
    updateProduct: jest.fn(),
  };

  const mockExchangeRateService = {
    getExchangeRate: jest.fn(),
    getCachedRates: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StripeService, useValue: mockStripeService },
        { provide: ExchangeRateService, useValue: mockExchangeRateService },
        { provide: AppLogger, useValue: { error: jest.fn(), warn: jest.fn(), log: jest.fn() } },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
    jest.clearAllMocks();
  });

  describe('createProduct', () => {
    it('should create product with multi-currency prices', async () => {
      mockStripeService.createProduct.mockResolvedValue({ id: 'prod_stripe_1' });
      mockStripeService.createPrice.mockImplementation((_, amount, currency) =>
        Promise.resolve({ id: `price_${currency}` }),
      );
      mockExchangeRateService.getExchangeRate.mockImplementation((currency) => {
        const rates: Record<string, number> = { USD: 0.00004, EUR: 0.000036, GBP: 0.000032 };
        return Promise.resolve(rates[currency]);
      });
      mockPrisma.stripeProduct.create.mockResolvedValue({
        id: 'db-prod-1',
        stripeProductId: 'prod_stripe_1',
        name: 'Pro Monthly',
        planType: PlanType.PRO_MONTHLY,
      });
      mockPrisma.stripePrice.create.mockImplementation((args) =>
        Promise.resolve({ id: `db-price-${args.data.currency}`, ...args.data }),
      );

      const result = await service.createProduct({
        name: 'Pro Monthly',
        basePrice: 300000,
        planType: PlanType.PRO_MONTHLY,
        interval: 'month',
      });

      expect(result.prices).toHaveLength(4);
      expect(mockStripeService.createPrice).toHaveBeenCalledTimes(4);
      expect(mockExchangeRateService.getExchangeRate).toHaveBeenCalledTimes(3);
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
        __paginated: true,
      });
    });
  });

  describe('findProductById', () => {
    it('should throw NotFoundException if product not found', async () => {
      mockPrisma.stripeProduct.findUnique.mockResolvedValue(null);

      await expect(service.findProductById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProduct', () => {
    it('should update product name and sync to Stripe', async () => {
      mockPrisma.stripeProduct.findUnique.mockResolvedValue({
        id: '1',
        stripeProductId: 'prod_1',
        name: 'Old',
      });
      mockPrisma.stripeProduct.update.mockResolvedValue({
        id: '1',
        name: 'New',
        prices: [],
      });

      const result = await service.updateProduct('1', { name: 'New' });

      expect(mockStripeService.updateProduct).toHaveBeenCalledWith('prod_1', { name: 'New', active: undefined });
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
