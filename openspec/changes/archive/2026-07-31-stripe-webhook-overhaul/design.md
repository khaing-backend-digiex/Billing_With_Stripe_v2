## Context

The current Stripe webhook handler at `src/billing/stripe-webhook.controller.ts` has several critical issues:

1. **Broken signature verification**: `main.ts` doesn't enable `rawBody`, so `req.rawBody` is always `undefined`, causing all webhooks to fail verification
2. **Synchronous processing**: Events are processed inline in the request handler, risking Stripe's 5-second timeout
3. **No error handling**: Missing try/catch blocks, no proper HTTP status codes for failures
4. **Monolithic switch statement**: Adding new event types requires modifying the controller, violating Open/Closed Principle
5. **No retry mechanism**: Failed handlers are lost; events are marked as "received" even if processing fails

The system needs to handle 5 essential Stripe events:
- `checkout.session.completed` - Activate subscription or add addon credits
- `invoice.paid` - Reset credits on recurring payments
- `invoice.payment_failed` - Mark subscription as PAST_DUE
- `customer.subscription.updated` - Sync plan changes and period dates
- `customer.subscription.deleted` - Cancel subscription, freeze addon credits

## Goals / Non-Goals

**Goals:**
- Fix critical webhook bugs (rawBody, error handling, status codes)
- Implement Strategy Pattern for extensible event handling
- Add async processing with DB polling and automatic retry
- Handle all 5 essential Stripe events with proper business logic
- Maintain strict ACID transactions for all billing state changes
- Ensure idempotency for duplicate events
- Add comprehensive test coverage

**Non-Goals:**
- Do NOT add Redis/Bull queue (DB polling is sufficient for current scale)
- Do NOT handle all possible Stripe events (only the 5 essential ones)
- Do NOT add real-time notifications or webhooks to clients
- Do NOT change existing API contracts (backward compatibility)
- Do NOT implement trial period logic (not currently in use)

## Decisions

### 1. Strategy Pattern for Event Handling

**Decision**: Use Strategy Pattern with `WebhookStrategyInterface` and `WebhookStrategyFactory`

**Rationale**:
- **Open/Closed Principle**: Add new event types by creating new strategy files without modifying existing code
- **Single Responsibility**: Each strategy handles one event type (or one scenario within an event type)
- **Testability**: Each strategy can be unit tested independently
- **Maintainability**: Clear separation of concerns, easy to locate event-specific logic

**Alternatives Considered**:
- **Handler functions in service**: Simpler but violates SRP, hard to test
- **Event emitter pattern**: Over-engineered for this use case, adds complexity
- **Switch statement (current)**: Already proven to be unmaintainable

### 2. Async Processing with DB Polling

**Decision**: Store events in `WebhookEvent` table with status tracking, process via NestJS `@Cron` job polling every 30 seconds

**Rationale**:
- **Resilience**: Acknowledge events immediately (Stripe happy), process asynchronously
- **Retry capability**: Failed events can be retried with fixed interval (1 day, max 3 attempts)
- **No Redis dependency**: Fits existing stack (PostgreSQL only)
- **Simplicity**: No external message broker, easier to deploy and maintain

**Alternatives Considered**:
- **Bull/BullMQ with Redis**: More robust but adds infrastructure dependency
- **Synchronous processing**: Already proven to be risky (timeouts, no retries)
- **Webhook forwarding to SQS/SNS**: Over-engineered for current scale

### 3. Fixed Interval Retry Strategy (1 Day, Max 3 Attempts)

**Decision**: 3 retry attempts with fixed interval (every 1 day), then cancel subscription and downgrade to FREE tier

**Rationale**:
- **Business requirement**: Payment failures need quick resolution to minimize service disruption
- **User-friendly**: 3-day grace period before service cancellation
- **Clear outcome**: After max retries, subscription is canceled and user downgraded to FREE
- **Predictable**: Fixed interval is easier to understand than exponential backoff

