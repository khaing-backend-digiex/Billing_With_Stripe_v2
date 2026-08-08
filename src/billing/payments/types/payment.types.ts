export interface PaymentCustomer {
  id: string;
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface PaymentSubscription {
  id: string;
  customerId: string;
  status: string;
  items: Array<{
    id: string;
    priceId: string;
    priceMetadata?: Record<string, string>;
  }>;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAt?: number | null;
  cancelAtPeriodEnd?: boolean;
}

export interface PaymentInvoice {
  id: string;
  customerId: string | null;
  subscriptionId: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void' | null;
  hostedInvoiceUrl?: string | null;
  invoicePdf?: string | null;
  periodStart: number;
  periodEnd: number;
  attemptCount?: number;
  created: number;
  lines: Array<{
    type: string;
    isProration: boolean;
    subscriptionId?: string;
    priceId?: string;
    periodStart: number;
    periodEnd: number;
  }>;
}

export interface PaymentSession {
  id: string;
  url: string | null;
  subscriptionId?: string | null;
  paymentIntentId?: string | null;
  metadata?: Record<string, string>;
  customerId?: string | null;
  mode?: string;
}

export interface PaymentMethodDetails {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
}

export interface SetupIntentResult {
  id: string;
  clientSecret: string | null;
  status: string;
}

export interface OffSessionPaymentResult {
  id: string;
  status: string;
  clientSecret?: string | null;
}

export interface OffSessionSubscriptionResult {
  id: string;
  status: string;
  clientSecret?: string | null;
}

export interface BillingPortalSession {
  id: string;
  url: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  payload: unknown;
}

export interface PaymentProduct {
  id: string;
  name: string;
  active: boolean;
  metadata?: Record<string, string>;
}

export interface PaymentPrice {
  id: string;
  productId: string;
  amount: number;
  currency: string;
  interval?: string | null;
  active: boolean;
}

export interface UpcomingInvoice {
  prorationAmount: number;
  newCharge: number;
  netAmount: number;
  currency: string;
  nextBillingDate: Date;
}
