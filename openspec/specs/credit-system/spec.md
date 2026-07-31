# Credit System

## Purpose
Manage user credit balances, consumption, resets, and addon credit freezing/unfreezing.

## Requirements

### Requirement: User consumes credits via API
The system SHALL allow authenticated users to consume credits via API call. The system SHALL consume plan credits first, then addon credits as fallback.

#### Scenario: Successful credit consumption from plan credits
- **WHEN** user with 50 plan credits calls `POST /credits/consume` with `{ amount: 10 }`
- **THEN** system deducts 10 from CreditBalance.planCredits (now 40), returns updated balance

#### Scenario: Credit consumption spans plan and addon credits
- **WHEN** user with 5 plan credits and 20 addon credits calls `POST /credits/consume` with `{ amount: 15 }`
- **THEN** system deducts 5 from planCredits (now 0), deducts 10 from addonCreditsAvailable (now 10), returns updated balance

#### Scenario: Insufficient credits
- **WHEN** user with 5 plan credits and 5 addon credits (total 10) calls `POST /credits/consume` with `{ amount: 20 }`
- **THEN** system returns 402 error with message "Insufficient credits"

#### Scenario: Credit consumption with frozen addon credits
- **WHEN** user with 0 plan credits and 20 frozen addon credits calls `POST /credits/consume` with `{ amount: 5 }`
- **THEN** system returns 402 error with message "Insufficient credits" (frozen credits cannot be consumed)

#### Scenario: Credit consumption by user without CreditBalance
- **WHEN** user without CreditBalance record calls `POST /credits/consume`
- **THEN** system returns 404 error with message "Credit balance not found"

#### Scenario: Concurrent credit consumption requests
- **WHEN** two concurrent requests attempt to consume credits from the same user
- **THEN** system uses database transaction with row-level locking to prevent race conditions, both requests succeed or fail atomically

### Requirement: User retrieves credit balance
The system SHALL allow authenticated users to retrieve their current credit balance.

#### Scenario: Successful balance retrieval
- **WHEN** user calls `GET /credits/balance`
- **THEN** system returns CreditBalance with planCredits, addonCreditsAvailable, addonCreditsFrozen, and lastResetAt

#### Scenario: Balance retrieval for user without CreditBalance
- **WHEN** user without CreditBalance calls `GET /credits/balance`
- **THEN** system returns 404 error with message "Credit balance not found"

### Requirement: Monthly credit reset for Free users
The system SHALL reset Free user credits to 50 monthly via cron job.

#### Scenario: Successful monthly reset for Free user
- **WHEN** cron job runs on 1st of month for Free user with 20 planCredits
- **THEN** system sets CreditBalance.planCredits to 50, updates lastResetAt timestamp

#### Scenario: Monthly reset for Free user with addon credits
- **WHEN** cron job runs for Free user with 50 planCredits and 15 addonCreditsAvailable
- **THEN** system resets planCredits to 50, addonCredits remain unchanged (15), updates lastResetAt

#### Scenario: Cron job failure for single user
- **WHEN** cron job encounters database error for one user
- **THEN** system logs error, continues processing other users, retries failed user on next run

### Requirement: Monthly credit reset for Pro Annual users
The system SHALL reset Pro Annual user credits to 100 monthly via cron job.

#### Scenario: Successful monthly reset for Pro Annual user
- **WHEN** cron job runs on 1st of month for Pro Annual user with 30 planCredits
- **THEN** system sets CreditBalance.planCredits to 100, updates lastResetAt timestamp

#### Scenario: Monthly reset for Pro Annual user with frozen addon credits
- **WHEN** cron job runs for Pro Annual user with 100 planCredits and 20 addonCreditsFrozen
- **THEN** system resets planCredits to 100, addonCreditsFrozen remains 20 (stays frozen until Pro renews), updates lastResetAt

### Requirement: Addon credit freezing on Pro expiry
The system SHALL freeze remaining addon credits when Pro subscription expires or is canceled.

#### Scenario: Pro subscription expires with remaining addon credits
- **WHEN** Pro subscription expires with 25 remaining addon credits (addonCreditsAvailable: 25)
- **THEN** system sets CreditBalance.addonCreditsFrozen to 25, sets CreditBalance.addonCreditsAvailable to 0

#### Scenario: Pro subscription expires with no addon credits
- **WHEN** Pro subscription expires with 0 addon credits
- **THEN** system sets CreditBalance.addonCreditsFrozen to 0, CreditBalance.addonCreditsAvailable remains 0

#### Scenario: Pro subscription expires with partially consumed addon credits
- **WHEN** Pro subscription expires with 10 addonCreditsAvailable and 5 already consumed from total 15 purchased
- **THEN** system sets CreditBalance.addonCreditsFrozen to 10 (remaining), sets addonCreditsAvailable to 0

### Requirement: Addon credit unfreezing on Pro renewal
The system SHALL unfreeze addon credits when user resubscribes to Pro after expiration.

#### Scenario: User resubscribes to Pro with frozen credits
- **WHEN** user with 25 addonCreditsFrozen resubscribes to Pro
- **THEN** system sets CreditBalance.addonCreditsFrozen to 0, sets CreditBalance.addonCreditsAvailable to 25

#### Scenario: User resubscribes to Pro with no frozen credits
- **WHEN** user with 0 addonCreditsFrozen resubscribes to Pro
- **THEN** system leaves addonCreditsFrozen at 0, addonCreditsAvailable unchanged

### Requirement: Initial credit allocation on user registration
The system SHALL create CreditBalance with 50 plan credits when user registers.

#### Scenario: Successful credit allocation on registration
- **WHEN** new user registers
- **THEN** system creates CreditBalance record with planCredits: 50, addonCreditsAvailable: 0, addonCreditsFrozen: 0, lastResetAt: current timestamp

#### Scenario: Registration fails during credit allocation
- **WHEN** database error occurs during CreditBalance creation
- **THEN** system rolls back entire registration transaction (user not created)

### Requirement: Credit consumption atomicity
The system SHALL ensure credit consumption operations are atomic using database transactions.

#### Scenario: Atomic deduction across plan and addon credits
- **WHEN** user consumes 15 credits with 5 planCredits and 20 addonCreditsAvailable
- **THEN** system executes single transaction: deducts 5 from planCredits, deducts 10 from addonCreditsAvailable, both updates succeed or both fail

#### Scenario: Transaction rollback on concurrent modification
- **WHEN** credit balance is modified by another transaction during consumption
- **THEN** system detects conflict via version checking or optimistic locking, retries transaction

### Requirement: Credit balance validation
The system SHALL validate credit balance invariants at all times.

#### Scenario: Plan credits never negative
- **WHEN** credit consumption would result in negative planCredits
- **THEN** system throws error "Plan credits cannot be negative"

#### Scenario: Addon credits available never negative
- **WHEN** credit consumption would result in negative addonCreditsAvailable
- **THEN** system throws error "Addon credits cannot be negative"

#### Scenario: Addon credits frozen never negative
- **WHEN** freezing operation would result in negative addonCreditsFrozen
- **THEN** system throws error "Frozen credits cannot be negative"
