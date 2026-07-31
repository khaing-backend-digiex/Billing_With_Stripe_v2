## ADDED Requirements

### Requirement: Checkout Session Completed Strategy
The system SHALL handle `checkout.session.completed` events by activating subscriptions or adding addon credits based on session metadata. The strategy SHALL use `event.data.object` (the `Stripe.Checkout.Session` object provided directly in the webhook payload) without making additional API calls. The strategy SHALL branch internally based on `session.metadata.type`.

#### Scenario: Subscription checkout completed
- **GIVEN** a `checkout.session.completed` event with `metadata.planType` set (not `metadata.type === 'addon'`)
- **WHEN** the strategy processes the event
- **THEN** the strategy SHALL read the session from `event.data.object` as `Stripe.Checkout.Session`
- **AND** SHALL extract `userId` from `session.metadata.userId`
- **AND** SHALL extract `planType` from `session.metadata.planType`
- **AND** SHALL extract `stripeSubscriptionId` from `session.subscription`
- **AND** SHALL call `stripeService.getSubscription(stripeSubscriptionId)` to retrieve period dates
- **AND** SHALL set `currentPeriodStart` from `subscription.items.data[0].current_period_start` (Unix timestamp to DateTime)
- **AND** SHALL set `currentPeriodEnd` from `subscription.items.data[0].current_period_end` (Unix timestamp to DateTime)
- **AND** SHALL create a new subscription record with `status: ACTIVE`
- **AND** SHALL reset plan credits based on `planType`
- **AND** SHALL unfreeze addon credits if upgrading to PRO plan

#### Scenario: Addon checkout completed
- **GIVEN** a `checkout.session.completed` event with `metadata.type === 'addon'`
- **WHEN** the strategy processes the event
- **THEN** the strategy SHALL read the session from `event.data.object` as `Stripe.Checkout.Session`
- **AND** SHALL extract `userId` from `session.metadata.userId`
- **AND** SHALL parse `session.metadata.credits` as an integer
- **AND** SHALL extract `stripePaymentId` from `session.payment_intent`
- **AND** SHALL create an `AddonPurchase` record with `creditsGranted` and `stripePaymentId`
- **AND** SHALL add the credits to the user's addon credit balance

#### Scenario: User not found
- **GIVEN** a `checkout.session.completed` event with `metadata.userId`
- **WHEN** the user does not exist in the database
- **THEN** the strategy SHALL throw an error
- **AND** the event SHALL be marked for retry

#### Scenario: Transaction rollback on failure
- **GIVEN** a `checkout.session.completed` event being processed
- **WHEN** any step in the transaction fails (e.g., credit reset fails)
- **THEN** the entire transaction SHALL be rolled back
- **AND** no partial state changes SHALL persist

### Requirement: Invoice Paid Strategy
The system SHALL handle `invoice.paid` events by resetting plan credits for recurring subscription payments. The strategy SHALL branch based on whether the invoice is associated with a subscription.

#### Scenario: Subscription invoice paid
- **GIVEN** an `invoice.paid` event with `invoice.subscription` present
- **WHEN** the strategy processes the event
- **THEN** the strategy SHALL find the subscription by `stripeSubscriptionId`
- **AND** SHALL reset the user's plan credits to the monthly allowance (100 for PRO_MONTHLY)
- **AND** SHALL update `lastResetAt` timestamp

#### Scenario: Non-subscription invoice paid
- **GIVEN** an `invoice.paid` event without `invoice.subscription`
- **WHEN** the strategy processes the event
- **THEN** the strategy SHALL log a warning
- **AND** SHALL NOT throw an error (event marked as DONE)

#### Scenario: Subscription not found
- **GIVEN** an `invoice.paid` event with `invoice.subscription`
- **WHEN** no subscription record exists with the given `stripeSubscriptionId`
- **THEN** the strategy SHALL log a warning
- **AND** SHALL NOT throw an error (event marked as DONE)

#### Scenario: Credit reset fails
- **GIVEN** an `invoice.paid` event being processed
- **WHEN** the credit reset operation fails
- **THEN** the strategy SHALL throw an error
- **AND** the event SHALL be marked for retry

### Requirement: Invoice Payment Failed Strategy
The system SHALL handle `invoice.payment_failed` events by marking the associated subscription as `PAST_DUE` and freezing credits. The strategy SHALL use `event.data.object` (the `Stripe.Invoice` object provided directly in the webhook payload) without making additional API calls.

