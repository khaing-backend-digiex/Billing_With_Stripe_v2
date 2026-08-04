# Design: Payment Adapter Pattern

## Architecture

We will implement a Port & Adapter pattern for the payments module.

1. **Port**: `IPaymentAdapter` interface, establishing the contract.
2. **Adapter**: `StripeAdapter`, implementing `IPaymentAdapter` and handling all Stripe-specific logic.
3. **Core**: `PaymentService`, invoking methods on `IPaymentAdapter` and dealing with high-level coordination and DB updates using generic types (e.g., `PaymentInvoice`).

### File Structure
```
src/billing/payments/
  ├── types/
  │   ├── payment.types.ts
  │   └── payment-adapter.interface.ts
  └── adapters/
      └── stripe.adapter.ts
```

## Data Models

**`PaymentInvoice`**
```typescript
export interface PaymentInvoice {
  id: string;
  customerId: string | null;
  subscriptionId: string | null;
  amountDue: number;
  amountPaid: number;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void' | null;
  lines: Array<{
    type: string;
    isProration: boolean;
    subscriptionId?: string;
    priceId?: string;
    periodStart: number;
    periodEnd: number;
  }>;
}
```

**`WebhookEvent`**
```typescript
export interface WebhookEvent {
  type: string;
  payload: unknown;
}
```

## Refactoring Strategy
1. Rename `stripe.service.ts` to `payment.service.ts`.
2. Extract all Stripe logic from `PaymentService` into `StripeAdapter`.
3. Provide `StripeAdapter` for the `PAYMENT_ADAPTER` token in `billing.module.ts`.
4. Refactor `InvoicePaidStrategy`, `InvoicePaymentFailedStrategy`, and `CustomerSubscriptionUpdatedStrategy` to rely on generic `PaymentInvoice` and `WebhookEvent` types instead of Stripe SDK typings.
