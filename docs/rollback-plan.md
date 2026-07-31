# Rollback Plan

## Overview

This document outlines the rollback strategy for the Stripe webhook system overhaul.

## Rollback Scenarios

### Scenario 1: Strategy Pattern Issues

If the strategy pattern implementation causes issues:

1. **Revert to switch statement** in `stripe-webhook.controller.ts`
2. **Remove strategy imports** from `billing.module.ts`
3. **Restore original handler methods** in `billing.service.ts`

### Scenario 2: Async Processing Issues

If the background processor causes problems:

1. **Disable the cron job** by commenting out `@Cron()` decorator in `webhook-processor.service.ts`
2. **Revert to synchronous processing** in the controller
3. **Remove processor service** from module providers

### Scenario 3: Database Schema Issues

If the new `WebhookEvent` schema causes problems:

1. **Revert migration**: `npx prisma migrate revert`
2. **Restore original schema** from git history
3. **Regenerate Prisma client**: `npx prisma generate`

## Rollback Steps

### Quick Rollback (Controller Only)

```bash
git checkout HEAD~1 -- src/billing/stripe-webhook.controller.ts
npm run build
```

### Full Rollback

```bash
# 1. Revert all billing changes
git checkout HEAD~1 -- src/billing/

# 2. Revert schema changes
git checkout HEAD~1 -- prisma/schema.prisma

# 3. Regenerate Prisma client
npx prisma generate

# 4. Rebuild
npm run build
```

## Data Recovery

### If Events Were Lost

Query the `webhook_events` table to find events that weren't processed:

```sql
SELECT * FROM webhook_events 
WHERE status IN ('PENDING', 'PROCESSING')
ORDER BY created_at DESC;
```

### If Credits Were Incorrect

Check credit balance discrepancies:

```sql
SELECT 
  u.email,
  cb.plan_credits,
  cb.addon_credits_available,
  s.status,
  s.plan
FROM credit_balances cb
JOIN users u ON cb.user_id = u.id
LEFT JOIN subscriptions s ON s.user_id = u.id
WHERE cb.plan_credits < 0 OR cb.addon_credits_available < 0;
```

## Monitoring After Rollback

1. **Check webhook logs** for processing errors
2. **Verify subscription states** match Stripe
3. **Confirm credit balances** are accurate
4. **Test new webhook events** end-to-end

## Prevention

To avoid needing rollback in the future:

1. **Test thoroughly** in staging with real Stripe test events
2. **Monitor retry counts** - high retry rates indicate issues
3. **Set up alerts** for FAILED webhook events
4. **Document all changes** in this runbook
