require('dotenv').config();
const { PrismaClient } = require('../generated/prisma');
const Stripe = require('stripe');

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-01-27.acacia',
});

const CATALOG = [
  {
    name: 'Pro Plan (Monthly)',
    planType: 'PRO_MONTHLY',
    amount: 1500, // $15.00
    currency: 'usd',
    interval: 'month',
  },
  {
    name: 'Pro Plan (Annual)',
    planType: 'PRO_ANNUAL',
    amount: 15000, // $150.00
    currency: 'usd',
    interval: 'year',
  },
  {
    name: 'Credit Pack (Addon)',
    planType: 'ADDON',
    amount: 500, // $5.00
    currency: 'usd',
    interval: null, // one-time
  },
];

async function main() {
  console.log('🚀 Bắt đầu quá trình đồng bộ Catalog lên Stripe và Neon Database...');

  for (const item of CATALOG) {
    console.log(`\n⏳ Đang xử lý: ${item.name}...`);

    // 1. Tạo Product trên Stripe
    const stripeProduct = await stripe.products.create({
      name: item.name,
      metadata: {
        planType: item.planType,
      },
    });
    console.log(`  ✅ Đã tạo Stripe Product: ${stripeProduct.id}`);

    // 2. Tạo Price trên Stripe
    const priceConfig = {
      product: stripeProduct.id,
      unit_amount: item.amount,
      currency: item.currency,
    };
    if (item.interval) {
      priceConfig.recurring = { interval: item.interval };
    }
    const stripePrice = await stripe.prices.create(priceConfig);
    console.log(`  ✅ Đã tạo Stripe Price: ${stripePrice.id}`);

    // 3. Lưu vào Neon Database thông qua Prisma
    await prisma.stripeProduct.create({
      data: {
        stripeProductId: stripeProduct.id,
        name: item.name,
        planType: item.planType,
        isActive: true,
        prices: {
          create: {
            stripePriceId: stripePrice.id,
            currency: item.currency,
            amount: item.amount,
            interval: item.interval || null,
            isActive: true,
          },
        },
      },
    });
    console.log(`  ✅ Đã lưu đồng bộ vào Neon Database!`);
  }

  console.log('\n🎉 Hoàn tất! Tất cả các gói (Packages) đã sẵn sàng để mua và test webhook.');
}

main()
  .catch((e) => {
    console.error('❌ Có lỗi xảy ra:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
