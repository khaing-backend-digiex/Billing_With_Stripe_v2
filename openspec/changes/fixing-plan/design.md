## Context

The current subscription credit system relies heavily on a daily cron job that scans all active subscriptions in the database to calculate if their credits need to be reset. With the introduction of a Free Plan on Stripe (along with Pro Monthly), managing all users' resets via a single polling mechanism is inefficient, prone to scaling issues, and introduces database load bottlenecks. By leveraging Stripe's event-driven architecture (`invoice.paid`), we can distribute the load of monthly resets over the course of the month based on users' actual billing dates.

## Goals / Non-Goals

**Goals:**
- Transition `FREE` and `PRO_MONTHLY` credit resets from a polling (cron) model to a push (webhook) model using Stripe's `invoice.paid` events.
- Ensure webhook handlers are completely idempotent and wrapped in Prisma transactions.
- Refactor the existing `credit-reset.cron.ts` to exclusively process `PRO_ANNUAL` subscriptions on a 1-month reset interval.

**Non-Goals:**
- Completely removing the cron job (it is still structurally required to convert the single yearly billing event into monthly credit resets for annual plans).
- Changing the amount of credits assigned per plan.

## Decisions

- **Webhook Strategy for Monthly Plans:** `invoice.paid` is chosen because Stripe reliably fires it for both $0 (Free) and >$0 (Paid) monthly subscriptions upon successful cycle renewal. We will create a `InvoicePaidStrategy` implementing the `WebhookStrategy` interface.
- **Idempotency Strategy:** The webhook handler must use Prisma's `$transaction` to ensure that processing the same `invoice.paid` event twice (which Stripe explicitly warns can happen) does not double-credit the user.
- **Cron Job Modifications:** The query in `credit-reset.cron.ts` will be updated to `where: { status: SubStatus.ACTIVE, plan: PlanType.PRO_ANNUAL }`. The `resetMonths` variable will be hardcoded to `1` instead of `12`.

## Risks / Trade-offs

- **Risk: Missed Webhooks** -> **Mitigation:** Rely on Stripe's automatic webhook retries and the system's `WebhookEvent` dead-letter queue (already implemented in `webhook_events` table).
- **Risk: Concurrency on Cron Resets** -> **Mitigation:** Ensure the cron job uses strict error catching per user so one failed user doesn't crash the entire job batch.
