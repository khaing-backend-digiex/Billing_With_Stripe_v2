## MODIFIED Requirements

### Requirement: Monthly credit reset for Free users
The system SHALL reset Free user credits to 50 via cron job, calculated from the subscription's anchor date (currentPeriodStart). The system SHALL use anchor-based date calculation to prevent drift, ensuring resets occur on the same day of each month (or the last day if the target day doesn't exist).

#### Scenario: Successful monthly reset for Free user with anchor-based calculation
- **WHEN** cron job runs and current date >= nextCreditResetAt for Free user with 20 planCredits
- **THEN** system sets CreditBalance.planCredits to 50, updates lastResetAt timestamp, calculates next reset date from anchor (currentPeriodStart) using period number to prevent drift

#### Scenario: Monthly reset for Free user subscribed on Jan 31
- **WHEN** Free user subscribed on Jan 31 has credits reset
- **THEN** system sets nextCreditResetAt to Feb 28 (or 29 in leap year), then Mar 31, then Apr 30, then May 31 (always attempts original day, falls back to last day of month)

#### Scenario: Monthly reset prevents date drift
- **WHEN** Free user subscribed on Jan 31 undergoes multiple monthly resets
- **THEN** system calculates each reset from anchor (Jan 31) using period number, ensuring sequence is Jan 31 → Feb 28 → Mar 31 → Apr 30 → May 31 (NOT Jan 31 → Feb 28 → Mar 28 → Apr 28)

#### Scenario: Monthly reset for Free user with addon credits
- **WHEN** cron job runs for Free user with 50 planCredits and 15 addonCreditsAvailable
- **THEN** system resets planCredits to 50, addonCredits remain unchanged (15), updates lastResetAt

#### Scenario: Cron job failure for single user
- **WHEN** cron job encounters database error for one user
- **THEN** system logs error, continues processing other users, retries failed user on next run

### Requirement: Monthly credit reset for Pro Annual users
The system SHALL reset Pro Annual user credits to 100 via cron job, calculated from the subscription's anchor date (currentPeriodStart). The system SHALL use anchor-based date calculation to prevent drift, ensuring resets occur on the same day of each month (or the last day if the target day doesn't exist).

#### Scenario: Successful monthly reset for Pro Annual user with anchor-based calculation
- **WHEN** cron job runs and current date >= nextCreditResetAt for Pro Annual user with 30 planCredits
- **THEN** system sets CreditBalance.planCredits to 100, updates lastResetAt timestamp, calculates next reset date from anchor (currentPeriodStart) using period number to prevent drift

#### Scenario: Monthly reset for Pro Annual user subscribed on Jan 31
- **WHEN** Pro Annual user subscribed on Jan 31 has credits reset
- **THEN** system sets nextCreditResetAt to Feb 28 (or 29 in leap year), then Mar 31, then Apr 30, then May 31 (always attempts original day, falls back to last day of month)

#### Scenario: Monthly reset for Pro Annual user with frozen addon credits
- **WHEN** cron job runs for Pro Annual user with 100 planCredits and 20 addonCreditsFrozen
- **THEN** system resets planCredits to 100, addonCreditsFrozen remains 20 (stays frozen until Pro renews), updates lastResetAt

### Requirement: Credit reset date calculation uses anchor-based approach
The system SHALL calculate credit reset dates using an anchor-based approach where each reset date is calculated from the subscription's currentPeriodStart (anchor date) using the period number, NOT iteratively from the previous reset date. This prevents date drift.

#### Scenario: Anchor-based calculation for monthly resets
- **WHEN** subscription has currentPeriodStart = Jan 31, 2024 and resetMonths = 1
- **THEN** system calculates reset dates as: Jan 31, 2024 → Feb 29, 2024 → Mar 31, 2024 → Apr 30, 2024 → May 31, 2024 (each calculated from anchor, not from previous date)

#### Scenario: Anchor-based calculation for Feb 29 leap year edge case
- **WHEN** subscription has currentPeriodStart = Feb 29, 2024 (leap year) and resetMonths = 1
- **THEN** system calculates reset dates as: Feb 29, 2024 → Mar 29, 2024 → Apr 29, 2024 → ... → Jan 29, 2025 → Feb 28, 2025 (no Feb 29) → Mar 29, 2025 → ... → Feb 29, 2028 (next leap year)

#### Scenario: Anchor-based calculation prevents drift accumulation
- **WHEN** subscription undergoes 12 monthly resets starting from Jan 31
- **THEN** after 12 resets, the reset date is still Jan 31 (or last day of month), NOT drifted to Jan 28 or Jan 29

#### Scenario: Next reset date calculation when current date is past multiple periods
- **WHEN** subscription has nextCreditResetAt in the past and current date is multiple periods ahead
- **THEN** system calculates the correct future reset date by determining the period number from anchor, ensuring next reset is always in the future

#### Scenario: Reset date respects subscription period boundaries
- **WHEN** calculated next reset date would exceed currentPeriodEnd
- **THEN** system skips the reset and logs that it will be handled by invoice.paid webhook on renewal
