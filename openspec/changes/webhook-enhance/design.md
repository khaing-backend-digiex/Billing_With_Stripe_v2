# Design: Webhook Enhance

## Context

The billing system currently handles Stripe webhooks through a strategy pattern with async processing. While the core functionality works, several gaps exist:

1. **Upgrade logic bug**: The `isSameTierUpgrade` method incorrectly treats ANNUAL→MONTHLY as an upgrade
2. **No upgrade preview**: Users cannot see proration costs before committing to an upgrade
3. **Missing webhook handlers**: Payment method lifecycle events are not handled
4. **No payment method management**: Users cannot save cards without making a purchase
5. **Subscription limit enforcement**: Need to prevent users from having more than one active subscription
6. **Incomplete payment failure handling**: Need auto-cancel logic after max retries

The system uses NestJS, Prisma, PostgreSQL, and follows a webhook strategy pattern with async processing via cron jobs.

## Goals / Non-Goals

**Goals:**
- Fix subscription upgrade logic to properly validate transitions (MONTHLY→ANNUAL allowed, ANNUAL→MONTHLY blocked, same-plan blocked)
- Add upgrade preview endpoint showing proration amounts before user commits
- Prevent users from having more than one active subscription (simple check, no cleanup)
- Add webhook handlers for payment method lifecycle (save, update, attach, detach)
- Enable users to save payment methods without immediate purchase
- Enhance existing webhook handlers with auto-cancel logic and payment failure detection
- Maintain PCI compliance (no raw card data storage)

**Non-Goals:**
- 3D Secure authentication flow (deferred to future work)
- WebSocket infrastructure for real-time notifications
- PaymentIntent-based addon purchases (keeping Checkout flow for addons)
- Inline payment forms (maintaining Stripe-hosted Checkout for security)
- Scheduled downgrades (cancel_at_period_end) - not in scope for this change
- Multi-currency support enhancements
- Parallel subscription cleanup (just prevent creation instead)

## Decisions

### Decision 1: Upgrade Validation Logic

**Choice:** Implement explicit transition matrix that separates tier changes from billing cycle changes

**Rationale:**
- The current `isSameTierUpgrade` method conflates tier changes with billing cycle changes
- **Tier changes** (Free ↔ Pro ↔ future tiers) use checkout flow (cancel old, create new)
- **Billing cycle upgrades** (MONTHLY → ANNUAL within same tier) use proration via subscription.update
- **Billing cycle downgrades** (ANNUAL → MONTHLY within same tier) are blocked
- Same-plan changes (MONTHLY → MONTHLY) are rejected as no-ops
- Logic is structured to support future tiers (Enterprise, etc.) - tier changes always use checkout, billing cycle changes only within same tier
- Explicit matrix makes the business rules clear and testable

**Alternative considered:** Keep generic "same tier" check and add special cases
- Rejected because it's error-prone and doesn't clearly express business intent
- Doesn't scale well when adding more tiers in the future

## Decisions

### Decision 1: Upgrade Validation Logic

**Choice:** Implement explicit transition matrix that separates tier changes from billing cycle changes

**Rationale:**
- The current `isSameTierUpgrade` method conflates tier changes with billing cycle changes
- **Tier changes** (Free ↔ Pro ↔ future tiers) use checkout flow (cancel old, create new)
- **Billing cycle upgrades** (MONTHLY → ANNUAL within same tier) use proration via subscription.update
- **Billing cycle downgrades** (ANNUAL → MONTHLY within same tier) are blocked
- Same-plan changes (MONTHLY → MONTHLY) are rejected as no-ops
- Logic is structured to support future tiers (Enterprise, etc.) - tier changes always use checkout, billing cycle changes only within same tier
- Explicit matrix makes the business rules clear and testable

**Alternative considered:** Keep generic "same tier" check and add special cases
- Rejected because it's error-prone and doesn't clearly express business intent
- Doesn't scale well when adding more tiers in the future

### Decision 2: Subscription Limit Enforcement

**Choice:** Prevent creation of second subscription rather than cleanup after creation

**Rationale:**
- Simpler than parallel cleanup logic
- Avoids race conditions and partial state issues
- Better user experience (immediate feedback rather than surprise cancellation)
- Lower risk of accidentally canceling the wrong subscription
- Aligns with "fail fast" principle

**Alternative considered:** Parallel subscription cleanup in invoice.paid handler
- Rejected because it's more complex, has race condition risks, and provides worse UX

### Decision 3: Payment Method Storage

**Choice:** Create PaymentMethod table storing only metadata (last4, brand, expiration), synced via webhooks

**Rationale:**
- Enables "save card without purchase" flow
- Webhooks keep data in sync (payment_method.attached/updated/detached)
- Storing only metadata maintains PCI compliance
- Allows frontend to display saved cards without Stripe API calls

**Alternative considered:** Fetch payment methods on-demand from Stripe
- Rejected because it's slower and requires Stripe API call on every page load

**Alternative considered:** Store full payment method object
- Rejected because it may include sensitive data

### Decision 4: Auto-Cancel After Payment Failure

**Choice:** Cancel subscription after max retries (3) OR max days (3), whichever comes first

**Rationale:**
- Prevents indefinite PAST_DUE state
- Explicitly cancels in Stripe (not just local DB)
- Marks invoice as UNCOLLECTIBLE to prevent further collection attempts
- Aligns with typical dunning policies

**Alternative considered:** Just mark as CANCELED locally
- Rejected because Stripe subscription would remain active, causing confusion

### Decision 5: Upgrade Preview Implementation

**Choice:** Use Stripe's `invoices.retrieveUpcoming()` API

**Rationale:**
- Stripe calculates proration correctly, handling all edge cases
- Returns authoritative data matching what Stripe will actually charge
- Avoids duplicating complex billing logic

