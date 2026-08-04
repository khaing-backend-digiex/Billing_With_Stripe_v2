# Design: Fix Adapter Pattern Implementation Gaps

## Data Flow (Fixed)

The core fix is ensuring a consistent `WebhookEvent` contract across all three entry paths:

```
                    ┌──────────────────────────────┐
                    │      Stripe Webhook POST     │
                    └─────────────┬────────────────┘
                                  │ rawBody + signature
                                  ▼
                    ┌──────────────────────────────┐
                    │   StripeAdapter               │
                    │   .constructWebhookEvent()    │
                    │                               │
                    │   Returns:                    │
                    │   { id: event.id,             │
                    │     type: event.type,         │
                    │     payload: event.data.object│ ← domain object, NOT envelope
                    │   }                           │
                    └─────────────┬────────────────┘
                                  │ WebhookEvent
                                  ▼
                    ┌──────────────────────────────┐
                    │ StripeWebhookController       │
                    │                               │
                    │ 1. event.id → dedup lookup    │ ← now works (id exists)
                    │ 2. Store to webhook_events    │
                    │    payload = event.payload     │ ← stores domain object
                    └─────────────┬────────────────┘
                                  │ (stored in DB)
                                  ▼
                    ┌──────────────────────────────┐
                    │ WebhookProcessorService       │
                    │ (cron picks up PENDING)        │
                    │                               │
                    │ Constructs:                   │
                    │ { id: record.stripeEventId,   │
                    │   type: record.type,          │
                    │   payload: record.payload }   │ ← already domain object
                    │                               │
                    │ NO Stripe import needed       │
                    └─────────────┬────────────────┘
                                  │ WebhookEvent
                                  ▼
                    ┌──────────────────────────────┐
                    │  Strategy.handle(event)       │
                    │                               │
                    │  mapRawInvoice(event.payload) │ ← correct shape
                    │  mapRawSubscription(...)      │
                    └──────────────────────────────┘
```

## Type Changes

### `WebhookEvent` — add `id` field

```typescript
// payment.types.ts
export interface WebhookEvent {
  id: string;        // ← NEW: provider event ID (e.g., "evt_xxx")
  type: string;
  payload: unknown;
}
```

### `IPaymentAdapter.constructWebhookEvent` — return type unchanged

The interface already returns `WebhookEvent`. The fix is in the `StripeAdapter` implementation to populate `id` and set `payload = event.data.object`.

## File-by-File Changes

### 1. `src/billing/payments/types/payment.types.ts`
- Add `id: string` to `WebhookEvent` interface.

### 2. `src/billing/payments/adapters/stripe.adapter.ts`
- `constructWebhookEvent`: return `{ id: event.id, type: event.type, payload: event.data.object }`.
- `upgradeSubscriptionTier`: pass `prorationBehavior: 'create_prorations'` explicitly.
- `upgradeSubscriptionCycle`: pass `prorationBehavior: 'none'` to distinguish from tier upgrades.
- `previewUpgradeSubscriptionTier` / `previewUpgradeSubscriptionCycle`: throw `ServiceError(ErrorCode.INTERNAL_ERROR, 'Not implemented')` instead of raw `Error`.

### 3. `src/billing/webhook-processor.service.ts`
- Remove `import Stripe from 'stripe'`.
- Import `WebhookEvent` from `payments/types/payment.types`.
- Replace the `Stripe.Event` reconstruction block with:
  ```typescript
  const genericEvent: WebhookEvent = {
    id: event.stripeEventId,
    type: event.type,
    payload: event.payload,
  };
  await strategy.handle(genericEvent);
  ```

### 4. `src/billing/stripe-webhook.controller.ts`
- The controller already accesses `event.id` — now valid since `WebhookEvent` has `id`.
- Store `event.payload` to the DB (already does this with `event.payload as Prisma.InputJsonValue`).

### 5. `src/billing/stripe.service.ts` — **DELETE**

### 6. `src/billing/__tests__/stripe-webhook.controller.spec.ts`
- Replace `StripeService` import with `PaymentService`.
- Update provider injection to match actual controller dependencies: `PaymentService`, `PrismaService`, `WebhookProcessorService`, `AppLogger`.
- Update mock: `verifyWebhookSignature` now returns `WebhookEvent` (with `id`, `type`, `payload`), not `Stripe.Event`.

### 7. `src/billing/strategies/invoice/invoice-payment-failed.strategy.ts`
- Remove `AppLogger` injection — keep only `Logger`.
- Replace magic `3` with `MAX_INVOICE_RETRY_ATTEMPTS` constant.

### 8. `src/billing/billing.module.ts`
- Type the factory: `useFactory: (...strategies: WebhookStrategy[]) => strategies`.

### 9. `src/constants/billing.constants.ts` — **NEW**
- Add `MAX_INVOICE_RETRY_ATTEMPTS = 3`.
- Import and use in both `InvoicePaymentFailedStrategy` and `StripeWebhookController`.

## Idempotency

No changes to idempotency mechanisms. The webhook dedup flow is preserved:
1. Controller receives event → checks `stripeEventId` uniqueness → stores if new.
2. Processor picks up PENDING events → processes → marks DONE.

The fix **restores** the dedup that was broken (because `event.id` was `undefined`).

## No Database Migration Required

The `webhook_events` table schema is unchanged. The `payload` column already stores JSON. The only difference is that it will now store `event.data.object` (the domain object) instead of the entire Stripe event — but since the column type is `Json`, this is transparent.

> **Note**: If there are existing records in `webhook_events` that stored the full `Stripe.Event` envelope, the processor will still pass `record.payload` to strategies. For `invoice.paid` events, `mapRawInvoice()` would receive the Stripe event envelope and fail. Existing PENDING records from before this fix may need manual attention or a one-time cleanup.
