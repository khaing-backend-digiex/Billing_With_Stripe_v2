## Why

The AI platform needs a billing service to manage subscriptions and credit-based usage. Users currently have no way to subscribe, purchase credits, or be billed. This change introduces Stripe-backed subscription plans (Free/Pro), credit management, and add-on purchases with multi-currency support via live exchange rates.

## What Changes

- **New subscription system**: Free (50 credits/mo, no payment) and Pro (100 credits/mo, paid) plans with monthly and annual billing cycles.
- **Credit consumption API**: Plan credits consumed first, addon credits as fallback. Credits consumed via API call.
- **Add-on credit kits**: One-time purchases (15 credits per kit at 100,000 VND base). Only available to Pro users. Addon credits freeze when Pro expires.
- **Multi-currency support**: Products priced in VND base, converted to USD/EUR/GBP on-demand using ExchangeRate-API. Client passes currency at checkout.
- **Stripe catalog management API**: Admin-only endpoints to CRUD Stripe products and prices programmatically (not hardcoded IDs).
- **Webhook handling**: Stripe webhooks for checkout completion, invoice payment, subscription cancellation.
- **Auth integration**: On registration, user gets Stripe customer + Free subscription + 50 plan credits automatically.
- **Monthly credit reset**: Cron job resets Free users to 50 credits and Pro Annual users to 100 credits monthly. Pro Monthly resets via Stripe invoice.paid webhook.
- **Single active subscription constraint**: One active subscription per user enforced at DB level.

## Impacted Files

### Existing Files (Modified)
- `src/app.module.ts` - Import BillingModule, CatalogModule, CreditModule
- `src/auth/auth.service.ts` - Add Stripe customer creation, Free subscription, and CreditBalance initialization on user registration
- `src/auth/auth.module.ts` - Import CreditModule for registration integration
- `prisma/schema.prisma` - Add Subscription, CreditBalance, AddonPurchase, StripeProduct, StripePrice, ExchangeRate, WebhookEvent models

### New Files (Created)

#### Billing Module (`src/billing/`)
- `billing.module.ts` - Module definition
- `billing.controller.ts` - Checkout endpoints (POST /billing/checkout/subscription, POST /billing/checkout/addon, GET /billing/subscriptions)
- `billing.service.ts` - Subscription lifecycle, checkout session creation
- `stripe.service.ts` - Stripe SDK wrapper (products, prices, subscriptions, webhooks)
- `stripe-webhook.controller.ts` - Webhook endpoint (POST /billing/webhook)
- `dto/create-subscription-checkout.dto.ts` - DTO for subscription checkout
- `dto/create-addon-checkout.dto.ts` - DTO for addon checkout

#### Catalog Module (`src/catalog/`)
- `catalog.module.ts` - Module definition
- `catalog.controller.ts` - Admin endpoints (POST/GET/PUT /admin/catalog/products, POST /admin/catalog/products/:id/refresh-prices, GET /admin/catalog/exchange-rates)
- `catalog.service.ts` - Product/price CRUD, multi-currency price generation
- `exchange-rate.service.ts` - ExchangeRate-API integration, caching, fallback logic
- `dto/create-product.dto.ts` - DTO for product creation
- `dto/update-product.dto.ts` - DTO for product update

#### Credit Module (`src/credit/`)
- `credit.module.ts` - Module definition
- `credit.controller.ts` - Credit endpoints (POST /credits/consume, GET /credits/balance)
- `credit.service.ts` - Credit consumption, balance management, freezing/unfreezing
- `credit-reset.cron.ts` - Monthly credit reset cron job (Free users, Pro Annual users)
- `dto/consume-credits.dto.ts` - DTO for credit consumption

#### Database
- `prisma/migrations/<timestamp>_add_billing_system/migration.sql` - New migration for billing models

## Capabilities

### New Capabilities
- `product-catalog`: Admin CRUD for Stripe products and prices. Multi-currency price generation via live exchange rates (ExchangeRate-API). Supported currencies: VND, USD, EUR, GBP. No rounding on conversion.
- `subscription-lifecycle`: Stripe Checkout session creation (subscription and one-time modes). Webhook handling for subscription state changes. Upgrade/downgrade between Free and Pro. Single active subscription constraint per user.
- `credit-system`: Credit balance management (plan credits + addon credits). Consumption API with plan-first ordering. Monthly credit reset (cron + webhook). Addon credit freezing on Pro expiry. Initial credit allocation on user registration.

### Modified Capabilities
<!-- None -- no existing specs are changing at the requirement level -->

## Impact

- **Database**: New Prisma models — `Subscription`, `CreditBalance`, `AddonPurchase`, `StripeProduct`, `StripePrice`. Modified `User` model (add `stripeCustomerId`). New migration required.
- **APIs**: New endpoints under `/billing/`, `/credits/`, `/admin/catalog/`. New webhook endpoint at `/billing/webhook`.
- **Dependencies**: `stripe` SDK (already installed), `@neondatabase/serverless` or exchange rate HTTP client needed.
- **External systems**: Stripe API, ExchangeRate-API.
- **Auth module**: Registration flow extended to create Stripe customer + Free subscription + credit balance.
- **Config**: New env vars — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `EXCHANGE_RATE_API_KEY`, `EXCHANGE_RATE_BASE_CURRENCY` (VND).