**Alternative considered:** Manual proration calculation
- Rejected because it's error-prone and doesn't account for all Stripe billing rules

### Decision 6: Webhook Strategy Registration

**Choice:** Register new strategies in existing webhookStrategies array in BillingModule

**Rationale:**
- Follows existing pattern (strategy factory with dependency injection)
- Minimal code changes
- Strategy factory validates no duplicate event handlers

**Alternative considered:** Separate module for new strategies
- Rejected as unnecessary complexity; all billing strategies belong together

## Architecture

### Data Model Changes

**PaymentMethod table (new):**
- `id` (uuid, primary key)
- `userId` (string, foreign key to User)
- `stripePaymentMethodId` (string, unique)
- `brand` (string): visa, mastercard, etc.
- `last4` (string): last 4 digits
- `expMonth` (integer): 1-12
- `expYear` (integer): 4-digit year
- `isDefault` (boolean)
- `createdAt`, `updatedAt` (timestamps)
- Index on `[userId]`

### API Endpoints

**New endpoints:**
- `GET /billing/preview?priceId={priceId}`: Preview upgrade costs
- `POST /billing/setup-intent`: Create SetupIntent for save-card flow
- `GET /billing/payment-methods`: List user's saved payment methods
- `DELETE /billing/payment-methods/:id`: Detach payment method

**Modified endpoints:**
- `POST /billing/upgrade`: Enhanced validation (block ANNUAL→MONTHLY, block same-plan)
- `POST /billing/checkout/subscription`: Add subscription limit check (reject if user has active subscription)

### Webhook Handlers

**New strategies:**
1. `SetupIntentSucceededStrategy`: Handles `setup_intent.succeeded`
   - Save payment method metadata to database
   - Set as default if first card

2. `PaymentMethodAttachedStrategy`: Handles `payment_method.attached`
   - Save payment method metadata

3. `PaymentMethodUpdatedStrategy`: Handles `payment_method.updated`
   - Sync card changes (expiration, brand)

4. `PaymentMethodDetachedStrategy`: Handles `payment_method.detached`
   - Remove card from database
   - Reassign default if needed

**Enhanced strategies:**
1. `InvoicePaymentFailedStrategy`: Add auto-cancel after threshold
2. `CustomerSubscriptionUpdatedStrategy`: Add payment failure detection

### Credit Service Additions

**New methods:**
- `revokeSubscriptionCredits(userId, tx)`: Revokes all subscription credits
- `ensureFreePlanAfterTerminal(userId, tx)`: Ensures user has FREE plan after terminal state
- `grantAddonCredits(userId, credits, tx)`: Grants addon credits (may already exist as addAddonCredits)

### Error Codes

**New error codes:**
- `DOWNGRADE_DENIED`: Attempted ANNUAL→MONTHLY downgrade
- `ALREADY_ON_THIS_PLAN`: Attempted same-plan transition
- `SUBSCRIPTION_LIMIT_EXCEEDED`: User already has an active subscription

## Risks / Trade-offs

### Risk 1: Payment Method Sync Lag
**Risk:** Webhooks delayed, frontend shows stale data
**Mitigation:** Frontend refreshes after user action; webhooks are eventually consistent
**Likelihood:** Medium
**Impact:** Low (cosmetic issue)

### Risk 2: Upgrade Preview Mismatch
**Risk:** Preview shows different amount than actual charge (timing, coupon changes)
**Mitigation:** Preview is informational; final charge determined at upgrade time
**Likelihood:** Low
**Impact:** Low (user can re-preview)

### Risk 3: Subscription Limit Check Race Condition
**Risk:** User creates multiple subscriptions simultaneously before check completes
**Mitigation:** Database-level constraint (if needed) or accept that this is an edge case
**Likelihood:** Very low
**Impact:** Low (can be cleaned up manually)

### Trade-off: Webhook Sync vs Real-time API Calls
**Choice:** Webhook-based payment method sync
**Trade-off:** Eventually consistent vs. real-time accuracy
**Acceptable because:** Payment method changes are not time-critical; webhooks reduce Stripe API calls

## Migration Plan

### Phase 1: Database Migration
1. Create PaymentMethod table (non-breaking, new table)

### Phase 2: Deploy New Code
1. Deploy new webhook strategies (backward compatible, new handlers)
2. Deploy enhanced existing strategies (backward compatible, additional logic)
3. Deploy new API endpoints (backward compatible, new endpoints)
4. Deploy subscription limit check in checkout flow

### Phase 3: Configure Stripe
1. Add new webhook events to Stripe Dashboard:
   - `setup_intent.succeeded`
   - `payment_method.attached`
   - `payment_method.updated`
   - `payment_method.detached`

### Rollback Strategy
- Database changes are additive (no destructive migrations)
- New webhook handlers can be disabled by removing from strategy array
- New API endpoints can be disabled via feature flags if needed
- Stripe webhook events can be removed from Dashboard

### Testing Strategy
1. Unit tests for upgrade validation logic
2. Unit tests for each new webhook strategy
3. Integration tests for payment method lifecycle
4. E2E tests for upgrade preview endpoint
5. Unit tests for subscription limit check

## Open Questions

None - all critical decisions have been resolved through exploration:
- ✅ Upgrade logic: ANNUAL→MONTHLY blocked, SAME→SAME blocked
- ✅ Payment methods: Webhook sync, metadata-only storage
- ✅ Addons: Keep Checkout flow (not PaymentIntent)
- ✅ Subscription limit: Prevent creation rather than cleanup
- ✅ Auto-cancel: After max retries (3) OR max days (3)
- ✅ 3D Secure: Deferred to future work
