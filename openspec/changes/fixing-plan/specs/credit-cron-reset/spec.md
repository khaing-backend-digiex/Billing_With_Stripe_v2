## ADDED Requirements

### Requirement: Annual Plan Cron Reset
The local cron job MUST strictly process credit resets only for users subscribed to the `PRO_ANNUAL` plan, effectively offloading monthly resets to Stripe.

#### Scenario: Annual Plan Credit Reset
- **GIVEN** the `credit-reset.cron.ts` running daily at midnight
- **WHEN** it queries active subscriptions
- **THEN** it MUST explicitly filter for `PlanType.PRO_ANNUAL` only
- **AND** it MUST calculate the next reset date based on a 1-month interval
- **AND** it MUST reset the user's credits to 100 if the current date exceeds the next 1-month interval date
- **AND** it MUST ignore `FREE` and `PRO_MONTHLY` plans

#### Scenario: Database Transaction Safety
- **GIVEN** the cron job is processing multiple annual subscriptions
- **WHEN** it resets credits
- **THEN** it MUST use Prisma transactions (ACID) to ensure data consistency
- **AND** it MUST gracefully catch errors for individual users without stopping the entire cron job loop