#### Scenario: Payment failed for active subscription
- **GIVEN** an `invoice.payment_failed` event with `invoice.subscription` present
- **WHEN** the strategy processes the event
- **THEN** the strategy SHALL read the invoice from `event.data.object` as `Stripe.Invoice`
- **AND** SHALL extract `subscriptionId` from `invoice.subscription`
- **AND** SHALL find the subscription by `stripeSubscriptionId`
- **AND** SHALL update the subscription `status` to `PAST_DUE`
- **AND** SHALL freeze the user's addon credits
- **AND** SHALL freeze the user's plan credits (user cannot use any credits while PAST_DUE)

#### Scenario: Credits frozen during PAST_DUE
- **GIVEN** a subscription with `status: PAST_DUE`
- **WHEN** the user attempts to use credits
- **THEN** the system SHALL deny the request
- **AND** SHALL return an error indicating credits are frozen due to failed payment

#### Scenario: Subscription not found
- **GIVEN** an `invoice.payment_failed` event with `invoice.subscription`
- **WHEN** no subscription record exists with the given `stripeSubscriptionId`
- **THEN** the strategy SHALL log a warning
- **AND** SHALL NOT throw an error (event marked as DONE)

#### Scenario: Database update fails
- **GIVEN** an `invoice.payment_failed` event being processed
- **WHEN** the subscription status update fails
- **THEN** the strategy SHALL throw an error
- **AND** the event SHALL be marked for retry

### Requirement: Customer Subscription Updated Strategy
The system SHALL handle `customer.subscription.updated` events by syncing plan changes and period date updates from Stripe. The strategy SHALL use `event.data.object` (the `Stripe.Subscription` object provided directly in the webhook payload) without making additional API calls.

#### Scenario: Plan type changed in Stripe
- **GIVEN** a `customer.subscription.updated` event where the subscription's price has changed
- **WHEN** the strategy processes the event
- **THEN** the strategy SHALL read the subscription from `event.data.object` as `Stripe.Subscription`
- **AND** SHALL extract `stripeSubscriptionId` from `subscription.id`
- **AND** SHALL determine the new `planType` from `subscription.items.data[0].price.metadata`
- **AND** SHALL update the local subscription record's `plan` field
- **AND** SHALL reset plan credits based on the new plan type

#### Scenario: Period dates updated
- **GIVEN** a `customer.subscription.updated` event with updated period dates
- **WHEN** the strategy processes the event
- **THEN** the strategy SHALL read the subscription from `event.data.object` as `Stripe.Subscription`
- **AND** SHALL extract `currentPeriodStart` from `subscription.items.data[0].current_period_start` (Unix timestamp to DateTime)
- **AND** SHALL extract `currentPeriodEnd` from `subscription.items.data[0].current_period_end` (Unix timestamp to DateTime)

#### Scenario: Subscription status changed
- **GIVEN** a `customer.subscription.updated` event where `subscription.status` has changed
- **WHEN** the strategy processes the event
- **THEN** the strategy SHALL read the subscription from `event.data.object` as `Stripe.Subscription`
- **AND** SHALL map `subscription.status` to local `SubStatus` enum
- **AND** SHALL update the local subscription's `status` field

#### Scenario: Subscription not found locally
- **GIVEN** a `customer.subscription.updated` event
- **WHEN** no local subscription exists with the given `stripeSubscriptionId`
- **THEN** the strategy SHALL log a warning
- **AND** SHALL NOT throw an error (event marked as DONE)

### Requirement: Customer Subscription Deleted Strategy
The system SHALL handle `customer.subscription.deleted` events by canceling the subscription and freezing addon credits. The strategy SHALL use `event.data.object` (the `Stripe.Subscription` object provided directly in the webhook payload) without making additional API calls.

#### Scenario: Subscription deleted by Stripe
- **GIVEN** a `customer.subscription.deleted` event
- **WHEN** the strategy processes the event
- **THEN** the strategy SHALL read the subscription from `event.data.object` as `Stripe.Subscription`
- **AND** SHALL extract `stripeSubscriptionId` from `subscription.id`
- **AND** SHALL find the local subscription by `stripeSubscriptionId`
- **AND** SHALL update the subscription `status` to `CANCELED`
- **AND** SHALL freeze the user's addon credits
- **AND** SHALL reset plan credits to the FREE tier allowance (50)

#### Scenario: Subscription not found
- **GIVEN** a `customer.subscription.deleted` event
- **WHEN** no local subscription exists with the given `stripeSubscriptionId`
- **THEN** the strategy SHALL log a warning
- **AND** SHALL NOT throw an error (event marked as DONE)

