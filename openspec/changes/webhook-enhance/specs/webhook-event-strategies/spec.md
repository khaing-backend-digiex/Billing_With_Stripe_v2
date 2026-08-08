# Webhook Event Strategies (Delta)

## Purpose
Handle Stripe webhook events through specialized strategy handlers for subscription lifecycle, payment processing, and credit management.

## MODIFIED Requirements

### Requirement: InvoicePaidStrategy handles parallel subscription cleanup
The system SHALL ensure only one ACTIVE subscription exists per user by cleaning up parallel subscriptions when an invoice is paid.

#### Scenario: Invoice paid with parallel active subscriptions
- **GIVEN** user has Subscription A (ACTIVE) and Subscription B (ACTIVE)
- **WHEN** invoice.paid webhook is received for Subscription B
- **THEN** system SHALL call `ensureOnlyOneActiveSubscription()`
- **AND** cancel Subscription A via Stripe API
- **AND** mark Subscription A as EXPIRED in database
- **AND** keep Subscription B as ACTIVE

#### Scenario: Invoice paid with no parallel subscriptions
- **GIVEN** user has only Subscription A (ACTIVE)
- **WHEN** invoice.paid webhook is received for Subscription A
- **THEN** system SHALL call `ensureOnlyOneActiveSubscription()`
- **AND** find no other ACTIVE subscriptions
- **AND** take no cancellation action

#### Scenario: Invoice paid with transaction rollback on cleanup failure
- **GIVEN** invoice.paid webhook processing is in progress
- **WHEN** parallel subscription cleanup fails
- **THEN** entire transaction SHALL be rolled back
- **AND** event SHALL be marked for retry

### Requirement: InvoicePaymentFailedStrategy handles auto-cancel after threshold
The system SHALL automatically cancel subscriptions after exceeding the payment failure threshold.

#### Scenario: Payment failed exceeds max retry attempts
- **GIVEN** subscription has status PAST_DUE
- **AND** retryCount = MAX_INVOICE_RETRY_ATTEMPTS (3)
- **WHEN** invoice.payment_failed webhook is received
- **THEN** system SHALL call `paymentService.cancelSubscription()`
- **AND** mark subscription as CANCELED in database
- **AND** call `creditService.revokeSubscriptionCredits()`
- **AND** call `creditService.ensureFreePlanAfterTerminal()`
- **AND** mark event as DONE

#### Scenario: Payment failed exceeds max retry days
- **GIVEN** subscription has status PAST_DUE
- **AND** subscription has been PAST_DUE for > RETRY_WINDOW_DAYS (3 days)
- **WHEN** invoice.payment_failed webhook is received
- **THEN** system SHALL call `paymentService.cancelSubscription()`
- **AND** mark subscription as CANCELED in database
- **AND** call `creditService.revokeSubscriptionCredits()`
- **AND** call `creditService.ensureFreePlanAfterTerminal()`
- **AND** mark event as DONE

#### Scenario: Payment failed below threshold
- **GIVEN** subscription has status PAST_DUE
- **AND** retryCount < MAX_INVOICE_RETRY_ATTEMPTS
- **AND** days in PAST_DUE < RETRY_WINDOW_DAYS
- **WHEN** invoice.payment_failed webhook is received
- **THEN** system SHALL increment retryCount
- **AND** keep subscription in PAST_DUE status
- **AND** mark event for retry with exponential backoff

### Requirement: CustomerSubscriptionUpdatedStrategy handles payment failure detection
The system SHALL detect payment failures in subscription.updated events and take appropriate action.

#### Scenario: Subscription updated with payment failure
- **GIVEN** customer.subscription.updated webhook is received
- **WHEN** subscription status indicates payment failure (e.g., past_due, incomplete)
- **THEN** system SHALL call `creditService.revokeSubscriptionCredits()`
- **AND** call `creditService.ensureFreePlanAfterTerminal()`
- **AND** log PAYMENT_FAILED event
- **AND** mark subscription as PAST_DUE or INCOMPLETE

#### Scenario: Subscription updated with recovery from PAST_DUE
- **GIVEN** subscription has status PAST_DUE
- **WHEN** customer.subscription.updated webhook is received
- **AND** new status is ACTIVE
- **THEN** system SHALL log PAYMENT_RECOVERED event
- **AND** unfreeze addon credits
- **AND** reset plan credits

#### Scenario: Subscription updated with plan change
- **GIVEN** customer.subscription.updated webhook is received
- **WHEN** subscription plan has changed
- **THEN** system SHALL update local subscription plan
- **AND** reset plan credits for new plan
- **AND** log PLAN_CHANGED event

## ADDED Requirements

### Requirement: InvoicePaymentActionRequiredStrategy handles 3D Secure authentication
The system SHALL handle invoice.payment_action_required webhooks to support 3D Secure authentication flows.

#### Scenario: New subscription requires 3D Secure
- **GIVEN** invoice.payment_action_required webhook is received
- **WHEN** subscription is new (first invoice)
- **THEN** system SHALL extract client_secret from payment_intent
- **AND** store client_secret in Subscription.paymentActionClientSecret
- **AND** set subscription status to INCOMPLETE
- **AND** log PAYMENT_ACTION_REQUIRED event

#### Scenario: Renewal requires 3D Secure
- **GIVEN** invoice.payment_action_required webhook is received
- **WHEN** subscription is existing (renewal invoice)
- **THEN** system SHALL extract client_secret from payment_intent
- **AND** store client_secret in Subscription.paymentActionClientSecret
- **AND** set subscription status to PAST_DUE
- **AND** freeze addon credits
- **AND** log PAYMENT_ACTION_REQUIRED event

