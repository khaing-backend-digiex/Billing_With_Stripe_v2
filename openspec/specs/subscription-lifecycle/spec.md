# Subscription Lifecycle

## Purpose
Manage the full lifecycle of user subscriptions, including checkout sessions, Stripe webhook handling, subscription state transitions, proration, and cross-tier changes.

## Requirements

### Requirement: User creates subscription checkout session
The system SHALL allow authenticated users to create Stripe Checkout sessions for subscribing to Free, Pro Monthly, or Pro Annual plans.

#### Scenario: Successful Free subscription checkout
- **WHEN**   user calls `POST /billing/checkout/subscription` with `{ plan: "FREE", currency: "VND" }`
- **THEN** system creates Stripe Checkout session with $0 price, returns session URL for redirect

#### Scenario: Successful Pro Monthly subscription checkout
- **WHEN** user calls `POST /billing/checkout/subscription` with `{ plan: "PRO_MONTHLY", currency: "VND" }`
- **THEN** system creates Stripe Checkout session with 300,000 VND price, returns session URL for redirect

#### Scenario: Successful Pro Annual subscription checkout
- **WHEN** user calls `POST /billing/checkout/subscription` with `{ plan: "PRO_ANNUAL", currency: "USD" }`
- **THEN** system creates Stripe Checkout session with USD price (converted from VND base), returns session URL for redirect

#### Scenario: Checkout with unsupported currency
- **WHEN** user calls `POST /billing/checkout/subscription` with `{ currency: "JPY" }`
- **THEN** system returns 400 error with message "Unsupported currency. Supported: VND, USD, EUR, GBP"

#### Scenario: Checkout with inactive product
- **WHEN** user calls `POST /billing/checkout/subscription` for a product that has been deactivated by admin
- **THEN** system returns 404 error with message "Product not available"

### Requirement: User creates addon checkout session
The system SHALL allow authenticated Pro users to create Stripe Checkout sessions for purchasing addon credit kits (one-time payments).

#### Scenario: Successful addon purchase checkout
- **WHEN** Pro user calls `POST /billing/checkout/addon` with `{ currency: "VND" }`
- **THEN** system creates Stripe Checkout session for one-time payment of 100,000 VND, returns session URL for redirect

#### Scenario: Addon purchase by Free user
- **WHEN** Free user calls `POST /billing/checkout/addon`
- **THEN** system returns 403 error with message "Addon purchases require Pro subscription"

#### Scenario: Addon purchase with unsupported currency
- **WHEN** user calls `POST /billing/checkout/addon` with `{ currency: "AUD" }`
- **THEN** system returns 400 error with message "Unsupported currency. Supported: VND, USD, EUR, GBP"

### Requirement: User lists subscriptions
The system SHALL allow authenticated users to list their subscription history.

#### Scenario: Successful subscription listing
- **WHEN** user calls `GET /billing/subscriptions`
- **THEN** system returns array of subscriptions with plan, status, period dates, sorted by createdAt descending

#### Scenario: Subscription listing for new user
- **WHEN** user calls `GET /billing/subscriptions` and has no subscriptions
- **THEN** system returns empty array

### Requirement: Stripe webhook handles checkout completion
The system SHALL process `checkout.session.completed` webhooks to activate subscriptions or add addon credits.

#### Scenario: Checkout completed for new subscription
- **WHEN** Stripe sends `checkout.session.completed` for a subscription checkout
- **THEN** system activates subscription (status: ACTIVE), updates CreditBalance with plan credits (50 for Free, 100 for Pro), and creates Subscription record

#### Scenario: Checkout completed for addon purchase
- **WHEN** Stripe sends `checkout.session.completed` for an addon checkout
- **THEN** system adds 15 credits to CreditBalance.addonCreditsAvailable, creates AddonPurchase record

#### Scenario: Duplicate webhook event
- **WHEN** Stripe sends duplicate `checkout.session.completed` event (same eventId)
- **THEN** system logs warning, skips processing, returns 200 OK

#### Scenario: Webhook signature verification failure
- **WHEN** webhook request has invalid Stripe signature
- **THEN** system returns 401 Unauthorized

### Requirement: Stripe webhook handles invoice payment
The system SHALL process `invoice.paid` webhooks to reset Pro Monthly credits.

#### Scenario: Invoice paid for Pro Monthly
- **WHEN** Stripe sends `invoice.paid` for Pro Monthly subscription
- **THEN** system resets CreditBalance.planCredits to 100, updates lastResetAt timestamp

