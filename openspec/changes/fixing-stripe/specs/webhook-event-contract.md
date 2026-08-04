# Spec: WebhookEvent Contract Fix

## Overview
The `WebhookEvent` type must carry a provider event ID and the raw domain object payload. The current implementation is missing the `id` field and wrapping the wrong layer of the Stripe envelope.

---

## Scenario 1: WebhookEvent carries event ID

**Given** a Stripe webhook event with `id: "evt_abc123"` arrives  
**When** `constructWebhookEvent` processes the raw body and signature  
**Then** the returned `WebhookEvent` has `id = "evt_abc123"`  
**And** the controller can use `event.id` to perform deduplication lookups  

---

## Scenario 2: WebhookEvent payload contains the domain object

**Given** a Stripe `invoice.paid` event with `data.object` containing a raw `Stripe.Invoice`  
**When** `constructWebhookEvent` processes the event  
**Then** `event.payload` is set to `event.data.object` (the raw invoice), not the entire `Stripe.Event` envelope  
**And** strategies can pass `event.payload` directly to `mapRawInvoice()` without unwrapping  

---

## Scenario 3: Deduplication succeeds with correct event ID

**Given** a webhook event with `id: "evt_abc123"` has already been stored in `webhook_events`  
**When** the same event arrives again  
**Then** the controller finds the existing record by `stripeEventId = "evt_abc123"`  
**And** returns `{ received: true, duplicate: true }` without creating a new record  

---

## Scenario 4: Deduplication failure (current bug)

**Given** `WebhookEvent` has no `id` field (current state)  
**When** the controller accesses `event.id`  
**Then** the value is `undefined`  
**And** the `findUnique({ where: { stripeEventId: undefined } })` query either throws or returns null  
**And** every event is treated as new, creating duplicate records  

---

# Spec: WebhookProcessorService Migration

## Overview
The `WebhookProcessorService` must construct `WebhookEvent` objects (not `Stripe.Event`) when passing stored events to strategies.

---

## Scenario 5: Processor passes generic WebhookEvent to strategies

**Given** a pending `webhook_event` record with `type = "invoice.paid"` and `payload = { id: "in_123", ... }`  
**When** `processEvent` picks up the record  
**Then** it constructs `{ id: record.stripeEventId, type: record.type, payload: record.payload }`  
**And** passes it to `strategy.handle(genericEvent)` with the `WebhookEvent` type  
**And** does NOT import or reference `Stripe` SDK types  

---

## Scenario 6: Strategy receives correct payload shape

**Given** the processor passes a `WebhookEvent` with `payload` set to the raw invoice JSON  
**When** `InvoicePaidStrategy.handle(event)` calls `paymentService.mapRawInvoice(event.payload)`  
**Then** `mapRawInvoice` receives a plain object matching `Stripe.Invoice` shape  
**And** correctly maps it to a `PaymentInvoice`  

---

# Spec: Dead Code Removal

## Scenario 7: StripeService deletion

**Given** `stripe.service.ts` exists but is not registered in `billing.module.ts` providers  
**When** the file is deleted  
**Then** no compilation errors occur  
**And** no other source file (excluding tests) imports from `stripe.service`  

---

## Scenario 8: Webhook controller test alignment

**Given** `stripe-webhook.controller.spec.ts` currently imports `StripeService`  
**When** the test is rewritten to inject `PaymentService`  
**Then** the test mocks match the controller's actual constructor dependencies (`PaymentService`, `PrismaService`, `WebhookProcessorService`, `AppLogger`)  
**And** all existing test scenarios continue to pass  

---

# Spec: Code Quality Fixes

## Scenario 9: Invoice retry threshold uses named constant

**Given** `InvoicePaymentFailedStrategy` checks `attemptCount < 3`  
**When** the threshold is extracted to a constant `MAX_INVOICE_RETRY_ATTEMPTS = 3`  
**Then** the same constant is shared with the webhook controller's `maxRetries: 3`  
**And** changing the value in one place updates both  

---

## Scenario 10: Factory spread is typed

**Given** `billing.module.ts` has `useFactory: (...strategies) => strategies`  
**When** the spread is typed as `(...strategies: WebhookStrategy[]) => strategies`  
**Then** no `@typescript-eslint/no-unsafe-*` lint errors are produced  

---

## Failure Scenarios

### Scenario F1: Invalid webhook signature

**Given** a request arrives with a corrupted `stripe-signature` header  
**When** `constructWebhookEvent` calls `stripe.webhooks.constructEvent`  
**Then** the Stripe SDK throws a signature verification error  
**And** the adapter wraps it as `ServiceError(ErrorCode.INVALID_WEBHOOK_SIGNATURE)`  
**And** no `WebhookEvent` is returned  

### Scenario F2: Unrecognized event type in processor

**Given** a stored webhook event has type `"balance.available"` (no strategy registered)  
**When** `processEvent` calls `strategyFactory.getStrategy("balance.available")`  
**Then** it returns `null`  
**And** the event is marked as `DONE` (acknowledged but no-op)  
