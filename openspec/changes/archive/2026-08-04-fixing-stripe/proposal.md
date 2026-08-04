# Change Proposal: Fix Adapter Pattern Implementation Gaps

## What
Fix critical runtime bugs and clean up dead code left over from the `add-adapter-pattern` change. The adapter refactor introduced `WebhookEvent` and `IPaymentAdapter` but left several integration seams unfinished: the webhook processor still constructs `Stripe.Event`, the `WebhookEvent` type is missing an `id` field, the event payload wraps the wrong layer of the Stripe envelope, the old `StripeService` file was never deleted, and the webhook controller test still references the old service.

## Why

### Runtime-breaking issues
1. **`StripeWebhookController` accesses `event.id`** — but `WebhookEvent` has no `id` field. This is `undefined` at runtime, so dedup lookups by `stripeEventId` always miss.
2. **`constructWebhookEvent` wraps the entire `Stripe.Event` as payload** — strategies then pass this envelope to `mapRawInvoice()`, which casts it to `Stripe.Invoice`. It receives the wrong object shape and will silently produce garbage data.
3. **`WebhookProcessorService` reconstructs a `Stripe.Event`** — but the `WebhookStrategy` interface now expects `WebhookEvent`. Type mismatch at the processor→strategy boundary, plus lingering `import Stripe` and `as any`.

### Dead code & stale tests
4. **`stripe.service.ts`** (251 lines) was never deleted. It is no longer registered in `billing.module.ts` but creates confusion about which service is canonical.
5. **`stripe-webhook.controller.spec.ts`** still imports and provides `StripeService` instead of `PaymentService` — tests are validating the old architecture.

### Code quality
6. Dual logger in `InvoicePaymentFailedStrategy` (injects both `Logger` and `AppLogger`).
7. Untyped spread in `billing.module.ts` factory (`...strategies` implicitly `any[]`).
8. Magic number `3` for retry threshold — no shared constant with webhook controller.
9. `upgradeSubscriptionTier` / `upgradeSubscriptionCycle` are identical — no proration distinction.
10. `previewUpgradeSubscription*` throw raw `Error` instead of `ServiceError`.
11. `mapRawSubscription` silently falls back to epoch (0) when subscription has no items.

## Impacted Files
- `src/billing/payments/types/payment.types.ts` — add `id` to `WebhookEvent`
- `src/billing/payments/adapters/stripe.adapter.ts` — fix `constructWebhookEvent` payload, fix `previewUpgrade*` errors, differentiate tier/cycle upgrade proration
- `src/billing/payments/types/payment-adapter.interface.ts` — update `constructWebhookEvent` return type
- `src/billing/webhook-processor.service.ts` — build `WebhookEvent` instead of `Stripe.Event`, remove Stripe import
- `src/billing/stripe.service.ts` — **DELETE**
- `src/billing/__tests__/stripe-webhook.controller.spec.ts` — rewrite to use `PaymentService`
- `src/billing/stripe-webhook.controller.ts` — access `event.id` correctly
- `src/billing/strategies/invoice/invoice-payment-failed.strategy.ts` — remove dual logger, extract retry constant
- `src/billing/billing.module.ts` — type the factory spread

## Rollback Plan
All changes are internal refactoring with no public API surface changes, no DB migration, and no Stripe API changes. Rollback is a simple `git revert`.
