## 1. Database Schema and Type Updates

- [x] 1.1 Add PaymentMethod model to Prisma schema with fields: id, userId, stripePaymentMethodId, brand, last4, expMonth, expYear, isDefault, createdAt, updatedAt
- [x] 1.2 Create database migration for schema changes
- [x] 1.3 Run Prisma generate to update client types
- [x] 1.4 Add DOWNGRADE_DENIED and ALREADY_ON_THIS_PLAN to ErrorCode enum
- [x] 1.5 Add STRIPE_EVENT_SETUP_INTENT_SUCCEEDED, STRIPE_EVENT_PAYMENT_METHOD_UPDATED, STRIPE_EVENT_PAYMENT_METHOD_ATTACHED, STRIPE_EVENT_PAYMENT_METHOD_DETACHED to stripe-event.constants.ts

## 2. Upgrade Validation Logic

- [x] 2.1 Refactor isSameTierUpgrade to separate tier changes from billing cycle changes in billing.service.ts: tier changes (cross-tier) use checkout flow, billing cycle upgrades (MONTHLY→ANNUAL within same tier) use proration, billing cycle downgrades (ANNUAL→MONTHLY) blocked, same-plan blocked. Structure logic to support future tiers (Enterprise, etc.).
- [x] 2.2 Update upgradeSubscription method to use new validation logic and return appropriate error codes (DOWNGRADE_DENIED for billing cycle downgrade, ALREADY_ON_THIS_PLAN for same-plan)
- [x] 2.3 Write unit tests for upgrade validation covering all transition scenarios: tier upgrade, tier downgrade, billing cycle upgrade, billing cycle downgrade, same-plan, future tier support

## 3. Upgrade Preview Endpoint

- [x] 3.1 Add previewUpgrade method to StripeAdapter that calls stripe.invoices.retrieveUpcoming()
- [x] 3.2 Add previewUpgrade method to PaymentService that wraps adapter call
- [x] 3.3 Add previewUpgrade method to BillingService that validates user has active subscription
- [x] 3.4 Add GET /billing/preview endpoint to BillingController with priceId query parameter
- [x] 3.5 Create UpcomingInvoice response type with prorationAmount, newCharge, netAmount, currency, nextBillingDate
- [x] 3.6 Write unit tests for upgrade preview logic
- [ ] 3.7 Write integration test for preview endpoint

## 4. Credit Service Enhancements

- [x] 4.1 Add revokeSubscriptionCredits(userId, tx) method to CreditService
- [x] 4.2 Add ensureFreePlanAfterTerminal(userId, tx) method to CreditService
- [x] 4.3 Write unit tests for new credit service methods

## 5. Subscription Limit Check

- [x] 5.1 Add subscription limit check to createSubscriptionCheckout in BillingService: reject if user has any subscription with status ACTIVE
- [x] 5.2 Add SUBSCRIPTION_LIMIT_EXCEEDED error code to ErrorCode enum
- [x] 5.3 Write unit tests for subscription limit check

## 6. Payment Method Webhook Handlers

- [x] 6.1 Create SetupIntentSucceededStrategy class implementing WebhookStrategy interface
- [x] 6.2 Implement handle() method to extract payment method details from setup_intent and save to PaymentMethod table, set as default if first card
- [x] 6.3 Create PaymentMethodAttachedStrategy class implementing WebhookStrategy interface
- [x] 6.4 Implement handle() method to save payment method to PaymentMethod table
- [x] 6.5 Create PaymentMethodUpdatedStrategy class implementing WebhookStrategy interface
- [x] 6.6 Implement handle() method to update existing PaymentMethod record with new card details
- [x] 6.7 Create PaymentMethodDetachedStrategy class implementing WebhookStrategy interface
- [x] 6.8 Implement handle() method to delete PaymentMethod record, reassign default if needed
- [x] 6.9 Register all payment method strategies in BillingModule providers
- [x] 6.10 Write unit tests for each payment method webhook handler

## 7. Enhanced Existing Webhook Handlers

- [x] 7.1 Update InvoicePaymentFailedStrategy to add auto-cancel logic: after max retries (3) OR max days (3), call Stripe cancel API and mark as CANCELED
- [x] 7.2 Update CustomerSubscriptionUpdatedStrategy to detect payment failures and revoke credits
- [x] 7.3 Write unit tests for enhanced webhook handler logic

## 8. Payment Method Management API Endpoints

- [x] 8.1 Add createSetupIntent method to StripeAdapter that calls stripe.setupIntents.create()
- [x] 8.2 Add createSetupIntent method to PaymentService
- [x] 8.3 Add POST /billing/setup-intent endpoint to BillingController to create SetupIntent for save-card flow
- [x] 8.4 Add listPaymentMethods method to BillingService to query PaymentMethod table for current user
- [x] 8.5 Add GET /billing/payment-methods endpoint to BillingController
- [x] 8.6 Add deletePaymentMethod method to BillingService that calls Stripe detachPaymentMethod API and deletes from database
- [x] 8.7 Add DELETE /billing/payment-methods/:id endpoint to BillingController
- [x] 8.8 Write unit tests for payment method management endpoints

## 9. Integration Testing

- [ ] 9.1 Write integration test for upgrade preview with proration calculation
- [ ] 9.2 Write integration test for payment method save/list/delete flow
- [ ] 9.3 Write integration test for auto-cancel after payment failure threshold
- [ ] 9.4 Write integration test for subscription limit check

## 10. Stripe Configuration

- [ ] 10.1 Document required webhook events to configure in Stripe Dashboard: setup_intent.succeeded, payment_method.updated, payment_method.attached, payment_method.detached
- [ ] 10.2 Create runbook for deploying webhook changes and configuring Stripe

## 11. Documentation

- [ ] 11.1 Update API documentation with new endpoints: /billing/preview, /billing/setup-intent, /billing/payment-methods
- [ ] 11.2 Document subscription state machine transitions
