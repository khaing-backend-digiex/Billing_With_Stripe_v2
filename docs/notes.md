# Stripe Webhook Implementation Notes

## Architecture

### Strategy Pattern
Implemented webhook event handlers using the Strategy Pattern for extensibility:
- `WebhookStrategyInterface` - Common interface for all handlers
- `WebhookStrategyFactory` - Registry and lookup for strategies
- 5 strategy implementations in `src/billing/strategies/`:
  - `checkout-session-completed.strategy.ts` - Handles subscription activation and addon purchases
  - `invoice-paid.strategy.ts` - Resets credits on successful payment
  - `invoice-payment-failed.strategy.ts` - Marks subscription PAST_DUE, freezes credits
  - `customer-subscription-updated.strategy.ts` - Syncs plan changes and period dates
  - `customer-subscription-deleted.strategy.ts` - Cancels subscription, downgrades to FREE

### Async Processing
- Background processor polls every 30 seconds (`@Cron('*/30 * * * * *')`)
- Uses `FOR UPDATE SKIP LOCKED` for concurrent safety
- Processes up to 20 events per batch

### Retry Logic
- Fixed interval: 1 day between retries
- Maximum 3 retry attempts
- After 3 failures: subscription canceled, user downgraded to FREE tier
- Events stored with status tracking: PENDING → PROCESSING → DONE/FAILED

### Database Schema
Updated `WebhookEvent` model with:
- `status` (WebhookStatus enum: PENDING, PROCESSING, DONE, FAILED)
- `retryCount` (Int, default 0)
- `maxRetries` (Int, default 3)
- `nextRetryAt` (DateTime)
- `lastError` (String?, optional)
- Index on `(status, nextRetryAt)` for polling optimization

### Subscription Lifecycle
```
Payment fails → PAST_DUE (credits frozen)
  ↓
Day 1: Retry 1
Day 2: Retry 2
Day 3: Retry 3 → If fails → CANCELED, FREE tier, addon credits frozen permanently
```

## Key Files

### New Files
- `src/billing/strategies/webhook-strategy.interface.ts`
- `src/billing/strategies/webhook-strategy.factory.ts`
- `src/billing/strategies/checkout/checkout-session-completed.strategy.ts`
- `src/billing/strategies/invoice/invoice-paid.strategy.ts`
- `src/billing/strategies/invoice/invoice-payment-failed.strategy.ts`
- `src/billing/strategies/subscription/customer-subscription-updated.strategy.ts`
- `src/billing/strategies/subscription/customer-subscription-deleted.strategy.ts`
- `src/billing/webhook-processor.service.ts`

### Modified Files
- `src/main.ts` - Enabled `rawBody: true` for signature verification
- `prisma/schema.prisma` - Added WebhookStatus enum and WebhookEvent fields
- `src/billing/stripe-webhook.controller.ts` - Simplified to receive + store only
- `src/billing/billing.module.ts` - Registered all strategies and processor

## Event Handling

Uses `event.data.object` directly from webhook payload (no additional Stripe API calls):
- `checkout.session.completed` → Branches on `metadata.type` (addon vs subscription)
- `invoice.paid` → Resets credits, reactivates if PAST_DUE
- `invoice.payment_failed` → Marks PAST_DUE, freezes all credits
- `customer.subscription.updated` → Syncs plan, period dates, status
- `customer.subscription.deleted` → Cancels, freezes addon credits, resets to FREE

## Testing

- Unit tests for all strategies
- Integration tests for webhook flow
- Tests for retry logic and max retries
- Idempotency tests for duplicate events

## Migration

Migration applied: `20260731072029_add_webhook_status_fields`
- Added WebhookStatus enum
- Updated WebhookEvent model with retry tracking fields
- Added composite index for polling optimization
