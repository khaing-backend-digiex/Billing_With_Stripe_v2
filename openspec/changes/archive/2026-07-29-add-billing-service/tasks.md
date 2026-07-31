## 1. Database Setup

- [x] 1.1 Create Prisma schema with all new models
- [x] 1.2 Run Prisma migration to create database tables
- [x] 1.3 Generate Prisma client

## 2. Exchange Rate Service

- [x] 2.1 Create ExchangeRateService with methods to fetch rates from ExchangeRate-API
- [x] 2.2 Implement caching logic to store rates in ExchangeRate table
- [x] 2.3 Add fallback mechanism to use cached rates when API fails
- [x] 2.4 Write unit tests for ExchangeRateService including API failure scenarios

## 3. Stripe Integration

- [x] 3.1 Create StripeService wrapper with methods for product/price/checkout operations
- [x] 3.2 Implement webhook signature verification in StripeService
- [x] 3.3 Add methods for subscription management (create, update, cancel)
- [x] 3.4 Write unit tests for StripeService

## 4. Product Catalog Module

- [x] 4.1 Create CatalogModule with controller and service
- [x] 4.2 Implement POST /admin/catalog/products endpoint to create products with multi-currency prices
- [x] 4.3 Implement GET /admin/catalog/products endpoint to list products
- [x] 4.4 Implement PUT /admin/catalog/products/:id endpoint to update products
- [x] 4.5 Implement POST /admin/catalog/products/:id/refresh-prices endpoint to refresh prices
- [x] 4.6 Implement GET /admin/catalog/exchange-rates endpoint
- [x] 4.7 Add DTOs for catalog endpoints with validation
- [x] 4.8 Write integration tests for catalog endpoints

## 5. Billing Module

- [x] 5.1 Create BillingModule with controller, service, and webhook controller
- [x] 5.2 Implement POST /billing/checkout/subscription endpoint for subscription checkout
- [x] 5.3 Implement POST /billing/checkout/addon endpoint for addon purchase checkout
- [x] 5.4 Implement GET /billing/subscriptions endpoint to list user subscriptions
- [x] 5.5 Create StripeWebhookController with POST /billing/webhook endpoint
- [x] 5.6 Implement webhook handler for checkout.session.completed (activate subscription, add addon credits)
- [x] 5.7 Implement webhook handler for invoice.paid (reset credits for Pro Monthly)
- [x] 5.8 Implement webhook handler for invoice.payment_failed (mark subscription PAST_DUE)
- [x] 5.9 Implement webhook handler for customer.subscription.deleted (downgrade to Free, freeze addon credits)
- [x] 5.10 Add idempotency logic to check WebhookEvent table before processing
- [x] 5.11 Implement same-tier subscription upgrade logic (Pro Monthly ↔ Pro Annual) using Stripe subscription.update with proration
- [x] 5.12 Implement cross-tier subscription change logic (Free ↔ Pro) using cancel + create
- [x] 5.13 Write integration tests for billing endpoints and webhook handlers

## 6. Credit System Module

- [x] 6.1 Create CreditModule with controller and service
- [x] 6.2 Implement POST /credits/consume endpoint with plan-first consumption logic
- [x] 6.3 Implement GET /credits/balance endpoint
- [x] 6.4 Add database transaction with row-level locking for atomic credit operations
- [x] 6.5 Implement credit validation logic (never negative, etc.)
- [x] 6.6 Create CreditResetCronService with monthly reset job for Free users
- [x] 6.7 Add monthly reset job for Pro Annual users
- [x] 6.8 Implement addon credit freezing logic (freeze remaining on Pro expiry)
- [x] 6.9 Implement addon credit unfreezing logic (unfreeze on Pro renewal)
- [x] 6.10 Write unit tests for CreditService including concurrent access scenarios
- [x] 6.11 Write integration tests for credit endpoints

## 7. Auth Integration

- [x] 7.1 Update User registration flow to create Stripe customer
- [x] 7.2 Create Free subscription ($0/month) in Stripe on registration
- [x] 7.3 Create CreditBalance record with 50 plan credits on registration
- [x] 7.4 Create initial Subscription record (FREE, ACTIVE) on registration
- [x] 7.5 Ensure entire registration flow is wrapped in database transaction
- [x] 7.6 Write integration tests for registration flow with Stripe integration

## 8. Configuration and Environment

- [x] 8.1 Add STRIPE_SECRET_KEY to environment configuration
- [x] 8.2 Add STRIPE_WEBHOOK_SECRET to environment configuration
- [x] 8.3 Add EXCHANGE_RATE_API_KEY to environment configuration
- [x] 8.4 Add supported currencies configuration (VND, USD, EUR, GBP)
- [x] 8.5 Update .env.example with new environment variables

## 9. End-to-End Testing

- [x] 9.1 Test complete user registration flow with Stripe customer creation
- [x] 9.2 Test Free to Pro Monthly upgrade flow
- [x] 9.3 Test Pro Monthly to Pro Annual same-tier upgrade with proration
- [x] 9.4 Test Pro to Free downgrade with addon credit freezing
- [x] 9.5 Test addon credit kit purchase and consumption
- [x] 9.6 Test monthly credit reset for Free users
- [x] 9.7 Test monthly credit reset for Pro Annual users
- [x] 9.8 Test webhook idempotency with duplicate events
- [x] 9.9 Test multi-currency checkout (VND, USD, EUR, GBP)
- [x] 9.10 Test exchange rate API failure with cached fallback