**Alternatives Considered**:
- **Exponential backoff**: Too complex for payment failures, users need quick resolution
- **No retries**: Too strict, temporary payment issues would immediately cancel subscriptions
- **Infinite retries**: Would keep failed subscriptions in limbo indefinitely

**Implementation**:
- Retry 1: day 1 after first failure
- Retry 2: day 2 after first failure
- Retry 3: day 3 after first failure
- After retry 3 fails: cancel subscription, downgrade to FREE tier, freeze addon credits permanently

### 4. Internal Branching for Multi-Scenario Events

**Decision**: Single strategy per event type, with internal branching based on event context (e.g., `invoice.paid` branches on subscription vs addon)

**Rationale**:
- **Simplicity**: Fewer strategy files, easier to understand
- **Cohesion**: Related logic stays together
- **Flexibility**: Can extract sub-strategies later if complexity grows

**Alternatives Considered**:
- **Sub-strategies per scenario**: More files, but clearer separation (rejected: premature optimization)
- **Separate strategies per metadata type**: Hard to maintain, logic scattered

### 5. Concurrency Control with FOR UPDATE SKIP LOCKED

**Decision**: Use PostgreSQL row-level locking (`FOR UPDATE SKIP LOCKED`) to prevent double-processing in multi-instance deployments

**Rationale**:
- **Safety**: Multiple app instances won't process the same event twice
- **Performance**: Non-blocking lock, other instances skip locked rows
- **Simplicity**: Built into PostgreSQL, no external coordination needed

**Alternatives Considered**:
- **Application-level locking**: Doesn't work across multiple instances
- **Distributed lock (Redis)**: Adds dependency, overkill for this use case
- **No locking**: Risk of duplicate processing

### 6. Schema Changes to WebhookEvent Model

**Decision**: Add status tracking fields (`status`, `retryCount`, `maxRetries`, `nextRetryAt`, `lastError`)

**Rationale**:
- **Visibility**: Can query DB to see which events are pending, processing, done, or failed
- **Retry logic**: Fields track retry state and schedule next attempt
- **Debugging**: `lastError` field stores failure reason for troubleshooting
- **Backward compatibility**: Existing `processedAt` field becomes nullable (set on success)

**Alternatives Considered**:
- **Separate queue table**: More complex, unnecessary duplication
- **JSON metadata field**: Less queryable, harder to index

## Risks / Trade-offs

### Risk 1: DB Polling Overhead

**Risk**: Polling every 30 seconds adds database load, especially with many pending events

**Mitigation**:
- Limit query to 20 events per poll (`LIMIT 20`)
- Use efficient indexing on `(status, nextRetryAt)`
- Monitor query performance, adjust interval if needed
- Current scale (low volume) makes this acceptable

### Risk 2: Event Processing Latency

**Risk**: Events are processed up to 30 seconds after receipt (polling interval)

