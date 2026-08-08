## ADDED Requirements

### Requirement: Webhook Credit Reset
The system MUST reset user credits for `FREE` and `PRO_MONTHLY` plans upon receiving an `invoice.paid` webhook event from Stripe.

#### Scenario: Free Plan Renewal
- **GIVEN** a user on the `FREE` plan
- **WHEN** the system receives an `invoice.paid` webhook with `amount_paid = 0` (or applicable zero-decimal amount)
- **THEN** the system MUST reset the user's credits to 50
- **AND** the system MUST log the credit reset event idempotently

#### Scenario: Pro Monthly Renewal
- **GIVEN** a user on the `PRO_MONTHLY` plan
- **WHEN** the system receives an `invoice.paid` webhook for the subscription renewal
- **THEN** the system MUST reset the user's credits to 100
- **AND** the system MUST log the credit reset event idempotently

#### Scenario: Webhook Duplication
- **GIVEN** a user on a monthly plan
- **WHEN** Stripe sends duplicate `invoice.paid` webhooks
- **THEN** the system MUST handle the event idempotently and NOT reset the credits multiple times
