# Tasks: Add Adapter Pattern for Payments

- [x] **Task 1: Define Generic Payment Types**
  - Create `src/billing/payments/types/payment.types.ts`.
  - Define interfaces for `PaymentCustomer`, `PaymentSubscription`, `PaymentInvoice`, `PaymentSession`, `PaymentMethodDetails`, and `WebhookEvent`.

- [x] **Task 2: Define IPaymentAdapter Interface**
  - Create `src/billing/payments/types/payment-adapter.interface.ts`.
  - Declare all required methods (`createCustomer`, `createCheckoutSession`, `mapRawInvoice`, etc.).

- [x] **Task 3: Implement StripeAdapter**
  - Create `src/billing/payments/adapters/stripe.adapter.ts`.
  - Inject environment variables / config.
  - Instantiate `new Stripe(...)`.
  - Implement all methods from `IPaymentAdapter`, mapping Stripe API responses to generic types.

- [x] **Task 4: Refactor PaymentService (formerly StripeService)**
  - Rename `stripe.service.ts` to `payment.service.ts`.
  - Remove direct Stripe imports.
  - Inject `IPaymentAdapter` using the `"PAYMENT_ADAPTER"` token.
  - Update methods to delegate to the adapter and use generic payment types.

- [x] **Task 5: Refactor Webhook Strategies**
  - Update `InvoicePaidStrategy`, `InvoicePaymentFailedStrategy`, and `CustomerSubscriptionUpdatedStrategy`.
  - Accept `WebhookEvent` instead of `Stripe.Event`.
  - Call `PaymentService.mapRawInvoice(event.payload)` or `mapRawSubscription(event.payload)`.
  - Fix logic to read `subscriptionId` directly from the generic mapped object rather than accessing `Stripe.Invoice` lines.

- [x] **Task 6: Update Dependency Injection & Module Bindings**
  - Update `billing.module.ts`.
  - Add `{ provide: 'PAYMENT_ADAPTER', useClass: StripeAdapter }` to providers.
  - Update `StripeService` imports to `PaymentService` across the codebase (`billing.service.ts`, `webhook-strategy.factory.ts`, etc.).