#### Scenario: Transaction rollback on failure
- **GIVEN** a `customer.subscription.deleted` event being processed
- **WHEN** any step in the transaction fails (e.g., credit freeze fails)
- **THEN** the entire transaction SHALL be rolled back
- **AND** no partial state changes SHALL persist

### Requirement: Strategy Event Type Matching
Each strategy SHALL implement `supports(eventType: string): boolean` to match exactly one Stripe event type.

#### Scenario: CheckoutSessionCompletedStrategy matches correct event
- **GIVEN** a `CheckoutSessionCompletedStrategy` instance
- **WHEN** `supports('checkout.session.completed')` is called
- **THEN** it SHALL return `true`

#### Scenario: CheckoutSessionCompletedStrategy rejects other events
- **GIVEN** a `CheckoutSessionCompletedStrategy` instance
- **WHEN** `supports('invoice.paid')` is called
- **THEN** it SHALL return `false`

#### Scenario: InvoicePaidStrategy matches correct event
- **GIVEN** an `InvoicePaidStrategy` instance
- **WHEN** `supports('invoice.paid')` is called
- **THEN** it SHALL return `true`

#### Scenario: InvoicePaymentFailedStrategy matches correct event
- **GIVEN** an `InvoicePaymentFailedStrategy` instance
- **WHEN** `supports('invoice.payment_failed')` is called
- **THEN** it SHALL return `true`

#### Scenario: CustomerSubscriptionUpdatedStrategy matches correct event
- **GIVEN** a `CustomerSubscriptionUpdatedStrategy` instance
- **WHEN** `supports('customer.subscription.updated')` is called
- **THEN** it SHALL return `true`

#### Scenario: CustomerSubscriptionDeletedStrategy matches correct event
- **GIVEN** a `CustomerSubscriptionDeletedStrategy` instance
- **WHEN** `supports('customer.subscription.deleted')` is called
- **THEN** it SHALL return `true`

### Requirement: Strategy Error Handling
Each strategy SHALL handle errors gracefully and provide descriptive error messages for debugging.

#### Scenario: Strategy logs context before throwing
- **GIVEN** a strategy processing an event
- **WHEN** an error occurs
- **THEN** the strategy SHALL log the event type and ID
- **AND** SHALL include relevant context (userId, subscriptionId, etc.)
- **AND** SHALL throw an error with a descriptive message

#### Scenario: Strategy handles missing required fields
- **GIVEN** a strategy processing an event
- **WHEN** a required field is missing from the event payload
- **THEN** the strategy SHALL throw an error indicating which field is missing
- **AND** the event SHALL be marked for retry

### Requirement: State Machine Transitions
The system SHALL enforce valid state transitions for subscription status based on webhook events and retry attempts.

#### Scenario: Subscription transitions to PAST_DUE on payment failure
- **GIVEN** a subscription with `status: ACTIVE`
- **WHEN** an `invoice.payment_failed` event is received
- **THEN** the subscription SHALL transition to `status: PAST_DUE`
- **AND** credits SHALL be frozen (user cannot use them)

#### Scenario: Subscription reactivation on successful payment
- **GIVEN** a subscription with `status: PAST_DUE`
- **WHEN** an `invoice.paid` event is received (payment retry succeeded)
- **THEN** the subscription SHALL transition to `status: ACTIVE`
- **AND** credits SHALL be unfrozen
- **AND** plan credits SHALL be reset

#### Scenario: Subscription cancellation after max retries
- **GIVEN** a subscription with `status: PAST_DUE`
- **AND** `retryCount: 3` (max retries reached after 3 days)
- **WHEN** the processor marks the event as FAILED
- **THEN** the subscription SHALL transition to `status: CANCELED`
- **AND** the user SHALL be downgraded to FREE tier
- **AND** plan credits SHALL be reset to FREE tier allowance (50)
- **AND** addon credits SHALL remain frozen permanently

#### Scenario: Invalid state transition rejected
- **GIVEN** a subscription with `status: CANCELED`
- **WHEN** an `invoice.paid` event is received
- **THEN** the strategy SHALL log a warning
- **AND** SHALL NOT attempt to reactivate a canceled subscription

#### Scenario: PAST_DUE retry timeline
- **GIVEN** a subscription transitions to `PAST_DUE` at day 0
- **WHEN** retry attempts occur
- **THEN** retry 1 SHALL occur at day 1
- **AND** retry 2 SHALL occur at day 2
- **AND** retry 3 SHALL occur at day 3
- **AND** after day 3 failure, subscription SHALL be canceled
