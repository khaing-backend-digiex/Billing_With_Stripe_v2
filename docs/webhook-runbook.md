# Webhook Event Runbook

## Investigating FAILED Webhook Events

### 1. Check Failed Events
```sql
SELECT id, stripe_event_id, type, retry_count, last_error, created_at
FROM webhook_events
WHERE status = 'FAILED'
ORDER BY created_at DESC;
```

### 2. Common Failure Reasons

| Error | Cause | Resolution |
|-------|-------|------------|
| `Missing userId in session metadata` | Checkout session missing required metadata | Check Stripe metadata configuration |
| `Subscription not found` | Event received before subscription synced | Manual retry or check Stripe subscription ID |
| `Credit balance not found` | User account not fully provisioned | Create credit balance record manually |
| Database connection errors | Temporary infrastructure issue | Wait for retry or manually reprocess |

### 3. Manual Retry
```sql
UPDATE webhook_events
SET status = 'PENDING',
    retry_count = 0,
    next_retry_at = NOW()
WHERE id = '<event_id>' AND status = 'FAILED';
```

### 4. Check Subscription State
```sql
SELECT s.id, s.stripe_subscription_id, s.status, s.plan, u.email
FROM subscriptions s
JOIN users u ON s.user_id = u.id
WHERE s.stripe_subscription_id = '<stripe_sub_id>';
```

### 5. Verify Credit Balance
```sql
SELECT user_id, plan_credits, addon_credits_available, addon_credits_frozen
FROM credit_balances
WHERE user_id = '<user_id>';
```

### 6. Escalation
If manual retry fails repeatedly:
1. Check Stripe Dashboard for subscription state
2. Verify user account exists and is properly provisioned
3. Check application logs for detailed error stack traces
4. Consider marking event as resolved if state is already correct