**Mitigation**:
- Acceptable for most use cases (credits don't need to be instant)
- Can reduce polling interval to 10 seconds if needed
- Stripe's own retry mechanism provides additional safety net

### Risk 3: Strategy Discovery and Registration

**Risk**: Forgetting to register a new strategy in `BillingModule` causes events to be silently ignored

**Mitigation**:
- Use NestJS dependency injection with `@Inject('WEBHOOK_STRATEGIES')` pattern
- Add validation in processor: log warning if event type has no matching strategy
- Add unit tests that verify all strategies are registered

### Risk 4: Handler Failures Masking Real Issues

**Risk**: Retry mechanism could hide permanent bugs (e.g., logic errors, missing data)

**Mitigation**:
- After 3 retries (over 3 days), cancel subscription and downgrade to FREE tier
- Add monitoring/alerting for CANCELED subscriptions due to payment failures
- Provide admin endpoint to view failed events and manually retry

### Risk 5: Migration Complexity

**Risk**: Schema changes to `WebhookEvent` require migration, existing events need status assignment

**Mitigation**:
- Migration script sets all existing events to `DONE` (assume processed)
- Test migration on staging environment first
- Provide rollback script if needed

### Risk 6: Stripe API Version Compatibility

**Risk**: Stripe API version `2026-06-24.dahlia` may have different event payload structures

**Mitigation**:
- Use Stripe SDK types for type safety
- Test with actual Stripe test events
- Document expected payload structure in each strategy

## Migration Plan

### Phase 1: Database Migration

1. Run Prisma migration to update `WebhookEvent` schema
2. Add `WebhookStatus` enum
3. Set all existing events to `status: DONE`

### Phase 2: Enable rawBody

1. Update `main.ts` to enable `rawBody: true`
2. Deploy and verify signature verification works

### Phase 3: Deploy Strategy Infrastructure

1. Create `WebhookStrategyInterface` and `WebhookStrategyFactory`
2. Create `WebhookProcessorService` with cron job
3. Deploy but don't activate (feature flag or environment variable)

### Phase 4: Implement Strategies

1. Implement 5 event strategies one by one
2. Test each strategy with Stripe test events
3. Deploy with feature flag enabled

### Phase 5: Simplify Controller

1. Remove switch statement from `StripeWebhookController`
2. Controller now only verifies signature, stores event, returns 200
3. Deploy final version

### Rollback Strategy

If issues arise:
1. Disable feature flag (revert to old controller logic)
2. Processor stops polling (or continue processing from DB)
3. Fix issues and redeploy

## Open Questions

### Q1: Is @nestjs/schedule already installed?

**Status**: Need to check `package.json`
**Impact**: If not installed, need to add dependency

### Q2: Multi-instance deployment?

**Status**: Unknown if app runs as single or multiple instances
**Impact**: If multi-instance, `FOR UPDATE SKIP LOCKED` is critical. If single-instance, simpler locking is fine.

### Q3: Monitoring and alerting for FAILED events?

**Status**: Not in scope for this change
**Impact**: Should add admin endpoint or dashboard to view failed events

### Q4: What if Stripe sends an event we don't handle?

**Status**: Processor should log warning and mark as DONE (no retry)
**Impact**: Prevents infinite retries for unsupported events

### Q5: How to handle partial failures in strategies?

**Status**: If a strategy throws an error, mark event for retry
**Impact**: Next attempt will retry the entire event (idempotency ensures safety)

## Files Impacted

### New Files (14 files)

```
src/billing/strategies/
├─ webhook-strategy.interface.ts
├─ webhook-strategy.factory.ts
├─ checkout/
│  └─ checkout-session-completed.strategy.ts
├─ invoice/
│  ├─ invoice-paid.strategy.ts
│  └─ invoice-payment-failed.strategy.ts
└─ subscription/
   ├─ customer-subscription-updated.strategy.ts
   └─ customer-subscription-deleted.strategy.ts

src/billing/
└─ webhook-processor.service.ts

src/billing/__tests__/
├─ webhook-processor.service.spec.ts
├─ stripe-webhook.controller.spec.ts
└─ strategies/
   ├─ checkout-session-completed.strategy.spec.ts
   ├─ invoice-paid.strategy.spec.ts
   ├─ invoice-payment-failed.strategy.spec.ts
   ├─ customer-subscription-updated.strategy.spec.ts
   └─ customer-subscription-deleted.strategy.spec.ts
```

### Modified Files (5 files)

```
src/main.ts                              ◄── Enable rawBody: true
prisma/schema.prisma                     ◄── Update WebhookEvent model + enum
src/billing/stripe-webhook.controller.ts ◄── Simplify to receive + store only
src/billing/billing.module.ts            ◄── Register strategies + processor
src/billing/billing.service.ts           ◄── Refactor handlers (if needed)
```

## Event Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WEBHOOK REQUEST FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Stripe ──POST──▶ /billing/webhook                                          │
│                     │                                                       │
│                     ▼                                                       │
│         ┌─────────────────────┐                                             │
│         │  Verify Signature   │──fail──▶ return 400 BadRequest              │
│         │  (rawBody required) │                                             │
│         └──────────┬──────────┘                                             │
│                    │                                                        │
│                    ▼                                                        │
│         ┌─────────────────────┐                                             │
│         │  Idempotency Check  │──dup───▶ return 200 {duplicate: true}       │
│         │  (stripeEventId)    │                                             │
│         └──────────┬──────────┘                                             │
│                    │                                                        │
│                    ▼                                                        │
│         ┌──────────────────────────┐                                        │
│         │  Store WebhookEvent      │                                        │
│         │  status: PENDING         │                                        │
│         │  retryCount: 0           │                                        │
│         │  nextRetryAt: now()      │                                        │
│         └──────────┬───────────────┘                                        │
│                    │                                                        │
│                    ▼                                                        │
│         return 200 {received: true}  ◄── Stripe happy, request done         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    BACKGROUND PROCESSOR (Cron: */30 * * * * *)              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SELECT * FROM webhook_events                                               │
│  WHERE status = 'PENDING'                                                   │
│    AND next_retry_at <= now()                                               │
│  FOR UPDATE SKIP LOCKED                                                     │
│  LIMIT 20                                                                   │
│                                                                             │
│  For each event:                                                            │
│    ┌─────────────────────────────────┐                                      │
│    │  Mark status: PROCESSING        │                                      │
│    │  Get strategy from factory      │                                      │
│    └─────────────┬───────────────────┘                                      │
│                  │                                                          │
│            ┌─────┴─────┐                                                    │
│            │           │                                                    │
│            ▼           ▼                                                    │
│        success      failure                                                 │
│            │           │                                                    │
│            ▼           ▼                                                    │
│      status: DONE   retryCount++                                           │
│                     nextRetryAt = now + backoff(retryCount)                 │
│                     if retryCount >= 5:                                     │
│                       status: FAILED                                        │
│                       lastError: error.message                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         STRATEGY DISPATCH                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  WebhookStrategyFactory                                                     │
│  ├─ getStrategy(eventType: string): WebhookStrategyInterface               │
│  └─ strategies[] (injected via DI)                                          │
│                                                                             │
│  Event: checkout.session.completed                                          │
│  └─ CheckoutSessionCompletedStrategy                                        │
│     ├─ if (metadata.type === 'addon') → addAddonCredits()                   │
│     └─ else → activateSubscription()                                        │
│                                                                             │
│  Event: invoice.paid                                                        │
│  └─ InvoicePaidStrategy                                                     │
│     ├─ if (invoice.subscription) → resetPlanCredits()                       │
│     └─ else → log warning (unhandled scenario)                              │
│                                                                             │
│  Event: invoice.payment_failed                                              │
│  └─ InvoicePaymentFailedStrategy                                            │
│     └─ markSubscriptionPastDue()                                            │
│                                                                             │
│  Event: customer.subscription.updated                                       │
│  └─ CustomerSubscriptionUpdatedStrategy                                     │
│     ├─ syncPlanType()                                                       │
│     └─ syncPeriodDates()                                                    │
│                                                                             │
│  Event: customer.subscription.deleted                                       │
│  └─ CustomerSubscriptionDeletedStrategy                                     │
│     ├─ cancelSubscription()                                                 │
│     └─ freezeAddonCredits()                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Retry Schedule

```
Retry 1:  1 day after first failure (subscription remains PAST_DUE, credits frozen)
Retry 2:  2 days after first failure (subscription remains PAST_DUE, credits frozen)
Retry 3:  3 days after first failure (subscription remains PAST_DUE, credits frozen)
After 3:  Cancel subscription, downgrade to FREE tier, freeze addon credits permanently
```
