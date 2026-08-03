import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ErrorCode } from '../common/enums/error-code.enum';
import { ServiceError } from '../common/exceptions/service-error.exception';
import { AppLogger } from '../logger/app-logger';

interface ExchangeRateResponse {
  result: string;
  base_code: string;
  target_code: string;
  conversion_rate: number;
  time_last_update_utc: string;
}

@Injectable()
export class ExchangeRateService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://v6.exchangerate-api.com/v6';
  private readonly supportedCurrencies = ['USD', 'EUR', 'GBP'];
  private readonly baseCurrency = 'VND';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    const apiKey = this.configService.get<string>('EXCHANGE_RATE_API_KEY');
    if (!apiKey) {
      throw new Error('EXCHANGE_RATE_API_KEY is not defined');
    }
    this.apiKey = apiKey;
    this.logger.setContext('ExchangeRateService');
  }

  async getExchangeRate(targetCurrency: string): Promise<number> {
    if (!this.supportedCurrencies.includes(targetCurrency)) {
      throw new Error(`Unsupported currency: ${targetCurrency}`);
    }

    try {
      const rate = await this.fetchFromApi(targetCurrency);
      await this.cacheRate(targetCurrency, rate);
      return rate;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to fetch exchange rate from API, using cached rate: ${errorMessage}`);
      return this.getCachedRate(targetCurrency);
    }
  }

  async getAllExchangeRates(): Promise<Record<string, number>> {
    const rates: Record<string, number> = {};

    for (const currency of this.supportedCurrencies) {
      try {
        rates[currency] = await this.getExchangeRate(currency);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to get rate for ${currency}: ${errorMessage}`);
        throw new ServiceError(ErrorCode.EXCHANGE_RATE_UNAVAILABLE, 'Exchange rate service temporarily unavailable');
      }
    }

    return rates;
  }

  async getCachedRates(): Promise<Array<{ targetCurrency: string; rate: number; updatedAt: Date }>> {
    const cachedRates = await this.prisma.exchangeRate.findMany({
      where: { baseCurrency: this.baseCurrency },
    });

    return cachedRates.map((rate) => ({
      targetCurrency: rate.targetCurrency,
      rate: Number(rate.rate),
      updatedAt: rate.updatedAt,
    }));
  }

  private async fetchFromApi(targetCurrency: string): Promise<number> {
    const url = `${this.baseUrl}/${this.apiKey}/pair/${this.baseCurrency}/${targetCurrency}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`ExchangeRate-API returned ${response.status}`);
    }

    const data: ExchangeRateResponse = await response.json();
    
    if (data.result !== 'success') {
      throw new Error(`ExchangeRate-API error: ${data.result}`);
    }

    return data.conversion_rate;
  }

  private async cacheRate(targetCurrency: string, rate: number): Promise<void> {
    await this.prisma.exchangeRate.upsert({
      where: {
        baseCurrency_targetCurrency: {
          baseCurrency: this.baseCurrency,
          targetCurrency,
        },
      },
      update: {
        rate,
        updatedAt: new Date(),
      },
      create: {
        baseCurrency: this.baseCurrency,
        targetCurrency,
        rate,
      },
    });
  }

  private async getCachedRate(targetCurrency: string): Promise<number> {
    const cached = await this.prisma.exchangeRate.findUnique({
      where: {
        baseCurrency_targetCurrency: {
          baseCurrency: this.baseCurrency,
          targetCurrency,
        },
      },
    });

    if (!cached) {
      throw new ServiceError(ErrorCode.EXCHANGE_RATE_UNAVAILABLE, 'No cached exchange rate available');
    }

    const hoursSinceUpdate = (Date.now() - cached.updatedAt.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceUpdate > 24) {
      this.logger.error(`Cached rate for ${targetCurrency} is stale (${hoursSinceUpdate.toFixed(1)} hours old)`);
    }

    return Number(cached.rate);
  }
}
