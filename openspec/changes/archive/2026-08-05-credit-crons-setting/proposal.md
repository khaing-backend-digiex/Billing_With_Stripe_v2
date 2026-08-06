## Why

The credit reset cron uses iterative `addCalendarMonths()` calls that cause date drift over time. Starting from Jan 31, the sequence becomes Jan 31 → Feb 28 → Mar 28 → Apr 28, permanently losing the original day. This affects both monthly and annual plans, causing credits to reset on the wrong day.

## What Changes

- Fix `addCalendarMonths()` utility to calculate from an anchor date instead of iteratively
- Update credit reset cron to use the subscription's original period start as the anchor
- Ensure reset dates always attempt the original day, falling back to the last day of the month when needed (e.g., Jan 31 → Feb 28 → Mar 31 → Apr 30 → May 31)
- Handle leap year edge cases correctly (Feb 29 in leap years → Feb 28 in non-leap years, but return to Feb 29 in the next leap year)

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `credit-system`: Fix the date calculation logic to prevent drift in credit reset scheduling

## Impact

- **Code**: `src/common/utils/date.util.ts` (addCalendarMonths function), `src/credit/credit-reset.cron.ts` (reset logic)
- **Behavior**: Credit resets will occur on the correct dates, aligned with the subscription's original period start
- **Dependencies**: No new dependencies; existing date-fns library usage
- **Testing**: Update existing date utility tests and credit reset cron tests to verify drift-free behavior
