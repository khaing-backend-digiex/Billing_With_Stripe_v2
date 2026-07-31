## ADDED Requirements

### Requirement: Webhook Event Schema
The `WebhookEvent` model SHALL include fields for async processing: `status` (enum: PENDING, PROCESSING, DONE, FAILED), `retryCount` (Int, default 0), `maxRetries` (Int, default 3), `nextRetryAt` (DateTime), `lastError` (String, optional), and `processedAt` (DateTime, nullable).

#### Scenario: New event stored with initial state
- **GIVEN** a verified Stripe webhook event that has not been seen before
- **WHEN** the event is stored in the database
- **THEN** the event SHALL be created with `status: PENDING`
- **AND** `retryCount: 0`
- **AND** `maxRetries: 3`
- **AND** `nextRetryAt: now()`
- **AND** `processedAt: null`

#### Scenario: Duplicate event is not stored
- **GIVEN** an event with the same `stripeEventId` already exists in the database
- **WHEN** the same event is received again
- **THEN** the system SHALL NOT create a duplicate record
- **AND** SHALL return `{ received: true, duplicate: true }`

#### Scenario: WebhookStatus enum values
- **GIVEN** the `WebhookStatus` enum
- **WHEN** the enum is used in the application
- **THEN** it SHALL have exactly 4 values: `PENDING`, `PROCESSING`, `DONE`, `FAILED`

### Requirement: Background Processor Polling
The system SHALL run a background processor that polls the database every 30 seconds for events with `status: PENDING` and `nextRetryAt <= now()`.

#### Scenario: Processor finds pending events
- **GIVEN** there are events with `status: PENDING` and `nextRetryAt <= now()`
- **WHEN** the processor runs
- **THEN** it SHALL fetch up to 20 events ordered by `nextRetryAt`
- **AND** SHALL use `FOR UPDATE SKIP LOCKED` to prevent concurrent processing

#### Scenario: Processor finds no pending events
- **GIVEN** there are no events with `status: PENDING` and `nextRetryAt <= now()`
- **WHEN** the processor runs
- **THEN** it SHALL complete without error
- **AND** SHALL wait for the next polling interval

#### Scenario: Processor skips locked events
- **GIVEN** another processor instance is currently processing events
- **WHEN** this processor instance runs
- **THEN** it SHALL skip events locked by the other instance
- **AND** SHALL only process unlocked events

### Requirement: Event Processing Dispatch
The processor SHALL look up the appropriate strategy for each event via the `WebhookStrategyFactory` and dispatch processing to it.

#### Scenario: Event dispatched to matching strategy
- **GIVEN** a pending event with type `invoice.paid`
- **WHEN** the processor processes the event
- **THEN** it SHALL set `status: PROCESSING`
- **AND** SHALL call `InvoicePaidStrategy.handle(event)`
- **AND** on success, SHALL set `status: DONE` and `processedAt: now()`

#### Scenario: Event with no matching strategy
- **GIVEN** a pending event with an unsupported type
- **WHEN** the processor processes the event
- **THEN** it SHALL log a warning with the event type
- **AND** SHALL set `status: DONE` (no retry for unsupported events)

#### Scenario: Event processing fails
- **GIVEN** a pending event being processed
- **WHEN** the strategy's `handle()` method throws an error
- **THEN** the processor SHALL increment `retryCount`
- **AND** SHALL set `lastError` to the error message
- **AND** SHALL calculate `nextRetryAt` using fixed interval (1 day)

### Requirement: Fixed Interval Retry (Every 1 Day, Max 3 Attempts)
The system SHALL implement fixed-interval retry for failed event processing: retry every 1 day, maximum 3 attempts. After 3 failures (3 days), the subscription SHALL be canceled and downgraded to FREE tier.

#### Scenario: First retry after 1 day
- **GIVEN** an event fails processing with `retryCount: 0`
- **WHEN** the failure is handled
- **THEN** `retryCount` SHALL become 1
- **AND** `nextRetryAt` SHALL be set to `now() + 1 day`
- **AND** `status` SHALL remain `PENDING`
- **AND** the subscription SHALL remain `PAST_DUE`
- **AND** credits SHALL remain frozen

#### Scenario: Second retry after 2 days
- **GIVEN** an event fails processing with `retryCount: 1`
- **WHEN** the failure is handled
- **THEN** `retryCount` SHALL become 2
- **AND** `nextRetryAt` SHALL be set to `now() + 1 day`
- **AND** the subscription SHALL remain `PAST_DUE`
- **AND** credits SHALL remain frozen

