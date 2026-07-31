# API Documentation

## Billing Webhook Endpoint

### POST /billing/webhook

Receives Stripe webhook events for asynchronous processing.

**Headers:**
- `stripe-signature`: Stripe webhook signature (required)

**Request Body:**
- Raw JSON payload from Stripe (automatically parsed)

**Response:**
```json
{
  "received": true,
  "duplicate": false
}
```

**Status Codes:**
- `200 OK`: Event received and queued for processing
- `400 Bad Request`: Invalid signature or malformed payload

**Supported Event Types:**
- `checkout.session.completed` - Subscription activation or addon purchase
- `invoice.paid` - Credit reset for recurring payments
- `invoice.payment_failed` - Mark subscription as PAST_DUE, freeze credits
- `customer.subscription.updated` - Sync plan changes and period dates
- `customer.subscription.deleted` - Cancel subscription, downgrade to FREE

**Processing Model:**
- Events are stored with `status: PENDING` and processed asynchronously
- Background processor runs every 30 seconds
- Failed events retry every 1 day, up to 3 times
- After 3 failures, subscription is canceled and user downgraded to FREE tier
- Duplicate events (same `stripeEventId`) are detected and ignored

**Security:**
- Signature verification uses raw request body
- Idempotency enforced via unique `stripeEventId`
