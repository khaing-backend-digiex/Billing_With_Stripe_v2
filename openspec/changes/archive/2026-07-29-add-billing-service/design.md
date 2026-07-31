## Context

NestJS + Prisma + PostgreSQL backend with existing auth (JWT). Stripe account has test products but needs proper VND-based catalog. Need to build subscription management, credit system, and multi-currency checkout from scratch.

**Constraints:**
- Idempotent mutation/payment endpoints
- ACID transactions for all billing state changes
- No raw card data storage (PCI-DSS scope)
- Stripe webhook signature verification required

## Goals / Non-Goals

**Goals:**
- Multi-tenant subscription system (Free/Pro Monthly/Pro Annual)
- Credit consumption with plan-first ordering
- Admin-managed Stripe catalog via API
- Multi-currency checkout (VND base, USD/EUR/GBP)
- Webhook-driven subscription lifecycle
- Monthly credit reset (cron + webhook)
- Addon credit freezing on Pro expiry (remaining credits)

**Non-Goals:**
- Usage-based billing (Metronome) — we're doing fixed credits
- Stripe Connect (no marketplace)
- In-app payment forms (using Stripe Checkout redirect)
- Retry/renew function for expired Pro subscriptions (future work)

## Decisions

**1. Exchange rate fallback strategy**
- **Decision**: Cache exchange rates in DB (`ExchangeRate` table). If ExchangeRate-API fails, use latest cached rates.
- **Rationale**: Prevents checkout failures during API downtime. Rates are typically stable within hours.
- **Alternative**: Fallback to base currency (VND) only — rejected, bad UX.

**2. Subscription state management**
- **Decision**: Multiple subscription records per user (one active at a time). When user upgrades, cancel old subscription and create new one.
- **Rationale**: Keeps full subscription history. Clear audit trail. Matches "multiple subscriptions, one active" requirement.
- **Alternative**: Update single subscription record — rejected, loses history.

**3. Addon credit tracking**
- **Decision**: Aggregate addon credits at `CreditBalance` level. `AddonPurchase` records track purchases but don't track individual consumption.
- **Rationale**: Simpler model. No need to track which specific kit credits came from.
- **Alternative**: Per-purchase consumption tracking — rejected, over-engineered.

**4. Addon credit freezing**
- **Decision**: When Pro expires, freeze **remaining** addon credits (not total purchased). Unfreeze when Pro renews.
- **Rationale**: User only loses what they haven't used. Fair model.
- **Alternative**: Freeze total purchased credits — rejected, penalizes user for prior consumption.

**5. Free tier in Stripe**
- **Decision**: Free = $0/month recurring subscription in Stripe. All users have Stripe customer + subscription from registration.
- **Rationale**: Consistent model. Stripe tracks all subscription state. Easier to upgrade.
- **Alternative**: Free purely local (no Stripe) — rejected, inconsistent.

**6. Webhook idempotency**
- **Decision**: Store processed webhook event IDs in `WebhookEvent` table. Reject duplicates.
- **Rationale**: Stripe may retry webhooks. Idempotency prevents double-processing.
- **Alternative**: Stripe's built-in idempotency — rejected, less control.

**7. Catalog price generation**
- **Decision**: Admin creates product with base price (VND). System fetches live rates and creates Stripe prices for USD/EUR/GBP at product creation time. Admin can refresh prices manually.
- **Rationale**: Single source of truth (VND). Prices created once, not on every checkout (avoids latency).
- **Alternative**: Create prices at checkout time — rejected, adds latency.

**8. Credit reset strategy**
- **Decision**: 
  - Free users: Cron job (monthly)
  - Pro Monthly: Stripe `invoice.paid` webhook
  - Pro Annual: Cron job (monthly)
- **Rationale**: Cron for predictable resets, webhook for payment-gated resets.
- **Alternative**: All cron — rejected, Pro Monthly needs payment confirmation.

**9. Credit consumption order**
- **Decision**: Plan credits first, then addon credits as fallback.
- **Rationale**: User gets full value from subscription before burning paid addons.
- **Alternative**: Addon first — rejected, wastes paid credits.

**10. Subscription transitions**
- **Decision**: 
  - User registers → create Free subscription (ACTIVE)
  - Cross-tier (Free ↔ Pro): Cancel old subscription (CANCELED), create new subscription (ACTIVE). New DB record, new Stripe subscription ID.
  - Same-tier (Pro Monthly ↔ Pro Annual): Use Stripe `subscription.update` with proration. Same Stripe subscription ID. Update existing DB record (plan changes, ID stays).
  - Pro expires → cancel Pro (CANCELED), create Free (ACTIVE), freeze addon credits
- **Rationale**: Cross-tier changes require new subscription records for clear audit trail. Same-tier changes (e.g., Pro Monthly → Pro Annual) must use Stripe's built-in proration to avoid losing unused time or overcharging.
- **Alternative**: Cancel and create for all transitions — rejected, causes loss of unused time/proration for same-tier upgrades.

## Data Model

