import { PrismaClient } from '../../generated/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import Stripe from 'stripe';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2025-01-27.acacia' as any,
});

const BASE_CURRENCY = 'usd';
const SUPPORTED_CURRENCIES = (process.env.SUPPORTED_CURRENCIES || 'VND,USD,EUR,GBP')
  .split(',')
  .map((c) => c.trim().toLowerCase());
const ZERO_DECIMAL_CURRENCIES = ['vnd', 'jpy', 'krw'];

// Base catalog prices in USD (cents)
const CATALOG = [
  {
    name: 'Free Plan',
    planType: 'FREE' as const,
    amountInUsd: 0, // $0.00
    interval: 'month' as const,
  },
  {
    name: 'Pro Plan (Monthly)',
    planType: 'PRO_MONTHLY' as const,
    amountInUsd: 1500, // $15.00
    interval: 'month' as const,
  },
  {
    name: 'Pro Plan (Annual)',
    planType: 'PRO_ANNUAL' as const,
    amountInUsd: 15000, // $150.00
    interval: 'year' as const,
  },
  {
    name: 'Credit Pack (Addon)',
    planType: 'ADDON' as const,
    amountInUsd: 500, // $5.00
    interval: null, // one-time
  },
];

async function fetchExchangeRates(base: string): Promise<Record<string, number>> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ Không tìm thấy EXCHANGE_RATE_API_KEY, sử dụng tỷ giá giả định.');
    return { usd: 1, vnd: 25000, eur: 0.92, gbp: 0.79 };
  }

  try {
    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${base.toUpperCase()}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.result === 'success') {
      const rates: Record<string, number> = {};
      for (const cur of SUPPORTED_CURRENCIES) {
        rates[cur] = data.conversion_rates[cur.toUpperCase()] || 1;
      }
      return rates;
    }
  } catch (error) {
    console.error('❌ Lỗi khi lấy tỷ giá thực, sử dụng tỷ giá giả định.', error);
  }

  return { usd: 1, vnd: 25000, eur: 0.92, gbp: 0.79 };
}

async function main() {
  console.log('🚀 Bắt đầu quá trình đồng bộ Catalog và Tỷ giá Đa tiền tệ...');

  // 1. Seed Tỷ giá (ExchangeRate)
  console.log(`\n⏳ Đang lấy tỷ giá với Base = ${BASE_CURRENCY.toUpperCase()}...`);
  const rates = await fetchExchangeRates(BASE_CURRENCY);

  for (const currency of SUPPORTED_CURRENCIES) {
    if (currency === BASE_CURRENCY) continue;

    await prisma.exchangeRate.upsert({
      where: {
        baseCurrency_targetCurrency: {
          baseCurrency: BASE_CURRENCY.toUpperCase(),
          targetCurrency: currency.toUpperCase(),
        },
      },
      update: {
        rate: rates[currency],
      },
      create: {
        baseCurrency: BASE_CURRENCY.toUpperCase(),
        targetCurrency: currency.toUpperCase(),
        rate: rates[currency],
      },
    });
    console.log(
      `  ✅ Đã lưu tỷ giá: 1 ${BASE_CURRENCY.toUpperCase()} = ${rates[currency]} ${currency.toUpperCase()}`
    );
  }

  // 2. Tạo Products và Prices đa tiền tệ
  for (const item of CATALOG) {
    console.log(`\n⏳ Đang xử lý Product: ${item.name}...`);

    // Tạo Product trên Stripe
    const stripeProduct = await stripe.products.create({
      name: item.name,
      metadata: { planType: item.planType },
    });
    console.log(`  ✅ Đã tạo Stripe Product: ${stripeProduct.id}`);

    // Lưu Product vào DB
    const dbProduct = await prisma.stripeProduct.create({
      data: {
        stripeProductId: stripeProduct.id,
        name: item.name,
        planType: item.planType,
        isActive: true,
      },
    });

    // Tạo Prices cho từng loại tiền tệ
    for (const currency of SUPPORTED_CURRENCIES) {
      const rate = rates[currency] || 1;
      const realUsd = item.amountInUsd / 100;
      const rawLocalAmount = realUsd * rate;

      const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.includes(currency);
      const convertedAmount = isZeroDecimal
        ? Math.round(rawLocalAmount)
        : Math.round(rawLocalAmount * 100);

      const priceConfig: any = {
        product: stripeProduct.id,
        unit_amount: convertedAmount,
        currency: currency,
      };
      if (item.interval) {
        priceConfig.recurring = { interval: item.interval };
      }

      const stripePrice = await stripe.prices.create(priceConfig);
      console.log(
        `  ✅ Đã tạo Stripe Price (${currency.toUpperCase()} - ${convertedAmount}): ${
          stripePrice.id
        }`
      );

      // Lưu Price vào DB
      await prisma.stripePrice.create({
        data: {
          stripePriceId: stripePrice.id,
          productId: dbProduct.id,
          currency: currency.toUpperCase(),
          amount: convertedAmount,
          interval: item.interval || null,
          isActive: true,
        },
      });
    }
    console.log(`  ✅ Đã lưu ${item.name} với toàn bộ Prices vào Neon Database!`);
  }

  console.log('\n🎉 Hoàn tất! Đã seed Tỷ giá và Catalog Đa tiền tệ thành công.');
}

main()
  .catch((e) => {
    console.error('❌ Có lỗi xảy ra:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