#### Scenario: Subscription not found for payment action required
- **GIVEN** invoice.payment_action_required webhook is received
- **WHEN** subscription does not exist in database
- **THEN** system SHALL log warning
- **AND** mark event as DONE (no retry)

### Requirement: SetupIntentSucceededStrategy handles card save without purchase
The system SHALL handle setup_intent.succeeded webhooks to save payment method information when users save a card without making a purchase.

#### Scenario: Setup intent succeeded with new payment method
- **GIVEN** setup_intent.succeeded webhook is received
- **WHEN** payment_method is present in the event
- **THEN** system SHALL call `paymentService.getPaymentMethod()`
- **AND** save payment method to database (last4, brand, exp_month, exp_year)
- **AND** set as default if user has no default payment method
- **AND** log PAYMENT_METHOD_SAVED event

#### Scenario: Setup intent succeeded with duplicate payment method
- **GIVEN** setup_intent.succeeded webhook is received
- **WHEN** payment_method already exists in database
- **THEN** system SHALL update existing payment method
- **AND** log PAYMENT_METHOD_UPDATED event

#### Scenario: Setup intent succeeded with missing payment method
- **GIVEN** setup_intent.succeeded webhook is received
- **WHEN** payment_method is not present in the event
- **THEN** system SHALL log warning
- **AND** mark event as DONE (no retry)

### Requirement: PaymentMethodUpdatedStrategy handles card updates
The system SHALL handle payment_method.updated webhooks to synchronize payment method changes from Stripe.

#### Scenario: Payment method updated with new details
- **GIVEN** payment_method.updated webhook is received
- **WHEN** payment method exists in database
- **THEN** system SHALL update payment method details (last4, brand, exp_month, exp_year)
- **AND** log PAYMENT_METHOD_UPDATED event

#### Scenario: Payment method updated but not found in database
- **GIVEN** payment_method.updated webhook is received
- **WHEN** payment method does not exist in database
- **THEN** system SHALL log warning
- **AND** mark event as DONE (no retry)

### Requirement: PaymentMethodAttachedStrategy handles new card attachments
The system SHALL handle payment_method.attached webhooks to save newly attached payment methods.

#### Scenario: Payment method attached to customer
- **GIVEN** payment_method.attached webhook is received
- **WHEN** payment method is attached to a customer
- **THEN** system SHALL save payment method to database
- **AND** set as default if user has no default payment method
- **AND** log PAYMENT_METHOD_ATTACHED event

#### Scenario: Payment method attached but already exists
- **GIVEN** payment_method.attached webhook is received
- **WHEN** payment method already exists in database
- **THEN** system SHALL update existing payment method
- **AND** log PAYMENT_METHOD_UPDATED event

### Requirement: PaymentMethodDetachedStrategy handles card removal
The system SHALL handle payment_method.detached webhooks to remove payment methods from the database.

#### Scenario: Payment method detached from customer
- **GIVEN** payment_method.detached webhook is received
- **WHEN** payment method exists in database
- **THEN** system SHALL delete payment method from database
- **AND** if this was the default payment method, set another as default (if exists)
- **AND** log PAYMENT_METHOD_DETACHED event

#### Scenario: Payment method detached but not found in database
- **GIVEN** payment_method.detached webhook is received
- **WHEN** payment method does not exist in database
- **THEN** system SHALL log warning
- **AND** mark event as DONE (no retry)

#### Scenario: Default payment method detached
- **GIVEN** payment_method.detached webhook is received
- **WHEN** detached payment method is the default
- **AND** user has other payment methods
- **THEN** system SHALL set the oldest remaining payment method as default

#### Scenario: Last payment method detached
- **GIVEN** payment_method.detached webhook is received
- **WHEN** detached payment method is the default
- **AND** user has no other payment methods
- **THEN** system SHALL set default payment method to null
- **AND** user can still make purchases by providing new payment method

### Requirement: Webhook strategy registration includes new strategies
The system SHALL register all new webhook strategies in the billing module.

#### Scenario: New strategies registered in BillingModule
- **GIVEN** BillingModule is initialized
- **WHEN** webhook strategies are registered
- **THEN** system SHALL include:
  - InvoicePaymentActionRequiredStrategy
  - SetupIntentSucceededStrategy
  - PaymentMethodUpdatedStrategy
  - PaymentMethodAttachedStrategy
  - PaymentMethodDetachedStrategy
- **AND** all strategies SHALL be added to webhookStrategies array

### Requirement: Stripe event constants include new events
The system SHALL define constants for all new Stripe webhook events.

#### Scenario: New event constants defined
- **GIVEN** stripe-event.constants.ts file
- **WHEN** constants are defined
- **THEN** file SHALL include:
  - STRIPE_EVENT_INVOICE_PAYMENT_ACTION_REQUIRED = 'invoice.payment_action_required'
  - STRIPE_EVENT_SETUP_INTENT_SUCCEEDED = 'setup_intent.succeeded'
  - STRIPE_EVENT_PAYMENT_METHOD_UPDATED = 'payment_method.updated'
  - STRIPE_EVENT_PAYMENT_METHOD_ATTACHED = 'payment_method.attached'
  - STRIPE_EVENT_PAYMENT_METHOD_DETACHED = 'payment_method.detached'