#### Scenario: Third retry after 3 days
- **GIVEN** an event fails processing with `retryCount: 2`
- **WHEN** the failure is handled
- **THEN** `retryCount` SHALL become 3
- **AND** `nextRetryAt` SHALL be set to `now() + 1 day`
- **AND** the subscription SHALL remain `PAST_DUE`
- **AND** credits SHALL remain frozen

#### Scenario: Max retries exceeded - cancel subscription
- **GIVEN** an event fails processing with `retryCount: 3` (equals `maxRetries`)
- **WHEN** the failure is handled
- **THEN** `status` SHALL be set to `FAILED`
- **AND** `lastError` SHALL contain the final error message
- **AND** the subscription SHALL transition to `status: CANCELED`
- **AND** the user SHALL be downgraded to FREE tier
- **AND** plan credits SHALL be reset to FREE tier allowance (50)
- **AND** addon credits SHALL remain frozen permanently

### Requirement: Webhook Signature Verification
The system SHALL verify Stripe webhook signatures using the raw request body and the `stripe-signature` header. Verification SHALL use the `STRIPE_WEBHOOK_SECRET` environment variable.

#### Scenario: Valid signature accepted
- **GIVEN** a webhook request with a valid `stripe-signature` header
- **WHEN** the signature is verified against the raw body
- **THEN** the verification SHALL succeed
- **AND** the Stripe event SHALL be returned

#### Scenario: Invalid signature rejected
- **GIVEN** a webhook request with an invalid `stripe-signature` header
- **WHEN** the signature is verified against the raw body
- **THEN** the verification SHALL throw an error
- **AND** the controller SHALL return HTTP 400

#### Scenario: Missing signature rejected
- **GIVEN** a webhook request without a `stripe-signature` header
- **WHEN** the signature is verified
- **THEN** the verification SHALL throw an error
- **AND** the controller SHALL return HTTP 400

### Requirement: Raw Body Configuration
The system SHALL enable `rawBody: true` in the NestJS application configuration to preserve the raw request body for Stripe signature verification.

#### Scenario: Raw body available in webhook controller
- **GIVEN** the application is running with `rawBody: true`
- **WHEN** a webhook request is received
- **THEN** `req.rawBody` SHALL contain the unparsed request body as a Buffer
- **AND** the body SHALL be convertible to a string for signature verification

### Requirement: Idempotency
The system SHALL ensure that duplicate webhook events are detected and not processed more than once, using the `stripeEventId` as the unique identifier.

#### Scenario: First occurrence processed
- **GIVEN** a Stripe event has not been received before
- **WHEN** the event is received via webhook
- **THEN** the event SHALL be stored in the database
- **AND** the event SHALL be processed by the appropriate strategy

#### Scenario: Duplicate occurrence skipped
- **GIVEN** a Stripe event with the same `stripeEventId` was previously stored
- **WHEN** the same event is received again
- **THEN** the event SHALL NOT be stored again
- **AND** the processor SHALL NOT process the event
- **AND** the controller SHALL return `{ received: true, duplicate: true }`

### Requirement: ACID Transactions for Billing State
The system SHALL use Prisma transactions for all billing and subscription state changes triggered by webhook events, ensuring strict ACID properties.

#### Scenario: Subscription activation is atomic
- **GIVEN** a `checkout.session.completed` event for a subscription
- **WHEN** the subscription is activated
- **THEN** the subscription record creation, credit reset, and status update SHALL occur in a single transaction
- **AND** if any step fails, the entire transaction SHALL be rolled back

#### Scenario: Credit reset is atomic
- **GIVEN** an `invoice.paid` event for a recurring subscription
- **WHEN** plan credits are reset
- **THEN** the credit balance update SHALL occur in a transaction
- **AND** SHALL not be partially applied

### Requirement: HTTP Response Codes
The webhook endpoint SHALL return appropriate HTTP status codes for all scenarios.

#### Scenario: Successful event receipt
- **GIVEN** a valid webhook event is received and stored
- **WHEN** processing completes
- **THEN** the endpoint SHALL return HTTP 200 with `{ received: true }`

#### Scenario: Duplicate event receipt
- **GIVEN** a duplicate webhook event is received
- **WHEN** the idempotency check detects the duplicate
- **THEN** the endpoint SHALL return HTTP 200 with `{ received: true, duplicate: true }`

#### Scenario: Invalid signature
- **GIVEN** a webhook request with an invalid signature
- **WHEN** signature verification fails
- **THEN** the endpoint SHALL return HTTP 400

#### Scenario: Internal processing error
- **GIVEN** a webhook event is received with valid signature
- **WHEN** an unexpected error occurs during event storage
- **THEN** the endpoint SHALL return HTTP 500
- **AND** Stripe SHALL retry the event
