## 1. Date Utility Improvements

- [x] 1.1 Review existing `addCalendarMonths()` function in `src/common/utils/date.util.ts` to verify it handles day clamping correctly (e.g., Jan 31 + 1 month = Feb 28)
- [x] 1.2 If `addCalendarMonths()` doesn't clamp correctly, fix it to clamp to last day of month when target day doesn't exist
- [x] 1.3 Add helper function `monthsBetween(anchor: Date, target: Date): number` to calculate the number of months between two dates
- [x] 1.4 Write unit tests for `addCalendarMonths()` covering edge cases: Jan 31 → Feb 28, Feb 29 in leap years, month boundaries
- [x] 1.5 Write unit tests for `monthsBetween()` covering various date ranges and edge cases

## 2. Credit Reset Cron Logic

- [x] 2.1 Update `CreditResetCronService.handleCreditReset()` to use anchor-based calculation instead of iterative approach
- [x] 2.2 Modify cron to calculate period number from subscription's `currentPeriodStart` (anchor) using `monthsBetween()`
- [x] 2.3 Update next reset date calculation to use `addCalendarMonths(anchor, periodNumber * resetMonths)` instead of `addCalendarMonths(currentReset, resetMonths)`
- [x] 2.4 Add loop to increment period number until next reset date is in the future (handles missed cron cycles)
- [x] 2.5 Verify the existing check `if (newNextReset > subscription.currentPeriodEnd)` still works correctly with anchor-based calculation

## 3. Testing and Verification

- [x] 3.1 Write integration tests for credit reset cron covering: monthly plan subscribed on Jan 31, annual plan subscribed on Feb 29 (leap year), multiple consecutive resets
- [x] 3.2 Verify date drift is prevented: test 12 consecutive monthly resets from Jan 31 and confirm final date is still Jan 31 (not drifted to Jan 28)
- [x] 3.3 Verify leap year handling: test Feb 29, 2024 subscription undergoes resets through 2025 (Feb 28), 2026 (Feb 28), 2027 (Feb 28), 2028 (Feb 29)
- [x] 3.4 Test edge case where cron misses multiple cycles and needs to calculate several periods ahead
- [x] 3.5 Run existing test suite to ensure no regressions in credit system or subscription lifecycle

## 4. Documentation and Cleanup

- [x] 4.1 Add inline comments explaining anchor-based calculation approach in credit reset cron
- [x] 4.2 Update any relevant documentation about credit reset behavior (if exists)
- [x] 4.3 Review and clean up any temporary test data or debug logging added during development

