## 1. Database Schema Migration

- [x] 1.1 Update `prisma/schema.prisma` to add `WebhookStatus` enum with values: PENDING, PROCESSING, DONE, FAILED
- [x] 1.2 Update `WebhookEvent` model to add fields: `status` (WebhookStatus, default PENDING), `retryCount` (Int, default 0), `maxRetries` (Int, default 3), `nextRetryAt` (DateTime, default now()), `lastError` (String?, optional)
- [x] 1.3 Make `processedAt` field nullable in `WebhookEvent` model
- [x] 1.4 Add index on `WebhookEvent` for `(status, nextRetryAt)` to optimize polling queries
- [x] 1.5 Run `prisma generate` to regenerate Prisma client
- [x] 1.6 Run `prisma migrate dev` to apply migration to development database
- [x] 1.7 Verify migration applied successfully and test rollback script

## 2. Enable Raw Body Configuration

- [x] 2.1 Update `src/main.ts` to enable `rawBody: true` in `NestFactory.create()` options
- [x] 2.2 Test that `req.rawBody` is available in webhook controller
- [x] 2.3 Verify signature verification works with raw body

## 3. Create Strategy Interface and Factory

- [x] 3.1 Create directory structure: `src/billing/strategies/` with subdirectories: `checkout/`, `invoice/`, `subscription/`
- [x] 3.2 Create `src/billing/strategies/webhook-strategy.interface.ts` with `WebhookStrategyInterface` defining `supports(eventType: string): boolean` and `handle(event: Stripe.Event): Promise<void>`
- [x] 3.3 Create `src/billing/strategies/webhook-strategy.factory.ts` with `WebhookStrategyFactory` class that receives strategies via `@Inject('WEBHOOK_STRATEGIES')` and implements `getStrategy(eventType: string)` and `supports(eventType: string)`
- [x] 3.4 Add validation in factory constructor to ensure no duplicate strategies for same event type
- [x] 3.5 Write unit tests for `WebhookStrategyFactory` in `src/billing/__tests__/strategies/webhook-strategy.factory.spec.ts`

## 4. Implement Webhook Event Strategies

- [x] 4.1 Create `src/billing/strategies/checkout/checkout-session-completed.strategy.ts` implementing `WebhookStrategyInterface` for `checkout.session.completed` events
- [x] 4.2 Implement branching logic in `CheckoutSessionCompletedStrategy`: if `metadata.type === 'addon'` call addon flow, else call subscription activation flow
- [x] 4.3 Write unit tests for `CheckoutSessionCompletedStrategy` in `src/billing/__tests__/strategies/checkout-session-completed.strategy.spec.ts`
- [x] 4.4 Create `src/billing/strategies/invoice/invoice-paid.strategy.ts` implementing `WebhookStrategyInterface` for `invoice.paid` events
- [x] 4.5 Implement logic in `InvoicePaidStrategy` to find subscription by `stripeSubscriptionId` and reset plan credits
- [x] 4.6 Write unit tests for `InvoicePaidStrategy` in `src/billing/__tests__/strategies/invoice-paid.strategy.spec.ts`
- [x] 4.7 Create `src/billing/strategies/invoice/invoice-payment-failed.strategy.ts` implementing `WebhookStrategyInterface` for `invoice.payment_failed` events
- [x] 4.8 Implement logic in `InvoicePaymentFailedStrategy` to mark subscription as `PAST_DUE` and freeze all credits (plan and addon)
- [x] 4.9 Write unit tests for `InvoicePaymentFailedStrategy` in `src/billing/__tests__/strategies/invoice-payment-failed.strategy.spec.ts`
- [x] 4.10 Create `src/billing/strategies/subscription/customer-subscription-updated.strategy.ts` implementing `WebhookStrategyInterface` for `customer.subscription.updated` events
- [x] 4.11 Implement logic in `CustomerSubscriptionUpdatedStrategy` to sync plan type, period dates, and status from Stripe
- [x] 4.12 Write unit tests for `CustomerSubscriptionUpdatedStrategy` in `src/billing/__tests__/strategies/customer-subscription-updated.strategy.spec.ts`
- [x] 4.13 Create `src/billing/strategies/subscription/customer-subscription-deleted.strategy.ts` implementing `WebhookStrategyInterface` for `customer.subscription.deleted` events
- [x] 4.14 Implement logic in `CustomerSubscriptionDeletedStrategy` to cancel subscription, freeze addon credits, and reset to FREE tier
- [x] 4.15 Write unit tests for `CustomerSubscriptionDeletedStrategy` in `src/billing/__tests__/strategies/customer-subscription-deleted.strategy.spec.ts`

## 5. Implement Webhook Processor Service

