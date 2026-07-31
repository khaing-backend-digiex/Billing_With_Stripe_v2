import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExchangeRateService } from '../exchange-rate.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;
  let prisma: PrismaService;
  let configService: ConfigService;

  const mockPrisma = {
    exchangeRate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'EXCHANGE_RATE_API_KEY') return 'test-api-key';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRateService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ExchangeRateService>(ExchangeRateService);
    prisma = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
    jest.clearAllMocks();
  });

  describe('getExchangeRate', () => {
    it('should fetch rate from API and cache it', async () => {
      const mockResponse = {
        result: 'success',
        base_code: 'VND',
        target_code: 'USD',
        conversion_rate: 0.000039,
        time_last_update_utc: '2024-01-01T00:00:00Z',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      mockPrisma.exchangeRate.upsert.mockResolvedValue({
        baseCurrency: 'VND',
        targetCurrency: 'USD',
        rate: 0.000039,
        updatedAt: new Date(),
      });

      const result = await service.getExchangeRate('USD');

      expect(result).toBe(0.000039);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://v6.exchangerate-api.com/v6/test-api-key/pair/VND/USD'
      );
      expect(mockPrisma.exchangeRate.upsert).toHaveBeenCalled();
    });

    it('should throw error for unsupported currency', async () => {
      await expect(service.getExchangeRate('JPY')).rejects.toThrow(
        'Unsupported currency: JPY'
      );
    });

    it('should use cached rate when API fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('API Error'));

      mockPrisma.exchangeRate.findUnique.mockResolvedValue({
        baseCurrency: 'VND',
        targetCurrency: 'USD',
        rate: 0.000039,
        updatedAt: new Date(),
      });

      const result = await service.getExchangeRate('USD');

      expect(result).toBe(0.000039);
      expect(mockPrisma.exchangeRate.findUnique).toHaveBeenCalled();
    });

    it('should throw ServiceUnavailableException when API fails and no cache exists', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('API Error'));

      mockPrisma.exchangeRate.findUnique.mockResolvedValue(null);

      await expect(service.getExchangeRate('USD')).rejects.toThrow(
        ServiceUnavailableException
      );
    });

    it('should warn about stale cache but still use it', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('API Error'));

      const staleDate = new Date();
      staleDate.setHours(staleDate.getHours() - 25);

      mockPrisma.exchangeRate.findUnique.mockResolvedValue({
        baseCurrency: 'VND',
        targetCurrency: 'USD',
        rate: 0.000039,
        updatedAt: staleDate,
      });

      const consoleSpy = jest.spyOn(service['logger'], 'error');

      const result = await service.getExchangeRate('USD');

      expect(result).toBe(0.000039);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('stale')
      );
    });
  });

  describe('getAllExchangeRates', () => {
    it('should fetch all supported currencies', async () => {
      const mockResponse = {
        result: 'success',
        base_code: 'VND',
        target_code: 'USD',
        conversion_rate: 0.000039,
        time_last_update_utc: '2024-01-01T00:00:00Z',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      mockPrisma.exchangeRate.upsert.mockResolvedValue({});

      const result = await service.getAllExchangeRates();

      expect(result).toHaveProperty('USD');
      expect(result).toHaveProperty('EUR');
      expect(result).toHaveProperty('GBP');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw ServiceUnavailableException if any currency fails and no cache', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('API Error'));

      mockPrisma.exchangeRate.findUnique.mockResolvedValue(null);

      await expect(service.getAllExchangeRates()).rejects.toThrow(
        ServiceUnavailableException
      );
    });
  });

  describe('getCachedRates', () => {
    it('should return all cached rates', async () => {
      const mockRates = [
        {
          targetCurrency: 'USD',
          rate: 0.000039,
          updatedAt: new Date(),
        },
        {
          targetCurrency: 'EUR',
          rate: 0.000036,
          updatedAt: new Date(),
        },
      ];

      mockPrisma.exchangeRate.findMany.mockResolvedValue(mockRates);

      const result = await service.getCachedRates();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('targetCurrency', 'USD');
      expect(result[0]).toHaveProperty('rate', 0.000039);
      expect(mockPrisma.exchangeRate.findMany).toHaveBeenCalledWith({
        where: { baseCurrency: 'VND' },
      });
    });

    it('should return empty array when no cached rates exist', async () => {
      mockPrisma.exchangeRate.findMany.mockResolvedValue([]);

      const result = await service.getCachedRates();

      expect(result).toEqual([]);
    });
  });
});
