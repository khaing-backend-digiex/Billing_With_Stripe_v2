## Context

The webhook system receives events from Stripe but has no visibility into what's actually arriving. The `webhook_events` table is empty, making it impossible to determine whether events are being received, what types they are, or why they're not being processed. This change adds comprehensive logging to provide full observability of the webhook flow.

## Goals / Non-Goals

**Goals:**
- Log every incoming webhook event at the entry point (event ID, type, timestamp)
- Log event payload summaries with key fields specific to each event type
- Log the complete processing lifecycle (received, processing, completed, failed)
- Warn on unhandled/unknown event types
- Provide hourly statistics of event types and frequencies

**Non-Goals:**
- Change webhook processing logic or add new event handlers
- Modify the database schema or event storage mechanism
- Implement actual handling for currently unhandled events (that's a separate decision)
- Log sensitive payment data (PCI compliance)

## Decisions

### 1. Where to add logging

**Decision:** Add logs at three levels:
- **Controller entry point** (`stripe-webhook.controller.ts`): Log every event immediately after signature verification
- **Processor lifecycle** (`webhook-processor.service.ts`): Log processing start, completion, and failures
- **Strategy execution**: Log event-specific summaries in each strategy implementation

**Rationale:**
- Controller entry logging captures ALL events, even unhandled ones, before any processing logic
- Processor logging tracks the async processing flow
- Strategy logging provides context-specific details for debugging business logic

**Alternative considered:** Log everything in the processor only. Rejected because we need to see events at the HTTP layer to diagnose whether they're even reaching the system.

### 2. What to log per event type

**Decision:** Extract and log key fields per event type:
- `checkout.session.completed`: sessionId, customerId, mode, subscriptionId
- `invoice.paid` / `invoice.payment_failed`: invoiceId, subscriptionId, amountPaid, amountDue, status
- `customer.subscription.*`: subscriptionId, customerId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd
- `payment_intent.*`: paymentIntentId, customerId, amount, status
- Unknown types: Log all top-level field names (but not values) to identify what data is available

**Rationale:**
- Logging specific fields provides actionable debugging info without bloating logs
- For unknown types, logging field names helps us understand what data is available without exposing potentially sensitive values
- Avoids logging raw payloads which could contain sensitive data

**Alternative considered:** Log full JSON payloads. Rejected due to verbosity and security concerns (payment data, customer PII).

### 3. How to extract event summaries

**Decision:** Create a private helper method `extractEventSummary()` in the controller that takes event type and payload, returning a summary object with type-specific fields.

**Rationale:**
- Centralizes summary extraction logic in one place
- Easy to extend for new event types
- Keeps controller code clean and testable

**Alternative considered:** Add summary extraction to each strategy. Rejected because we need to log summaries at the controller level (before strategy routing) to capture unhandled events.

### 4. Hourly statistics

**Decision:** Add a new cron job in `webhook-processor.service.ts` that runs hourly and queries the `webhook_events` table to aggregate event counts by type and status.

**Rationale:**
- Provides visibility into event patterns over time
- Helps identify which events are most common
- Shows processing success/failure rates
- Minimal performance impact (single aggregation query)

**Alternative considered:** Real-time metrics dashboard. Rejected as overkill for current needs; hourly logs are sufficient for debugging and pattern identification.

### 5. Log format

**Decision:** Use structured logging with the existing AppLogger. Log messages should be human-readable but include key identifiers for grep/search:
```
[StripeWebhookController] Webhook received: id=evt_123, type=checkout.session.completed
[StripeWebhookController] Event details: {"sessionId":"cs_456","customerId":"cus_789","mode":"subscription"}
[WebhookProcessorService] Processing event: evt_123 (checkout.session.completed)
[CheckoutSessionCompletedStrategy] Checkout completed: sessionId=cs_456, customerId=cus_789, mode=subscription
[WebhookProcessorService] Event processed: evt_123 (checkout.session.completed)
[WebhookProcessorService] ⚠️ UNHANDLED EVENT: payment_method.attached (id: evt_999) - No strategy registered
```

**Rationale:**
- Consistent with existing logging patterns
- Easy to grep and parse
- Includes event IDs for tracing across log lines
- Human-readable format for quick debugging

## Risks / Trade-offs

**[Risk] Log verbosity could overwhelm logs**
→ **Mitigation:** Log summaries (not full payloads) and use structured logging. Hourly stats provide aggregate view without per-event noise.

**[Risk] Logging sensitive data**
→ **Mitigation:** Only log business-relevant fields (IDs, statuses, amounts). Never log raw payment data, customer PII, or full payloads. For unknown event types, log field names only.

**[Risk] Performance impact from logging**
→ **Mitigation:** Minimal impact - logging is fast, and we're not adding any blocking operations. Hourly stats query is lightweight (single aggregation).

**[Trade-off] Logging at controller level means we log events before we know if they're duplicates**
→ **Acceptable because:** We need to see ALL events to understand the flow. Duplicate detection happens after logging, so we'll see the event logged even if it's a duplicate (which is fine for debugging).

**[Trade-off] Hourly stats add a new cron job**
→ **Acceptable because:** Minimal overhead (one query per hour), and provides valuable aggregate visibility. Can be disabled if needed.
