## Why

Currently, the system resets subscription credits using a global cron job (`credit-reset.cron.ts`) that queries all active users daily. This approach scales poorly for large user bases, especially for Free and Pro Monthly plans where billing cycles naturally align with Stripe's monthly invoices. We need to offload scheduling to Stripe by leveraging Webhooks (`invoice.paid`) for monthly plans, reserving the local cron job exclusively for handling the monthly credit resets of Annual plans.

## What Changes

- Create a Webhook handler for `invoice.paid` that resets credits for `FREE` and `PRO_MONTHLY` plans.
- Modify `credit-reset.cron.ts` to only query and reset credits for `PRO_ANNUAL` subscriptions, and update its reset interval to 1 month.

## Capabilities

### New Capabilities
- `credit-webhook-reset`: Handle credit resets asynchronously via Stripe's `invoice.paid` webhook for monthly-billed subscriptions.

### Modified Capabilities
- `credit-cron-reset`: Limit local cron resets exclusively to `PRO_ANNUAL` subscriptions and fix the reset interval logic.

## Impact

- `src/credit/credit-reset.cron.ts`: Substantial reduction in database queries and cron processing time.
- `src/billing/strategies/`: New or modified strategy to process `invoice.paid` events.