#### Scenario: Invoice paid for Free subscription
- **WHEN** Stripe sends `invoice.paid` for Free subscription ($0 invoice)
- **THEN** system resets CreditBalance.planCredits to 50, updates lastResetAt timestamp

#### Scenario: Duplicate invoice.paid webhook
- **WHEN** Stripe sends duplicate `invoice.paid` event (same eventId)
- **THEN** system logs warning, skips processing, returns 200 OK

### Requirement: Stripe webhook handles payment failure
The system SHALL process `invoice.payment_failed` webhooks to mark subscriptions as past due.

#### Scenario: Payment failed for Pro subscription
- **WHEN** Stripe sends `invoice.payment_failed` for Pro subscription
- **THEN** system updates Subscription status to PAST_DUE

#### Scenario: Duplicate payment_failed webhook
- **WHEN** Stripe sends duplicate `invoice.payment_failed` event (same eventId)
- **THEN** system logs warning, skips processing, returns 200 OK

### Requirement: Stripe webhook handles subscription cancellation
The system SHALL process `customer.subscription.deleted` webhooks to downgrade users to Free and freeze addon credits.

#### Scenario: Pro subscription cancelled
- **WHEN** Stripe sends `customer.subscription.deleted` for Pro subscription
- **THEN** system updates Pro subscription status to CANCELED, creates new Free subscription (ACTIVE), freezes remaining addon credits (CreditBalance.addonCreditsFrozen), resets CreditBalance.planCredits to 50

#### Scenario: Free subscription cancelled
- **WHEN** Stripe sends `customer.subscription.deleted` for Free subscription
- **THEN** system updates Free subscription status to CANCELED (no further action, user must re-register)

#### Scenario: Duplicate subscription.deleted webhook
- **WHEN** Stripe sends duplicate `customer.subscription.deleted` event (same eventId)
- **THEN** system logs warning, skips processing, returns 200 OK

### Requirement: Same-tier subscription upgrade with proration
The system SHALL use Stripe's subscription update mechanism for same-tier changes (Pro Monthly <-> Pro Annual) to preserve proration.

#### Scenario: Pro Monthly upgrades to Pro Annual
- **WHEN** user initiates upgrade from Pro Monthly to Pro Annual
- **THEN** system calls Stripe `subscription.update` with proration_behavior: 'create_prorations', updates Subscription.plan to PRO_ANNUAL (same stripeSubscriptionId), returns updated subscription

#### Scenario: Pro Annual downgrades to Pro Monthly
- **WHEN** user initiates downgrade from Pro Annual to Pro Monthly
- **THEN** system calls Stripe `subscription.update` with proration_behavior: 'create_prorations', updates Subscription.plan to PRO_MONTHLY (same stripeSubscriptionId), returns updated subscription

#### Scenario: Stripe API timeout during same-tier update
- **WHEN** Stripe API times out during subscription.update
- **THEN** system returns 503 error with message "Payment service temporarily unavailable"

### Requirement: Cross-tier subscription change
The system SHALL cancel old subscription and create new subscription for cross-tier changes (Free <-> Pro).

#### Scenario: Free user upgrades to Pro
- **WHEN** user initiates upgrade from Free to Pro
- **THEN** system cancels Free subscription (status: CANCELED), creates new Pro subscription via Stripe Checkout, returns checkout URL

#### Scenario: Pro user downgrades to Free
- **WHEN** user initiates downgrade from Pro to Free
- **THEN** system cancels Pro subscription (status: CANCELED), creates new Free subscription (status: ACTIVE), freezes addon credits, resets planCredits to 50

#### Scenario: Cross-tier change during active billing period
- **WHEN** user with active Pro Monthly subscription initiates downgrade to Free
- **THEN** system cancels Pro subscription immediately (no refund for unused time), creates Free subscription, freezes addon credits

### Requirement: Subscription state machine transitions
The system SHALL enforce valid state transitions for subscriptions.

#### Scenario: Valid transition from ACTIVE to CANCELED
- **WHEN** subscription status is ACTIVE and system processes cancellation
- **THEN** subscription status changes to CANCELED

#### Scenario: Valid transition from ACTIVE to PAST_DUE
- **WHEN** subscription status is ACTIVE and payment fails
- **THEN** subscription status changes to PAST_DUE

#### Scenario: Invalid transition from CANCELED to ACTIVE
- **WHEN** subscription status is CANCELED and system attempts to activate
- **THEN** system throws error "Cannot activate canceled subscription"

#### Scenario: Invalid transition from PAST_DUE to EXPIRED
- **WHEN** subscription status is PAST_DUE and system attempts to expire
- **THEN** system throws error "PAST_DUE subscriptions must be resolved before expiration"
