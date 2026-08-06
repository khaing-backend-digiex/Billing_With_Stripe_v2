## Context

The credit reset cron currently uses an iterative approach to calculate the next reset date:

```typescript
let nextReset = subscription.nextCreditResetAt;
nextReset = addCalendarMonths(nextReset, resetMonths);
```

This causes date drift because each calculation uses the previous result as the base. For example:
- Jan 31 → Feb 28 (no 31 in Feb)
- Feb 28 → Mar 28 (should be Mar 31!)
- Mar 28 → Apr 28 (should be Apr 30!)

The drift compounds over time, causing credits to reset on increasingly incorrect dates. This affects both monthly and annual plans, but is especially problematic for annual plans where the reset day matters for billing alignment.

## Goals / Non-Goals

**Goals:**
- Fix date drift by calculating reset dates from a fixed anchor (subscription start date)
- Ensure reset dates always attempt the original day, falling back to the last day of the month when needed
- Handle leap year edge cases correctly (Feb 29 in leap years → Feb 28 in non-leap years, return to Feb 29 in next leap year)
- Maintain backwards compatibility with existing subscription records

**Non-Goals:**
- Changing the credit reset frequency or logic
- Modifying how Stripe webhooks update subscription periods
- Adding new database fields (we'll use existing `currentPeriodStart` as the anchor)

## Decisions

### 1. Use `currentPeriodStart` as the anchor date

**Decision:** Use the subscription's `currentPeriodStart` field as the fixed anchor for calculating reset dates.

**Rationale:** This field already exists and represents when the current billing period started. It's set by Stripe webhooks and is reliable. No schema changes needed.

**Alternative considered:** Add a dedicated `anchorDate` field to the Subscription model. Rejected because it adds complexity and `currentPeriodStart` serves the same purpose.

### 2. Calculate next reset from anchor using period number

**Decision:** Instead of iteratively adding months, calculate the period number and multiply:

```typescript
const monthsSinceStart = monthsBetween(anchor, now);
const periodNumber = Math.floor(monthsSinceStart / resetMonths) + 1;
const nextReset = addCalendarMonths(anchor, periodNumber * resetMonths);
```

**Rationale:** This ensures every calculation starts from the same anchor, preventing drift. The period number ensures we're always calculating the correct future date.

**Alternative considered:** Modify `addCalendarMonths()` to take an anchor parameter. Rejected because it changes the function signature and might break other callers. The current approach is more localized.

### 3. Ensure `addCalendarMonths()` handles day clamping correctly

**Decision:** Verify that `addCalendarMonths()` already clamps to the last day of the month when the target day doesn't exist (e.g., Jan 31 + 1 month = Feb 28).

**Rationale:** This is the standard behavior for date libraries. If not already implemented, we'll fix it. This ensures Jan 31 → Feb 28 → Mar 31 → Apr 30 → May 31.

**Alternative considered:** Create a custom function. Rejected because date-fns likely already handles this correctly.

### 4. Handle the "already past" edge case

**Decision:** After calculating `nextReset`, check if it's still in the past (e.g., if the cron missed a cycle). If so, increment the period number until we get a future date.

**Rationale:** This handles edge cases where the cron might not run (server downtime, etc.) and ensures we don't get stuck in a loop of past dates.

**Implementation:**
```typescript
let periodNumber = Math.floor(monthsSinceStart / resetMonths) + 1;
let nextReset = addCalendarMonths(anchor, periodNumber * resetMonths);

while (nextReset <= now) {
  periodNumber++;
  nextReset = addCalendarMonths(anchor, periodNumber * resetMonths);
}
```

## Risks / Trade-offs

**[Risk] Existing subscriptions have drifted reset dates**
→ **Mitigation:** The fix will self-correct over time. On the next reset, the cron will calculate from the anchor, which may be different from the current `nextCreditResetAt`. This could cause a one-time adjustment (early or late reset), but after that, dates will be correct. We could add a migration to recalculate all `nextCreditResetAt` values, but that's complex and risky. The self-correction approach is safer.

**[Risk] `addCalendarMonths()` might not clamp correctly**
→ **Mitigation:** Write comprehensive tests covering edge cases (Jan 31 → Feb 28, Feb 29 in leap years, etc.). If the function doesn't clamp correctly, fix it or use date-fns's `addMonths` which handles this.

**[Risk] Period number calculation might be off by one**
→ **Mitigation:** Test with various scenarios (monthly, annual, different start dates). The `while (nextReset <= now)` loop ensures we always get a future date, even if the calculation is slightly off.

**[Trade-off] Using `currentPeriodStart` as anchor means resets are tied to the billing period**
→ **Acceptable because:** This is actually desirable. Credits should reset in alignment with the billing period, not on an arbitrary schedule. If a user upgrades/downgrades and gets a new `currentPeriodStart`, the reset schedule will adjust accordingly, which is correct behavior.

## Migration Plan

**Deployment:**
1. Deploy the updated `addCalendarMonths()` function (if changes needed) and cron logic
2. Monitor logs for the first few reset cycles to verify correct behavior
3. No data migration needed - the cron will self-correct on the next reset

**Rollback:**
- If issues arise, revert to the previous version. The drift issue will return, but no data is lost.

## Open Questions

(none - the approach is clear)
