# Tasks: Fix Adapter Pattern Implementation Gaps

- [x] **Task 1: Fix WebhookEvent type — add `id` field**
  - Edit `src/billing/payments/types/payment.types.ts`.
  - Add `id: string` to the `WebhookEvent` interface.
  - Verify `IPaymentAdapter.constructWebhookEvent` return type is still compatible.

- [x] **Task 2: Fix `constructWebhookEvent` payload**
  - Edit `src/billing/payments/adapters/stripe.adapter.ts`.
  - Change `constructWebhookEvent` to return `{ id: event.id, type: event.type, payload: event.data.object }`.
  - This ensures `payload` is the domain object (e.g., raw invoice), not the entire Stripe event envelope.

- [x] **Task 3: Migrate `WebhookProcessorService` to `WebhookEvent`**
  - Edit `src/billing/webhook-processor.service.ts`.
  - Remove `import Stripe from 'stripe'`.
  - Add `import { WebhookEvent } from './payments/types/payment.types'`.
  - Replace the `Stripe.Event` reconstruction block (lines 73–82) with:
    ```typescript
    const genericEvent: WebhookEvent = {
      id: event.stripeEventId,
      type: event.type,
      payload: event.payload,
    };
    await strategy.handle(genericEvent);
    ```
  - Remove the `as any` cast.

- [x] **Task 4: Delete `stripe.service.ts`**
  - Delete `src/billing/stripe.service.ts`.
  - Verify no source files (excluding tests) import from it: `grep -r "stripe.service" src/`.

- [x] **Task 5: Rewrite webhook controller test**
  - Edit `src/billing/__tests__/stripe-webhook.controller.spec.ts`.
  - Replace `StripeService` imports with `PaymentService`.
  - Update the provider list to match actual controller dependencies: `PaymentService`, `PrismaService`, `WebhookProcessorService`, `AppLogger`.
  - Update mock to return `WebhookEvent` (with `id`, `type`, `payload`) from `verifyWebhookSignature`.
  - Ensure all existing test scenarios still pass.

- [x] **Task 6: Fix `InvoicePaymentFailedStrategy` dual logger**
  - Edit `src/billing/strategies/invoice/invoice-payment-failed.strategy.ts`.
  - Remove `AppLogger` injection and the unused `appLogger` field.
  - Keep only the `private readonly logger = new Logger(...)` (consistent with other strategies).

- [x] **Task 7: Extract retry constant and type factory spread**
  - Create `src/constants/billing.constants.ts` with `MAX_INVOICE_RETRY_ATTEMPTS = 3`.
  - Update `InvoicePaymentFailedStrategy` to use the constant instead of magic `3`.
  - Update `src/billing/stripe-webhook.controller.ts` to use the constant for `maxRetries`.
  - Edit `src/billing/billing.module.ts`: type the factory as `(...strategies: WebhookStrategy[]) => strategies`.

- [x] **Task 8: Differentiate upgrade methods and fix preview errors**
  - Edit `src/billing/payments/adapters/stripe.adapter.ts`.
  - `upgradeSubscriptionTier`: pass `prorationBehavior: 'create_prorations'`.
  - `upgradeSubscriptionCycle`: pass `prorationBehavior: 'none'`.
  - `previewUpgradeSubscriptionTier` / `previewUpgradeSubscriptionCycle`: throw `ServiceError(ErrorCode.INTERNAL_ERROR, 'Not implemented')` instead of raw `Error`.

- [x] **Task 9: Unit tests for fixed components**
  - Write/update unit tests for:
    - `StripeAdapter.constructWebhookEvent` — verify it returns `{ id, type, payload: data.object }`.
    - `WebhookProcessorService.processEvent` — verify it constructs `WebhookEvent`, not `Stripe.Event`.
    - `StripeWebhookController.handleWebhook` — verify dedup works with `event.id`.
  - Run `npm test` and confirm all tests pass.

- [x] **Task 10: Verify build and lint**
  - Run `npx tsc --noEmit` — no type errors.
  - Run lint — no `@typescript-eslint/no-unsafe-*` errors from the changed files.
  - Run `npm test` — all tests pass.
