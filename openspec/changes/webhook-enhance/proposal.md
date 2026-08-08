## Why

The subscription upgrade logic incorrectly treats all PRO↔PRO transitions as upgrades, allowing users to downgrade from Annual to Monthly (revenue loss). There is no upgrade preview endpoint so users cannot see costs before committing. The webhook system is missing handlers for payment method management and lifecycle enhancements (auto-cancel after payment failure). Users cannot save a card without making a purchase. The system also needs a simple check to prevent users from having more than one active subscription.

## What Changes

- **Fix subscription upgrade logic**: Separate tier changes from billing cycle changes. Tier changes (Free ↔ Pro) use checkout flow. Billing cycle upgrades (MONTHLY → ANNUAL within same tier) use proration. Billing cycle downgrades (ANNUAL → MONTHLY) are blocked with `DOWNGRADE_DENIED` error. Same plan changes blocked with `ALREADY_ON_THIS_PLAN` error. Logic structured to support future tiers (Enterprise, etc.).
- **Add upgrade preview endpoint**: `GET /billing/preview` returns proration amounts, new charges, net total, and next billing date using Stripe's `invoices.retrieveUpcoming()`
- **Prevent duplicate subscriptions**: Simple check in checkout flow to reject new subscriptions when user already has an active one (no parallel cleanup needed)
- **Enhance existing webhook handlers**:
  - `invoice.payment_failed`: After max retries (3) OR >3 days, call Stripe cancel API and mark invoice UNCOLLECTIBLE
  - `customer.subscription.updated`: Detect payment failures, revoke credits, fallback to FREE plan; log PAYMENT_RECOVERED when PAST_DUE → ACTIVE
- **Add new webhook handlers**:
  - `setup_intent.succeeded`: Save card info (last4, brand, expiration) to database, set as default if first card
  - `payment_method.updated/attached/detached`: Sync card changes from Stripe to local database
- **Add new endpoints**:
  - `POST /billing/setup-intent`: Create SetupIntent for save-card-without-purchase flow
  - `GET /billing/payment-methods`: List user's saved payment methods
  - `DELETE /billing/payment-methods/:id`: Detach payment method via Stripe
- **Add CreditService methods**: `revokeSubscriptionCredits`, `ensureFreePlanAfterTerminal`, `grantAddonCredits`
- **Schema changes**: Add `PaymentMethod` model for storing card metadata (no raw card data — PCI compliant)

## Capabilities

### New Capabilities
- `upgrade-preview`: Preview endpoint that shows proration amounts and net cost before upgrade using Stripe invoices.retrieveUpcoming()
- `payment-method-sync`: Save, sync, and delete payment methods via webhooks and API endpoints; support save-card-without-purchase flow via SetupIntent

### Modified Capabilities
- `subscription-lifecycle`: Fix upgrade transition logic (block ANNUAL → MONTHLY, handle SAME → SAME), add subscription limit check (1 active subscription per user)
- `webhook-event-strategies`: Enhance invoice.payment_failed (auto-cancel after retries), subscription.updated (payment failure detection and credit revocation); add new strategies for setup_intent.succeeded, payment_method.updated/attached/detached

## Impact

- **Database**: Prisma migration for new PaymentMethod model
- **APIs**: 4 new endpoints (preview, setup-intent, payment-methods list/delete)
- **Dependencies**: No new npm dependencies (webhooks only, no WebSocket)
- **Stripe Dashboard**: Configure additional webhook events (setup_intent.succeeded, payment_method.updated/attached/detached)
- **Backwards compatibility**: Upgrade logic change is breaking for any code that relied on ANNUAL → MONTHLY being allowed (none currently exists)