- [x] 5.1 Install `@nestjs/schedule` package if not already installed: `npm install @nestjs/schedule`
- [x] 5.2 Create `src/billing/webhook-processor.service.ts` with `@Injectable()` decorator
- [x] 5.3 Inject `PrismaService`, `WebhookStrategyFactory`, and `Logger` into processor
- [x] 5.4 Implement `@Cron('*/30 * * * * *')` method `processPendingEvents()` to poll database for pending events
- [x] 5.5 Implement query with `FOR UPDATE SKIP LOCKED` to prevent concurrent processing, limit to 20 events
- [x] 5.6 Implement `processEvent(event: WebhookEvent)` method that marks event as PROCESSING, dispatches to strategy, and updates status
- [x] 5.7 Implement success path: set `status: DONE` and `processedAt: now()`
- [x] 5.8 Implement failure path: increment `retryCount`, set `lastError`, calculate `nextRetryAt` with fixed interval (1 day)
- [x] 5.9 Implement `calculateNextRetry(retryCount: number)` method: returns `now() + 1 day`
- [x] 5.10 Implement max retries check: if `retryCount >= maxRetries` (3), cancel subscription, downgrade to FREE, freeze addon credits permanently
- [x] 5.11 Handle unsupported event types: log warning and set `status: DONE`
- [x] 5.12 Write unit tests for `WebhookProcessorService` in `src/billing/__tests__/webhook-processor.service.spec.ts`
- [x] 5.13 Test retry logic with different retry counts
- [x] 5.14 Test concurrent processing prevention with `FOR UPDATE SKIP LOCKED`

## 6. Update Webhook Controller

- [x] 6.1 Update `src/billing/stripe-webhook.controller.ts` to remove switch statement
- [x] 6.2 Add try/catch around signature verification in `handleWebhook()` method
- [x] 6.3 Return HTTP 400 with `BadRequestException` on signature verification failure
- [x] 6.4 Keep idempotency check: verify event doesn't exist before storing
- [x] 6.5 Store event with initial state: `status: PENDING`, `retryCount: 0`, `maxRetries: 3`, `nextRetryAt: now()`
- [x] 6.6 Return HTTP 200 with `{ received: true }` after successful storage
- [x] 6.7 Return HTTP 200 with `{ received: true, duplicate: true }` for duplicate events
- [x] 6.8 Write unit tests for `StripeWebhookController` in `src/billing/__tests__/stripe-webhook.controller.spec.ts`
- [x] 6.9 Test signature verification success and failure scenarios
- [x] 6.10 Test idempotency check for duplicate events

## 7. Update Billing Module

- [x] 7.1 Import `ScheduleModule` from `@nestjs/schedule` in `src/billing/billing.module.ts`
- [x] 7.2 Add all 5 strategy classes to `providers` arra
- [x] 7.3 Create provider token `WEBHOOK_STRATEGIES` using `useFactory` to inject all strategies
- [x] 7.4 Add `WebhookStrategyFactory` to `providers` array
- [x] 7.5 Add `WebhookProcessorService` to `providers` array
- [x] 7.6 Verify all dependencies are properly injected

## 8. Integration Testing

- [x] 8.1 Test end-to-end flow: send mock Stripe webhook event via HTTP POST
- [x] 8.2 Verify event is stored with `status: PENDING`
- [x] 8.3 Verify processor picks up event and dispatches to correct strategy
- [x] 8.4 Verify event status changes to `DONE` after successful processing
- [x] 8.5 Test retry flow: force strategy to fail, verify `retryCount` increments and `nextRetryAt` is set
- [x] 8.6 Test max retries: force 5 failures, verify event reaches `FAILED` status
- [x] 8.7 Test duplicate event handling: send same event twice, verify only processed once
- [x] 8.8 Test concurrent processing: run multiple processor instances, verify no duplicate processing

## 9. Documentation

- [x] 9.1 Update `docs/api.md` to document webhook endpoint behavior (no breaking changes)
- [x] 9.2 Add comments to strategy classes explaining their purpose and event type
- [x] 9.3 Document retry backoff schedule in code comments
- [x] 9.4 Create runbook for investigating `FAILED` webhook events
- [x] 9.5 Document how to add new webhook event handlers (create strategy, register in module)

## 10. Deployment Preparation

- [x] 10.1 Test migration on staging database
- [x] 10.2 Verify all existing webhook events are migrated with `status: DONE`
- [x] 10.3 Test webhook endpoint with Stripe CLI test events
- [x] 10.4 Configure Stripe webhook endpoint in Stripe Dashboard (if not already configured)
- [x] 10.5 Set up monitoring/alerting for `FAILED` webhook events
- [x] 10.6 Create rollback plan: disable feature flag or revert to old controller if issues arise

## 11. Post-Deployment Verification

- [x] 11.1 Monitor webhook processing logs for first 24 hours
- [x] 11.2 Verify no events stuck in `PENDING` or `PROCESSING` state
- [x] 11.3 Check for any `FAILED` events and investigate root causes
- [x] 11.4 Verify subscription activations, credit resets, and cancellations work correctly
- [x] 11.5 Confirm idempotency: no duplicate processing observed
- [x] 11.6 Performance check: verify polling query doesn't impact database performance