```prisma
model User {
  id                 String   @id @default(uuid())
  email              String   @unique
  password           String
  stripeCustomerId   String?  // Set on registration
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  
  profile          Profile?
  userRoles        UserRole[]
  subscription     Subscription[]
  creditBalance    CreditBalance?
  addonPurchases   AddonPurchase[]
}

model Subscription {
  id                    String    @id @default(uuid())
  userId                String
  stripeSubscriptionId  String    @unique
  plan                  PlanType  // FREE, PRO_MONTHLY, PRO_ANNUAL
  status                SubStatus // ACTIVE, PAST_DUE, CANCELED, EXPIRED
  currentPeriodStart    DateTime?
  currentPeriodEnd      DateTime?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId, status])
  @@map("subscriptions")
}

model CreditBalance {
  userId                  String   @id
  planCredits             Int      // 50 (Free) or 100 (Pro)
  addonCreditsAvailable   Int      // sum(purchased) - sum(used) - sum(frozen)
  addonCreditsFrozen      Int      // frozen when Pro expires
  lastResetAt             DateTime @default(now())
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("credit_balances")
}

model AddonPurchase {
  id              String   @id @default(uuid())
  userId          String
  creditsGranted  Int      // 15 per kit
  stripePaymentId String   @unique
  purchasedAt     DateTime @default(now())
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@map("addon_purchases")
}

model StripeProduct {
  id                String   @id @default(uuid())
  stripeProductId   String   @unique
  name              String
  planType          PlanType // FREE, PRO_MONTHLY, PRO_ANNUAL, ADDON
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  prices StripePrice[]
  
  @@map("stripe_products")
}

model StripePrice {
  id                String   @id @default(uuid())
  stripePriceId     String   @unique
  productId         String
  currency          String   // VND, USD, EUR, GBP
  amount            Int      // in smallest unit (cents, dong, etc.)
  interval          String?  // month, year, null (one-time)
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  product StripeProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
  
  @@index([productId, currency])
  @@map("stripe_prices")
}

model ExchangeRate {
  id              String   @id @default(uuid())
  baseCurrency    String   // VND
  targetCurrency  String   // USD, EUR, GBP
  rate            Decimal  // 1 VND = X target
  updatedAt       DateTime @updatedAt
  
  @@unique([baseCurrency, targetCurrency])
  @@map("exchange_rates")
}

model WebhookEvent {
  id              String   @id @default(uuid())
  stripeEventId   String   @unique
  type            String   // checkout.session.completed, invoice.paid, etc.
  payload         Json
  processedAt     DateTime @default(now())
  
  @@map("webhook_events")
}

enum PlanType {
  FREE
  PRO_MONTHLY
  PRO_ANNUAL
  ADDON
}

enum SubStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  EXPIRED
}
```

## API Endpoints

### Admin Catalog
- `POST /admin/catalog/products` — Create product + generate multi-currency prices
- `GET /admin/catalog/products` — List all products with prices
- `PUT /admin/catalog/products/:id` — Update product
- `DELETE /admin/catalog/products/:id` — Deactivate product
- `POST /admin/catalog/products/:id/refresh-prices` — Re-fetch exchange rates, update prices
- `GET /admin/catalog/exchange-rates` — Get current exchange rates

### Billing
- `POST /billing/checkout/subscription` — Create Stripe Checkout session for subscription
- `POST /billing/checkout/addon` — Create Stripe Checkout session for addon kit
- `GET /billing/subscriptions` — Get user's subscriptions
- `POST /billing/webhook` — Stripe webhook endpoint

### Credits
- `POST /credits/consume` — Consume credits (plan first, then addon)
- `GET /credits/balance` — Get user's credit balance
- `GET /credits/history` — Get credit transaction history (future)

## Webhook Handlers

- `checkout.session.completed` — Activate subscription or add addon credits
- `invoice.paid` — Reset Pro Monthly credits to 100
- `invoice.payment_failed` — Mark subscription PAST_DUE
- `customer.subscription.deleted` — Downgrade to Free, freeze addon credits

## Module Structure

```
src/
├── billing/
│   ├── billing.module.ts
│   ├── billing.controller.ts
│   ├── billing.service.ts
│   ├── stripe.service.ts
│   ├── stripe-webhook.controller.ts
│   └── dto/
├── catalog/
│   ├── catalog.module.ts
│   ├── catalog.controller.ts
│   ├── catalog.service.ts
│   ├── exchange-rate.service.ts
│   └── dto/
├── credit/
│   ├── credit.module.ts
│   ├── credit.controller.ts
│   ├── credit.service.ts
│   └── credit-reset.cron.ts
└── auth/ (existing)
```

## Risks / Trade-offs

**Risk**: ExchangeRate-API downtime → checkout fails
**Mitigation**: Cache latest rates in DB. Fallback to cached rates if API fails. Alert if cache is stale > 24h.

**Risk**: Webhook ordering issues (Stripe sends events out of order)
**Mitigation**: Use event `created` timestamp for ordering. Idempotent handlers prevent double-processing.

**Risk**: Credit race conditions (concurrent consume requests)
**Mitigation**: Prisma transactions with `UPDATE ... WHERE` atomic operations. Row-level locking on `CreditBalance`.

**Risk**: Stripe subscription state drifts from DB
**Mitigation**: Webhook handlers update both Stripe and DB in same transaction. Reconciliation cron (daily) compares states.

**Risk**: Exchange rate volatility (prices change between admin creation and user checkout)
**Mitigation**: Prices are created at product creation time with live rates. Admin can refresh prices manually. User sees final price at checkout.

## Migration Plan

1. Add new Prisma models → run migration
2. Deploy new modules (catalog, billing, credit)
3. Update auth registration flow to create Stripe customer + Free subscription
4. Configure Stripe webhooks (point to `/billing/webhook`)
5. Set env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `EXCHANGE_RATE_API_KEY`)
6. Admin creates catalog via API (products + prices)
7. Test checkout flow end-to-end

**Rollback**: Revert deployment. Existing users keep Free tier. Stripe subscriptions remain active but unused.

## Open Questions

- Should there be a grace period when Pro expires before addon credits freeze?
- Should users be notified before credit reset (email/in-app)?
- Should admin be able to manually override credit balances?
