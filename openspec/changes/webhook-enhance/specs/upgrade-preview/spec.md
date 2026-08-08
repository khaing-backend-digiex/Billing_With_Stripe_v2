# Upgrade Preview

## Purpose
Allow users to preview subscription change costs before committing, showing proration amounts, new charges, and net total. Supports both tier changes and billing cycle changes.

## Requirements

### Requirement: User previews subscription change cost
The system SHALL allow authenticated users to preview the cost of changing their subscription (tier or billing cycle) before committing to the change.

#### Scenario: Successful preview for billing cycle upgrade (Pro Monthly to Pro Annual)
- **GIVEN** user has an active Pro Monthly subscription
- **WHEN** user calls `GET /billing/preview?priceId=<pro_annual_price_id>`
- **THEN** system validates this is a billing cycle upgrade (same tier, higher cycle)
- **AND** system calls Stripe `invoices.retrieveUpcoming()` with the new price ID
- **AND** returns preview with proration amount, new charge, net total, currency, and next billing date

#### Scenario: Preview for tier upgrade (Free to Pro)
- **GIVEN** user has an active Free subscription
- **WHEN** user calls `GET /billing/preview?priceId=<pro_monthly_price_id>`
- **THEN** system validates this is a tier upgrade (cross-tier)
- **AND** system calls Stripe `invoices.retrieveUpcoming()` with the new price ID
- **AND** returns preview with proration amount, new charge, net total, currency, and next billing date

#### Scenario: Preview for same plan (no change)
- **GIVEN** user has an active Pro Monthly subscription
- **WHEN** user calls `GET /billing/preview?priceId=<pro_monthly_price_id>`
- **THEN** system validates no change (same tier, same cycle)
- **AND** returns 400 error with code `ALREADY_ON_THIS_PLAN`

#### Scenario: Preview for billing cycle downgrade (blocked)
- **GIVEN** user has an active Pro Annual subscription
- **WHEN** user calls `GET /billing/preview?priceId=<pro_monthly_price_id>`
- **THEN** system validates this is a billing cycle downgrade (same tier, lower cycle)
- **AND** returns 400 error with code `DOWNGRADE_DENIED`

#### Scenario: Preview for tier downgrade (Free to Pro, but user is on Enterprise)
- **GIVEN** user has an active Enterprise subscription
- **WHEN** user calls `GET /billing/preview?priceId=<pro_monthly_price_id>`
- **THEN** system validates this is a tier downgrade (cross-tier)
- **AND** returns 400 error with code `TIER_DOWNGRADE_DENIED` (future tier support)

#### Scenario: Preview with no active subscription
- **GIVEN** user has no active subscription
- **WHEN** user calls `GET /billing/preview?priceId=<any_price_id>`
- **THEN** system returns 404 error with message "No active subscription found"

#### Scenario: Preview with invalid price ID
- **GIVEN** user has an active subscription
- **WHEN** user calls `GET /billing/preview?priceId=invalid_price_id`
- **THEN** system returns 404 error with message "Price not found"

#### Scenario: Stripe API timeout during preview
- **GIVEN** user has an active subscription
- **WHEN** user calls `GET /billing/preview?priceId=<valid_price_id>`
- **AND** Stripe API times out
- **THEN** system returns 503 error with message "Payment service temporarily unavailable"

### Requirement: Preview response format
The system SHALL return preview data in a structured format that includes all cost components.

#### Scenario: Preview response structure
- **GIVEN** user requests a valid preview
- **WHEN** system successfully retrieves upcoming invoice from Stripe
- **THEN** response SHALL include:
  - `prorationAmount`: Amount credited for unused time (negative if credit)
  - `newCharge`: Amount for new subscription period
  - `netAmount`: Total amount due (prorationAmount + newCharge)
  - `currency`: Currency code (VND, USD, etc.)
  - `nextBillingDate`: Date when next invoice will be generated

#### Scenario: Preview with proration credit for billing cycle upgrade
- **GIVEN** user upgrading from Pro Monthly (mid-cycle) to Pro Annual
- **WHEN** preview is calculated
- **THEN** prorationAmount SHALL be negative (credit for unused monthly time)
- **AND** newCharge SHALL be positive (annual subscription cost)
- **AND** netAmount SHALL be the sum (may be positive or negative depending on timing)
