# Code Review: Billing Stripe NestJS Project

## Overall Impression

This is a well-structured NestJS billing system with Stripe integration, featuring auth, catalog management, webhook processing with retry logic, and a credit system. The architecture shows good separation of concerns with the Strategy pattern for webhooks and a clean module layout. 

That said, there are several **bugs, security concerns, and design issues** worth addressing.

---

## 🔴 Critical Issues (Bugs & Security)

### 1. Race condition in `auth.service.ts` — Stripe call inside Prisma transaction

[auth.service.ts:L64-L71](file:///d:/Billing_Stripe_Prompt/src/auth/auth.service.ts#L64-L71)

```typescript
const stripeCustomer = await this.stripeService.createCustomer(dto.email, {
  userId: newUser.id,
});
```

An **external API call (Stripe)** is made inside a `$transaction`. If the Stripe call is slow or fails after the DB rows are already prepared, the transaction will either hold a long lock or rollback the DB while the Stripe customer already exists — leaving a **dangling Stripe customer** with no matching DB record. 

> [!CAUTION]
> **Fix:** Move the `createCustomer` call **outside** the transaction. Create the Stripe customer first, then pass the `stripeCustomerId` into the transaction. If the transaction fails, you can clean up the Stripe customer.

---

### 2. Hardcoded addon credits `'15'` in `billing.service.ts`

[billing.service.ts:L76](file:///d:/Billing_Stripe_Prompt/src/billing/billing.service.ts#L76)

```typescript
metadata: {
  userId,
  type: 'addon',
  credits: '15', // ← hardcoded magic number
},
```

The addon credit amount is hardcoded to `'15'`. This should come from the price/product configuration or be passed as a parameter.

> [!WARNING]
> **Fix:** Derive the credit amount from the product/price data, or at minimum use a named constant.

---

### 3. Non-null assertion on `stripeCustomerId` without guard

[billing.service.ts:L32](file:///d:/Billing_Stripe_Prompt/src/billing/billing.service.ts#L32)

```typescript
customerId: user.stripeCustomerId!,
```

The schema defines `stripeCustomerId` as `String?` (nullable), but the code uses `!` to bypass the null check. If a user somehow doesn't have a Stripe customer ID, this will pass `null` to Stripe and cause an opaque API error.

> [!WARNING]
> **Fix:** Add an explicit check: `if (!user.stripeCustomerId) throw new ServiceError('STRIPE_CUSTOMER_MISSING', '...')`.

---

### 4. `webhook-processor.service.ts` raw SQL column names mismatch risk

[webhook-processor.service.ts:L19-L26](file:///d:/Billing_Stripe_Prompt/src/billing/webhook-processor.service.ts#L19-L26)

```sql
SELECT * FROM webhook_events
WHERE status = ${WebhookStatus.PENDING}
AND next_retry_at <= NOW()
```

The raw SQL uses **snake_case** column names (`next_retry_at`), but when you access the results with `event.retryCount`, `event.maxRetries`, `event.type`, etc. — these are **camelCase** property names. Raw queries return columns as-is from PostgreSQL (snake_case), so `event.retryCount` will be `undefined` — the actual property would be `event.retry_count`.

> [!CAUTION]
> **Fix:** Either map the raw result to camelCase objects, use column aliases in the SQL (`retry_count AS "retryCount"`), or use `prisma.webhookEvent.findMany()` instead of raw SQL. The `FOR UPDATE SKIP LOCKED` can be achieved with `$queryRaw` but you need to handle the column mapping.

---

### 5. Retry backoff is always +1 day — no exponential backoff

[webhook-processor.service.ts:L119-L123](file:///d:/Billing_Stripe_Prompt/src/billing/webhook-processor.service.ts#L119-L123)

```typescript
private calculateNextRetry(): Date {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return now;
}
```

Every retry is exactly 1 day later, regardless of attempt count. With `maxRetries: 3`, this means retries happen at +1d, +2d, +3d. This is unusually slow for webhook processing. Most systems use **exponential backoff** (e.g. 30s, 2min, 15min).

> [!IMPORTANT]
> **Fix:** Implement exponential backoff: `Math.pow(2, retryCount) * baseDelaySeconds`.

---

### 6. `Prisma.PrismaClientKnownRequestError` details leak in production

[global-exception.filter.ts:L43-L46](file:///d:/Billing_Stripe_Prompt/src/common/filters/global-exception.filter.ts#L43-L46)

```typescript
details = {
  code: exception.code,
  meta: exception.meta,
};
```

Prisma error `meta` can contain table names, column names, and constraint details. This is **information leakage** to the API consumer.

> [!WARNING]
> **Fix:** Only include these details in non-production environments. In production, return a generic message and log the details server-side only.

---

## 🟡 Design & Architecture Issues

### 7. Duplicated business logic between `BillingService` and webhook strategies

[billing.service.ts:L103-L150](file:///d:/Billing_Stripe_Prompt/src/billing/billing.service.ts#L103-L150) duplicates the subscription activation logic that also exists in [checkout-session-completed.strategy.ts:L63-L111](file:///d:/Billing_Stripe_Prompt/src/billing/strategies/checkout/checkout-session-completed.strategy.ts#L63-L111).

Both `BillingService.activateSubscription()` and `CheckoutSessionCompletedStrategy.handleSubscriptionPurchase()` contain nearly identical logic for:
- Canceling the current active subscription
- Creating a new subscription
- Resetting plan credits
- Unfreezing addon credits

> [!IMPORTANT]
> **Fix:** Extract this into a shared domain service (e.g. `SubscriptionLifecycleService`) that both call.

---

### 8. Inconsistent logger usage — `Logger` vs `AppLogger`

| File | Logger Used |
|------|-------------|
| [billing.service.ts](file:///d:/Billing_Stripe_Prompt/src/billing/billing.service.ts) | `AppLogger` (Pino) ✅ |
| [webhook-processor.service.ts](file:///d:/Billing_Stripe_Prompt/src/billing/webhook-processor.service.ts#L10) | `new Logger()` (NestJS default) ❌ |
| [checkout-session-completed.strategy.ts](file:///d:/Billing_Stripe_Prompt/src/billing/strategies/checkout/checkout-session-completed.strategy.ts#L12) | `new Logger()` (NestJS default) ❌ |
| [invoice-paid.strategy.ts](file:///d:/Billing_Stripe_Prompt/src/billing/strategies/invoice/invoice-paid.strategy.ts#L11) | `new Logger()` (NestJS default) ❌ |
| [All other strategies](file:///d:/Billing_Stripe_Prompt/src/billing/strategies) | `new Logger()` (NestJS default) ❌ |
| [credit-reset.cron.ts](file:///d:/Billing_Stripe_Prompt/src/credit/credit-reset.cron.ts#L10) | `new Logger()` (NestJS default) ❌ |

You set up `AppLogger` (Pino-backed) as the global logger in `main.ts`, but half the codebase still uses `new Logger()` directly. This means those logs **won't go through Pino**, won't have structured JSON, and won't include the correlation ID.

> **Fix:** Inject `AppLogger` everywhere. The strategies and cron service should receive it via constructor injection.

---

### 9. `PrismaService` registered in multiple modules

[billing.module.ts:L36](file:///d:/Billing_Stripe_Prompt/src/billing/billing.module.ts#L36) directly provides `PrismaService`, while [prisma.module.ts](file:///d:/Billing_Stripe_Prompt/src/prisma) should be the single source.

```typescript
// billing.module.ts
providers: [
  PrismaService, // ← creates a SECOND instance
  ...
]
```

This creates a **separate PrismaService instance** in the billing module, disconnected from the global one registered in `PrismaModule`. Each instance maintains its own connection pool.

> **Fix:** Remove `PrismaService` from `BillingModule.providers` and instead import `PrismaModule` in the `imports` array.

---

### 10. `where: any` in query methods weakens type safety

[billing.service.ts:L87](file:///d:/Billing_Stripe_Prompt/src/billing/billing.service.ts#L87), [catalog.service.ts:L77](file:///d:/Billing_Stripe_Prompt/src/catalog/catalog.service.ts#L77)

```typescript
const where: any = { userId };
```

Using `any` for the Prisma `where` clause defeats TypeScript's ability to catch typos and invalid filters. Prisma generates perfect types for this.

> **Fix:** Use `Prisma.SubscriptionWhereInput` and `Prisma.StripeProductWhereInput` respectively.

---

### 11. `WebhookStrategyFactory.getSupportedTypes()` hardcodes event types

[webhook-strategy.factory.ts:L38-L48](file:///d:/Billing_Stripe_Prompt/src/billing/strategies/webhook-strategy.factory.ts#L38-L48)

```typescript
private getSupportedTypes(strategy: WebhookStrategyInterface): string[] {
  const knownTypes = [
    'checkout.session.completed',
    'checkout.session.expired',
    // ...
  ];
  return knownTypes.filter((t) => strategy.supports(t));
}
```

This bruteforce approach to discover which types a strategy supports is fragile. If you add a new event type but forget to add it here, the duplicate check won't catch conflicts.

> **Fix:** Add a `supportedTypes: string[]` property to `WebhookStrategyInterface`, so each strategy declares its types explicitly.

---

### 12. `CreditResetCronService` — redundant daily cron for monthly task

[credit-reset.cron.ts:L17-L24](file:///d:/Billing_Stripe_Prompt/src/credit/credit-reset.cron.ts#L17-L24)

```typescript
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async handleMonthlyReset() {
  const today = new Date();
  const isFirstDayOfMonth = today.getDate() === 1;
  if (!isFirstDayOfMonth) return;
```

The cron fires **every single day** just to check if it's the 1st. This wastes resources and adds log noise.

> **Fix:** Use a proper monthly cron expression: `@Cron('0 0 1 * *')` (at midnight on the 1st of every month).

---

### 13. `refreshPrices` takes interval from `product.prices[0]` — fragile

[catalog.service.ts:L162](file:///d:/Billing_Stripe_Prompt/src/catalog/catalog.service.ts#L162)

```typescript
product.prices[0]?.interval as 'month' | 'year' | undefined,
```

The interval is taken from the first price in the array. If prices are in mixed order or the array is empty after the `updateMany` deactivation, this will be `undefined` — potentially creating a one-time price for what should be a recurring product.

> **Fix:** Store `interval` on the `StripeProduct` model itself, or filter for the VND price's interval specifically.

---

## 🟢 Minor Issues & Code Smells

### 14. `__paginated` magic property in response objects

[billing.service.ts:L100](file:///d:/Billing_Stripe_Prompt/src/billing/billing.service.ts#L100), [catalog.service.ts:L96](file:///d:/Billing_Stripe_Prompt/src/catalog/catalog.service.ts#L96)

```typescript
return { data, total, page, limit, __paginated: true };
```

This hidden `__paginated` flag leaks into the response object and is used by the interceptor to detect pagination. It's a form of **Message Chains** / internal signaling that could be replaced by a typed `PaginatedResult<T>` class.

### 15. `ExchangeRateService` uses `fetch()` without timeout

[exchange-rate.service.ts:L82](file:///d:/Billing_Stripe_Prompt/src/catalog/exchange-rate.service.ts#L82)

No timeout on the external API call. If the exchange rate API hangs, the request will hang indefinitely.

> **Fix:** Use `AbortController` with a timeout: `const controller = new AbortController(); setTimeout(() => controller.abort(), 5000);`

### 16. `@Cron(CronExpression.EVERY_30_SECONDS)` for webhook processing is aggressive

[webhook-processor.service.ts:L17](file:///d:/Billing_Stripe_Prompt/src/billing/webhook-processor.service.ts#L17)

Polling every 30 seconds with `FOR UPDATE SKIP LOCKED` on 20 rows is fine for moderate traffic, but creates unnecessary DB load when idle. Consider making the interval configurable or using a lighter health check before the main query.

---

## Summary

| Axis | Findings | Worst Issue |
|------|----------|-------------|
| **Critical (Bugs)** | 6 | Raw SQL column name mismatch (#4) — silently produces `undefined` values causing incorrect retry behavior |
| **Design** | 7 | Duplicated subscription activation logic (#7) — divergent copies will inevitably drift |
| **Minor** | 3 | `__paginated` magic flag (#14) — code smell, not dangerous |

### Priority Fixes
1. **#4** — Raw SQL column mapping (broken retry logic)
2. **#1** — Stripe API call inside transaction (data integrity)
3. **#3** — Non-null assertion without guard (runtime crash)
4. **#9** — Duplicate PrismaService instances (connection leak)
5. **#7** — Extract shared subscription lifecycle logic
