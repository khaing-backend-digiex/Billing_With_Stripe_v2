## 1. Local Cron Refactor

- [ ] 1.1 Update `credit-reset.cron.ts` Prisma query to strictly filter by `status: SubStatus.ACTIVE` and `plan: PlanType.PRO_ANNUAL`
- [ ] 1.2 Modify `resetMonths` logic in `credit-reset.cron.ts` to use a `1` month reset interval for the annual plan calculations
- [ ] 1.3 Ensure proper error catching and Prisma `$transaction` usage within the cron loop to isolate individual user failures

## 2. Stripe Webhook Strategy

- [ ] 2.1 Create a new strategy file `invoice-paid.strategy.ts` in `src/billing/strategies/` implementing `WebhookStrategy`
- [ ] 2.2 Register the new strategy in `BillingModule` providers
- [ ] 2.3 Implement the `supports` method to specifically listen for `invoice.paid` Stripe events
- [ ] 2.4 Implement the `handle` method: parse the invoice payload to map the subscription to a user and determine if the plan is `FREE` or `PRO_MONTHLY`
- [ ] 2.5 Add idempotency logic in the `handle` method using a Prisma `$transaction` to prevent duplicate credit resets
- [ ] 2.6 Reset credits to 50 for `FREE` users and 100 for `PRO_MONTHLY` users upon successful transaction
