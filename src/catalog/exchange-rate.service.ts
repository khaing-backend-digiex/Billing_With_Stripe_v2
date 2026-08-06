import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { ErrorCode } from '@/common/enums/error-code.enum';
import { ServiceError } from '@/common/exceptions/service-error.exception';
import { AppLogger } from '@/logger/app-logger';
import { EXCHANGE_RATE_API_BASE_URL, EXCHANGE_RATE_STALE_HOURS, MS_PER_HOUR } from '@/common/constants/exchange-rate.constants';
import { ENV_EXCHANGE_RATE_API_KEY } from '@/common/constants/env.constants';
import { ERROR_EXCHANGE_RATE_API_KEY_NOT_DEFINED } from '@/common/constants/error-messages.constants';
import { CURRENCY_USD, CURRENCY_EUR, CURRENCY_GBP, CURRENCY_VND } from '@/common/constants/currency.constants';

interface ExchangeRateResponse {
  result: string;
  documentation: string;
  terms_of_use: string;
  time_last_update_unix: number;
  time_last_update_utc: string;
  time_next_update_unix: number;
  time_next_update_utc: string;
  base_code: string;
  conversion_rates: Record<string, number>;
}

@Injectable()
export class ExchangeRateService {
  private readonly apiKey: string;
  private readonly baseUrl = EXCHANGE_RATE_API_BASE_URL;
  public readonly supportedCurrencies = [CURRENCY_USD, CURRENCY_EUR, CURRENCY_GBP];
  public readonly baseCurrency = CURRENCY_VND;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    const apiKey = this.configService.get<string>(ENV_EXCHANGE_RATE_API_KEY);
    if (!apiKey) {
      throw new Error(ERROR_EXCHANGE_RATE_API_KEY_NOT_DEFINED);
    }
    this.apiKey = apiKey;
    this.logger.setContext('ExchangeRateService');
  }

  async syncExchangeRates(): Promise<void> {
    try {
      this.logger.log(`Syncing exchange rates for base currency: ${this.baseCurrency}`);
      const rates = await this.fetchAllRatesFromApi();
      await this.cacheRates(rates);
      this.logger.log('Successfully synced exchange rates from API.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to sync exchange rates: ${errorMessage}`);
      throw new ServiceError(ErrorCode.EXCHANGE_RATE_UNAVAILABLE, 'Could not sync rates from API');
    }
  }

  async getExchangeRate(targetCurrency: string): Promise<number> {
    if (!this.supportedCurrencies.includes(targetCurrency)) {
      throw new Error(`Unsupported currency: ${targetCurrency}`);
    }

    const cached = await this.prisma.exchangeRate.findUnique({
      where: {
        baseCurrency_targetCurrency: {
          baseCurrency: this.baseCurrency,
          targetCurrency,
        },
      },
    });

    const isStale = !cached || (Date.now() - cached.updatedAt.getTime()) / MS_PER_HOUR > EXCHANGE_RATE_STALE_HOURS;

    if (isStale) {
      try {
        await this.syncExchangeRates();
        const updated = await this.prisma.exchangeRate.findUnique({
          where: {
            baseCurrency_targetCurrency: {
              baseCurrency: this.baseCurrency,
              targetCurrency,
            },
          },
        });
        if (updated) return Number(updated.rate);
      } catch (error) {
        this.logger.warn(`Using stale cached rate for ${targetCurrency} due to API error.`);
      }
    }

    if (!cached) {
      throw new ServiceError(ErrorCode.EXCHANGE_RATE_UNAVAILABLE, 'No cached exchange rate available');
    }

    return Number(cached.rate);
  }

  async getAllExchangeRates(): Promise<Record<string, number>> {
    // Calling getExchangeRate for the first supported currency will trigger a sync if stale
    if (this.supportedCurrencies.length > 0) {
      await this.getExchangeRate(this.supportedCurrencies[0]);
    }

    const cachedRates = await this.prisma.exchangeRate.findMany({
      where: { baseCurrency: this.baseCurrency, targetCurrency: { in: this.supportedCurrencies } },
    });

    const rates: Record<string, number> = {};
    for (const rate of cachedRates) {
      rates[rate.targetCurrency] = Number(rate.rate);
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

  private async fetchAllRatesFromApi(): Promise<Record<string, number>> {
    const url = `${this.baseUrl}/${this.apiKey}/latest/${this.baseCurrency}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`ExchangeRate-API returned ${response.status}`);
    }

    const data: ExchangeRateResponse = await response.json();
    
    if (data.result !== 'success') {
      throw new Error(`ExchangeRate-API error: ${data.result}`);
    }

    return data.conversion_rates;
  }

  private async cacheRates(rates: Record<string, number>): Promise<void> {
    const operations = this.supportedCurrencies.map((currency) => {
      const rate = rates[currency];
      if (rate === undefined) return null;
      
      return this.prisma.exchangeRate.upsert({
        where: {
          baseCurrency_targetCurrency: {
            baseCurrency: this.baseCurrency,
            targetCurrency: currency,
          },
        },
        update: {
          rate,
          updatedAt: new Date(),
        },
        create: {
          baseCurrency: this.baseCurrency,
          targetCurrency: currency,
          rate,
        },
      });
    }).filter((op) => op !== null);

    if (operations.length > 0) {
      await this.prisma.$transaction(operations);
    }
  }
}
