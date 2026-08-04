# Security & Data Risk Audit: Fix Adapter Pattern Gaps

## Scope
Internal refactoring of webhook event processing pipeline. No new API endpoints, no DB schema changes, no new Stripe API calls.

## PCI-DSS Compliance
✅ **No impact.** This change does not handle, store, or transmit cardholder data. All payment processing remains delegated to Stripe. The `WebhookEvent.payload` stores Stripe event data objects (invoices, subscriptions) — none of which contain raw card numbers.

## Webhook Signature Verification
✅ **Preserved.** The `constructWebhookEvent` method in `StripeAdapter` still calls `stripe.webhooks.constructEvent(rawBody, signature, secret)` before returning a `WebhookEvent`. The fix only changes what is extracted from the verified event — not the verification itself.

## Race Condition Analysis

### Dedup Race (existing + improved)
**Current state (broken):** `event.id` is `undefined`, so the `findUnique({ where: { stripeEventId: undefined } })` call either fails or returns null. Every event is treated as new → **duplicate processing is possible.**

**After fix:** `event.id` is correctly populated from the Stripe event ID. The dedup lookup works as designed. The `stripeEventId` column has a unique constraint in the DB, so concurrent requests for the same event will fail on insert → safe.

### Processor Race (unchanged)
The `WebhookProcessorService` uses `FOR UPDATE SKIP LOCKED` in its query, which prevents concurrent processing of the same event. This is unchanged by the fix.

## Data Integrity Risk

### Existing webhook_events payload format
⚠️ **Low risk.** Records stored before this fix contain the full `Stripe.Event` envelope as payload. After this fix, new records will store `event.data.object` (the domain object only).

The `WebhookProcessorService` reads `record.payload` and passes it directly to strategies. For old records:
- `mapRawInvoice(fullStripeEvent)` would cast a `Stripe.Event` as `Stripe.Invoice` → wrong shape, would produce an invoice with `id = undefined`, `amountDue = undefined`, etc.
- However, this was already broken before this fix (the full envelope was already being stored and processed incorrectly).

**Mitigation:** Any PENDING records from before this fix should be manually inspected. In practice, the number is expected to be zero or very small since the existing code was already broken.

## Secrets & Key Management
✅ **No impact.** No changes to how `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` are loaded or used.

## Summary

| Risk Area | Status | Notes |
|-----------|--------|-------|
| PCI-DSS | ✅ No impact | No cardholder data involved |
| Webhook verification | ✅ Preserved | Signature check unchanged |
| Dedup race condition | ✅ Fixed | Was broken, now restored |
| Processor concurrency | ✅ Unchanged | `SKIP LOCKED` still active |
| Existing payload format | ⚠️ Low risk | Old PENDING records may have wrong shape |
| Secrets management | ✅ No impact | No changes |
