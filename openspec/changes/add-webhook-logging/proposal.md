## Why

The webhook system currently has no visibility into what events Stripe is actually sending. The `webhook_events` table is empty, making it impossible to debug whether events are arriving, what types they are, or why they're not being processed. We need comprehensive logging to observe the full webhook flow and make informed decisions about which events to handle.

## What Changes

- Add logging at webhook entry point to capture every incoming event (ID, type, timestamp)
- Log event payload summaries with key fields per event type
- Add warnings for unhandled/unknown event types
- Log processing lifecycle (received, processing, completed, failed)
- Add hourly statistics summary of event types and frequencies

## Capabilities

### New Capabilities

(None - this is an observability enhancement to existing webhook infrastructure, not a new capability)

### Modified Capabilities

- `webhook-async-processor`: Add comprehensive logging for event processing lifecycle
- `webhook-event-strategies`: Add logging for event handling and unhandled event warnings

## Impact

- **Code**: `src/billing/stripe-webhook.controller.ts`, `src/billing/webhook-processor.service.ts`, webhook strategy implementations
- **Observability**: Complete visibility into Stripe webhook events, processing status, and unhandled events
- **Performance**: Minimal - logging adds negligible overhead
- **Dependencies**: None - uses existing AppLogger infrastructure
- **Testing**: Existing webhook tests remain valid; logging is non-functional
