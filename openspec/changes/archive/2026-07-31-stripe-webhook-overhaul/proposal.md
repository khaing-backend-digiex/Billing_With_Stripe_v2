## Why

The current Stripe webhook implementation has critical bugs that prevent it from working at all: `rawBody` is not enabled in `main.ts`, causing signature verification to always fail. The handler also lacks error handling, processes events synchronously (risking timeouts), and uses a monolithic switch statement that's hard to maintain. We need a robust, extensible architecture that can handle Stripe events reliably with proper error recovery.

## What Changes

- **Fix critical webhook bugs**: Enable `rawBody` in `main.ts`, add proper error handling and HTTP status codes
- **Implement Strategy Pattern**: Replace monolithic switch statement with `WebhookStrategyInterface` and `WebhookStrategyFactory` for extensibility
- **Add async processing with DB polling**: Store events in `WebhookEvent` table with status tracking, process via background cron job with automatic retry (every 1 day, max 3 attempts)
- **Handle 5 essential Stripe events**: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`
- **Update database schema**: Add `WebhookStatus` enum and new fields to `WebhookEvent` model (status, retryCount, maxRetries, nextRetryAt, lastError)
- **Add comprehensive test coverage**: Unit tests for all strategies, processor, and controller

## Capabilities

### New Capabilities

- `webhook-strategy-pattern`: Strategy-based webhook event handling with extensible interface and factory pattern
- `webhook-async-processor`: Background job system with DB polling, retry logic (every 1 day, max 3 attempts), and subscription lifecycle management
- `webhook-event-strategies`: Individual strategy implementations for 5 Stripe webhook events (checkout, invoice, subscription lifecycle)

### Modified Capabilities

(none - no existing specs to modify)

## Impact

**Files to Create:**
- `src/billing/strategies/webhook-strategy.interface.ts` - Strategy interface definition
- `src/billing/strategies/webhook-strategy.factory.ts` - Strategy registry and lookup
- `src/billing/strategies/checkout/checkout-session-completed.strategy.ts`
- `src/billing/strategies/invoice/invoice-paid.strategy.ts`
- `src/billing/strategies/invoice/invoice-payment-failed.strategy.ts`
- `src/billing/strategies/subscription/customer-subscription-updated.strategy.ts`
- `src/billing/strategies/subscription/customer-subscription-deleted.strategy.ts`
- `src/billing/webhook-processor.service.ts` - Background polling and dispatch
- `src/billing/__tests__/webhook-processor.service.spec.ts`
- `src/billing/__tests__/stripe-webhook.controller.spec.ts`
- `src/billing/__tests__/strategies/*.spec.ts` - Strategy unit tests

**Files to Modify:**
- `src/main.ts` - Enable `rawBody: true` for webhook signature verification
- `prisma/schema.prisma` - Update `WebhookEvent` model with status tracking fields
- `src/billing/stripe-webhook.controller.ts` - Simplify to receive + store only
- `src/billing/billing.module.ts` - Register all strategies and processor
- `src/billing/billing.service.ts` - Refactor existing handlers to work with strategies

**Dependencies:**
- Add `@nestjs/schedule` for cron job support (if not already installed)

**APIs:**
- `POST /billing/webhook` - No breaking changes, but now works correctly

**Database:**
- Migration required for `WebhookEvent` schema changes
- New enum: `WebhookStatus` (PENDING, PROCESSING, DONE, FAILED)

**Systems:**
- Stripe webhook endpoint must be configured in Stripe Dashboard
- Background processor adds minimal database polling overhead (every 30 seconds)
