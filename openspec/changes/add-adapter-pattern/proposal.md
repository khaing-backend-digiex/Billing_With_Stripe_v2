# Change Proposal: Add Adapter Pattern for Payments

## What
Refactor the billing module to implement the Adapter Pattern. This involves creating generic payment types and an `IPaymentAdapter` interface, moving all Stripe-specific code into a `StripeAdapter`, and updating the existing services (`billing.service.ts`) and webhook strategies to use generic types. 

## Why
Currently, the billing domain is tightly coupled to the Stripe Node.js SDK. Stripe objects (e.g., `Stripe.Invoice`, `Stripe.Subscription`) and logic dictate the shape of our business logic. This causes issues when Stripe's API typings update (e.g., missing properties like `invoice.subscription`), forcing complex type casting. 

By abstracting Stripe behind an adapter, we achieve:
1. **Separation of Concerns**: Core billing logic only interacts with generic models (`PaymentInvoice`, `PaymentSubscription`).
2. **Resilience**: Breaking changes in the Stripe SDK will only require updates in a single file (`stripe.adapter.ts`).
3. **Testability**: The `IPaymentAdapter` can be easily mocked in unit tests.
