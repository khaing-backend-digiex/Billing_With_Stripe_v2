## MODIFIED Requirements

### Requirement: Background Processor Polling
The system SHALL run a background processor that polls the database every 30 seconds for events with `status: PENDING` and `nextRetryAt <= now()`. The processor SHALL log comprehensive information about event processing lifecycle.

#### Scenario: Processor finds pending events
- **GIVEN** there are events with `status: PENDING` and `nextRetryAt <= now()`
- **WHEN** the processor runs
- **THEN** it SHALL fetch up to 20 events ordered by `nextRetryAt`
- **AND** SHALL use `FOR UPDATE SKIP LOCKED` to prevent concurrent processing
- **AND** SHALL log the count of pending events found
- **AND** SHALL log each event's ID and type before processing

#### Scenario: Processor finds no pending events
- **GIVEN** there are no events with `status: PENDING` and `nextRetryAt <= now()`
- **WHEN** the processor runs
- **THEN** it SHALL complete without error
- **AND** SHALL wait for the next polling interval
- **AND** SHALL NOT log anything (no noise when idle)

#### Scenario: Processor skips locked events
- **GIVEN** another processor instance is currently processing events
- **WHEN** this processor instance runs
- **THEN** it SHALL skip events locked by the other instance
- **AND** SHALL only process unlocked events

### Requirement: Event Processing Dispatch
The processor SHALL look up the appropriate strategy for each event via the `WebhookStrategyFactory` and dispatch processing to it. The processor SHALL log processing start, completion, and failures with full context.

#### Scenario: Event dispatched to matching strategy
- **GIVEN** a pending event with type `invoice.paid`
- **WHEN** the processor processes the event
- **THEN** it SHALL set `status: PROCESSING`
- **AND** SHALL log "Processing event: {eventId} ({eventType})"
- **AND** SHALL call `InvoicePaidStrategy.handle(event)`
- **AND** on success, SHALL set `status: DONE` and `processedAt: now()`
- **AND** SHALL log "Event processed successfully: {eventId} ({eventType})"

#### Scenario: Event with no matching strategy
- **GIVEN** a pending event with an unsupported type
- **WHEN** the processor processes the event
- **THEN** it SHALL log a warning with the event type and ID
- **AND** SHALL log "⚠️ UNHANDLED EVENT: {eventType} (id: {eventId}) - No strategy registered"
- **AND** SHALL log the event payload field names (not values) to help identify what data is available
- **AND** SHALL set `status: DONE` (no retry for unsupported events)

#### Scenario: Event processing fails
- **GIVEN** a pending event being processed
- **WHEN** the strategy's `handle()` method throws an error
- **THEN** the processor SHALL increment `retryCount`
- **AND** SHALL set `lastError` to the error message
- **AND** SHALL calculate `nextRetryAt` using fixed interval (1 day)
- **AND** SHALL log "Event processing failed: {eventId} ({eventType}) - {errorMessage}"

### Requirement: Webhook Entry Point Logging
The webhook controller SHALL log every incoming event immediately after signature verification, capturing the event ID, type, and timestamp. This provides visibility into what events Stripe is actually sending.

#### Scenario: Valid webhook event received
- **GIVEN** a webhook request with a valid signature
- **WHEN** the event is verified and before it is stored
- **THEN** the controller SHALL log "Webhook received: id={eventId}, type={eventType}, timestamp={timestamp}"
- **AND** SHALL log the event payload summary with key fields specific to the event type

#### Scenario: Duplicate webhook event received
- **GIVEN** an event with the same `stripeEventId` already exists in the database
- **WHEN** the same event is received again
- **THEN** the controller SHALL log "Duplicate webhook ignored: id={eventId}, type={eventType}"
- **AND** SHALL NOT create a duplicate record
- **AND** SHALL return `{ received: true, duplicate: true }`

#### Scenario: Invalid signature rejected
- **GIVEN** a webhook request with an invalid `stripe-signature` header
- **WHEN** the signature is verified against the raw body
- **THEN** the verification SHALL throw an error
- **AND** the controller SHALL log "Webhook signature verification failed: {error}"
- **AND** the controller SHALL return HTTP 400

### Requirement: Event Payload Summary Logging
The system SHALL extract and log key fields from webhook event payloads to provide actionable debugging information without exposing sensitive data. The summary SHALL be type-specific and include business-relevant identifiers.

#### Scenario: Checkout session completed event summary
- **GIVEN** a `checkout.session.completed` event
- **WHEN** the event is logged
- **THEN** the summary SHALL include: sessionId, customerId, mode, subscriptionId (if present)
- **AND** SHALL NOT include raw payment data or customer PII

#### Scenario: Invoice paid event summary
- **GIVEN** an `invoice.paid` event
- **WHEN** the event is logged
- **THEN** the summary SHALL include: invoiceId, subscriptionId, amountPaid, amountDue, status
- **AND** SHALL NOT include customer billing address or payment method details

#### Scenario: Customer subscription event summary
- **GIVEN** a `customer.subscription.created`, `updated`, or `deleted` event
- **WHEN** the event is logged
- **THEN** the summary SHALL include: subscriptionId, customerId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd
- **AND** SHALL NOT include customer PII or payment method details

#### Scenario: Payment intent event summary
- **GIVEN** a `payment_intent.succeeded` or `payment_intent.payment_failed` event
- **WHEN** the event is logged
- **THEN** the summary SHALL include: paymentIntentId, customerId, amount, status
- **AND** SHALL NOT include card numbers, CVV, or other PCI-scoped data

#### Scenario: Unknown event type summary
- **GIVEN** an event with an unknown or unhandled type
- **WHEN** the event is logged
- **THEN** the summary SHALL include all top-level field names (keys only, not values)
- **AND** SHALL NOT include any field values to avoid exposing sensitive data

### Requirement: Hourly Webhook Statistics
The system SHALL run a background job every hour that aggregates webhook event statistics and logs a summary of event types, counts, and processing status over the last 24 hours.

#### Scenario: Hourly statistics logged
- **GIVEN** the hourly statistics job runs
- **WHEN** it queries the webhook_events table
- **THEN** it SHALL aggregate events by type and status
- **AND** SHALL log "📊 Webhook Event Statistics (last 24h):"
- **AND** SHALL log each event type with counts: total, processed (DONE), pending (PENDING), failed (FAILED)
- **AND** SHALL order results by total count descending

#### Scenario: No events in last 24 hours
- **GIVEN** the hourly statistics job runs
- **WHEN** there are no events in the last 24 hours
- **THEN** it SHALL log "📊 Webhook Event Statistics (last 24h): No events received"

#### Scenario: Statistics query performance
- **GIVEN** the hourly statistics job runs
- **WHEN** it queries for statistics
- **THEN** the query SHALL complete in under 100ms
- **AND** SHALL use indexed columns (type, status, createdAt)
- **AND** SHALL NOT lock the table
