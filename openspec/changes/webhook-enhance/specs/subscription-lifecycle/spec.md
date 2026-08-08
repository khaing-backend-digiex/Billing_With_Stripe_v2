# Subscription Lifecycle (Delta)

## Purpose
Manage the full lifecycle of user subscriptions, including checkout sessions, Stripe webhook handling, subscription state transitions, proration, and cross-tier changes.

## MODIFIED Requirements

### Requirement: Tier upgrade and billing cycle change
The system SHALL distinguish between tier changes (cross-tier) and billing cycle changes (within same tier). Tier changes use checkout flow. Billing cycle upgrades (monthly → annual) use proration. Billing cycle downgrades (annual → monthly) are blocked.

#### Scenario: Billing cycle upgrade (Monthly to Annual within same tier)
- **GIVEN** user has active Pro Monthly subscription
- **WHEN** user calls `POST /billing/upgrade` with Pro Annual priceId
- **THEN** system validates this is a billing cycle upgrade (same tier, higher cycle)
- **AND** calls Stripe `subscription.update` with proration_behavior: 'create_prorations'
- **AND** updates Subscription.plan to PRO_ANNUAL (same stripeSubscriptionId)
- **AND** returns updated subscription

#### Scenario: Billing cycle downgrade (Annual to Monthly within same tier) - BLOCKED
- **GIVEN** user has active Pro Annual subscription
- **WHEN** user calls `POST /billing/upgrade` with Pro Monthly priceId
- **THEN** system validates this is a billing cycle downgrade (same tier, lower cycle)
- **AND** returns 400 error with ErrorCode `DOWNGRADE_DENIED`
- **AND** does NOT call Stripe API
- **AND** subscription remains unchanged

#### Scenario: Same plan change attempt - BLOCKED
- **GIVEN** user has active Pro Monthly subscription
- **WHEN** user calls `POST /billing/upgrade` with Pro Monthly priceId
- **THEN** system validates no change (same tier, same cycle)
- **AND** returns 400 error with ErrorCode `ALREADY_ON_THIS_PLAN`
- **AND** does NOT call Stripe API
- **AND** subscription remains unchanged

#### Scenario: Stripe API timeout during billing cycle upgrade
- **GIVEN** user initiates valid billing cycle upgrade (MONTHLY -> ANNUAL)
- **WHEN** Stripe API times out during subscription.update
- **THEN** system returns 503 error with message "Payment service temporarily unavailable"

#### Scenario: Tier upgrade (cross-tier) uses checkout flow
- **GIVEN** user has Free subscription
- **WHEN** user initiates tier upgrade to Pro
- **THEN** system cancels Free subscription
- **AND** creates new Pro subscription via Stripe Checkout

#### Scenario: Future tier support
- **GIVEN** system has multiple tiers (Free, Pro, Enterprise, etc.)
- **WHEN** user changes between tiers
- **THEN** system SHALL use checkout flow for all tier changes
- **AND** billing cycle changes (monthly ↔ annual) SHALL only be allowed within same tier
- **AND** billing cycle downgrades SHALL be blocked regardless of tier

### Requirement: Subscription checkout prevents duplicate active subscriptions
The system SHALL prevent users from creating a new subscription if they already have an active subscription.

#### Scenario: User with active subscription attempts to create another
- **GIVEN** user has a subscription with status ACTIVE
- **WHEN** user calls `POST /billing/checkout/subscription`
- **THEN** system SHALL check for existing active subscriptions
- **AND** return 400 error with ErrorCode `SUBSCRIPTION_LIMIT_EXCEEDED`
- **AND** does NOT create Stripe checkout session
- **AND** does NOT create new subscription record

#### Scenario: User with canceled subscription creates new subscription
- **GIVEN** user has a subscription with status CANCELED
- **WHEN** user calls `POST /billing/checkout/subscription`
- **THEN** system SHALL allow the checkout to proceed
- **AND** create Stripe checkout session normally

#### Scenario: User with past due subscription creates new subscription
- **GIVEN** user has a subscription with status PAST_DUE
- **WHEN** user calls `POST /billing/checkout/subscription`
- **THEN** system SHALL allow the checkout to proceed (user may be resolving payment issue)

## ADDED Requirements

### Requirement: Auto-cancel subscription after payment failure threshold
The system SHALL automatically cancel subscriptions after exceeding the payment failure threshold (max retries OR max days).

#### Scenario: Cancel after max retry attempts
- **GIVEN** subscription has status PAST_DUE
- **AND** invoice.payment_failed webhook is received
- **WHEN** retryCount reaches MAX_INVOICE_RETRY_ATTEMPTS (3)
- **THEN** system SHALL call Stripe API to cancel subscription immediately
- **AND** mark subscription as CANCELED in database
- **AND** revoke all subscription credits
- **AND** freeze addon credits
- **AND** ensure user has FREE plan

#### Scenario: Cancel after max retry days
- **GIVEN** subscription has status PAST_DUE
- **AND** subscription has been PAST_DUE for more than RETRY_WINDOW_DAYS (3 days)
- **WHEN** invoice.payment_failed webhook is received
- **THEN** system SHALL call Stripe API to cancel subscription immediately
- **AND** mark subscription as CANCELED in database
- **AND** revoke all subscription credits
- **AND** freeze addon credits
- **AND** ensure user has FREE plan

#### Scenario: Do not cancel before threshold
- **GIVEN** subscription has status PAST_DUE
- **AND** retryCount is 2 (below threshold)
- **AND** subscription has been PAST_DUE for 2 days (below threshold)
- **WHEN** invoice.payment_failed webhook is received
- **THEN** system SHALL NOT cancel subscription
- **AND** SHALL increment retryCount
- **AND** SHALL keep subscription in PAST_DUE status

#### Scenario: Stripe API failure during auto-cancel
- **GIVEN** subscription exceeds payment failure threshold
- **WHEN** Stripe API call to cancel subscription fails
- **THEN** system SHALL log error with subscription details
- **AND** mark event for retry
- **AND** SHALL NOT mark subscription as CANCELED in database

### Requirement: Subscription state machine transitions
The system SHALL enforce valid state transitions for subscription status.

#### Scenario: Valid transition from PAST_DUE to ACTIVE (renewal succeeded)
- **WHEN** subscription status is PAST_DUE
- **AND** invoice.paid webhook is received (renewal payment succeeded)
- **THEN** subscription status changes to ACTIVE

#### Scenario: Valid transition from PAST_DUE to CANCELED (renewal failed after retries)
- **WHEN** subscription status is PAST_DUE
- **AND** max retry attempts exceeded OR retry window expired
- **THEN** subscription status changes to CANCELED

#### Scenario: Valid transition from PAST_DUE to EXPIRED (renewal failed permanently)
- **WHEN** subscription status is PAST_DUE
- **AND** all retry attempts exhausted without success
- **THEN** subscription status changes to EXPIRED

#### Scenario: Invalid transition from CANCELED to ACTIVE
- **WHEN** subscription status is CANCELED
- **AND** system attempts to set status to ACTIVE
- **THEN** system throws error "Cannot transition from CANCELED to ACTIVE"

#### Scenario: Invalid transition from EXPIRED to ACTIVE
- **WHEN** subscription status is EXPIRED
- **AND** system attempts to set status to ACTIVE
- **THEN** system throws error "Cannot transition from EXPIRED to ACTIVE"
