## Why

The billing system lacks structured logging and centralized error handling, making it difficult to debug payment failures, webhook issues, and subscription state problems in production. Without correlation IDs and consistent error formatting, tracing requests across services and identifying root causes of billing errors is time-consuming and error-prone.

## What Changes

- Add structured logging with Pino (JSON format in production, pretty-print in development)
- Implement global exception filter that catches all errors and returns consistent JSON responses
- Create `ServiceError` class with domain-specific error codes for billing operations
- Add request correlation IDs (extract from `X-Request-Id` header or generate UUID)
- Inject `AppLogger` into all services instead of using `new Logger()`
- Configure 4xx HTTP errors to log at `error` level (not `warn`) for billing system visibility
- Migrate existing exception throws to use `ServiceError` with specific codes

## Capabilities

### New Capabilities
- `structured-logging`: Pino-based logger with correlation ID tracking, environment-aware formatting, and injection-based usage
- `global-error-handling`: Centralized exception filter with ServiceError codes, Prisma error handling, and consistent JSON error responses

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

**Dependencies:**
- Add: `nestjs-pino`, `pino-http`, `pino-pretty` (dev)
- No breaking changes to public APIs

**Files to create:**
- `src/logger/app-logger.ts` - Pino wrapper implementing NestJS LoggerService
- `src/logger/logger-config.ts` - Environment-based Pino configuration
- `src/logger/logger.module.ts` - Module exports
- `src/common/exceptions/service-error.exception.ts` - Domain error class
- `src/common/filters/global-exception.filter.ts` - Express-based exception filter
- `src/common/middleware/correlation-id.middleware.ts` - Request ID extraction/generation

**Files to modify:**
- `src/app.module.ts` - Import LoggerModule, register exception filter
- `src/main.ts` - Setup correlation middleware, initialize Pino, use AppLogger
- `src/billing/billing.service.ts` - Inject AppLogger, migrate 7 exception throws
- `src/billing/stripe.service.ts` - Inject AppLogger, add Stripe API error wrapping
- `src/credit/credit.service.ts` - Inject AppLogger, migrate 5 exception throws
- `src/billing/stripe-webhook.controller.ts` - Migrate 1 exception throw

**ServiceError codes:**
- `USER_NOT_FOUND`, `PRICE_NOT_FOUND`, `SUBSCRIPTION_NOT_FOUND`, `CREDIT_BALANCE_NOT_FOUND` → 404
- `INSUFFICIENT_CREDITS`, `INVALID_WEBHOOK_SIGNATURE`, `ADDON_REQUIRES_PRO`, `CROSS_TIER_UPGRADE_DENIED` → 400
- `STRIPE_API_ERROR` → 502 (with original error details)

**Logging behavior:**
- All logs include `reqId` field for correlation
- 4xx errors log at `error` level (not `warn`)
- 5xx errors log at `error` level with full stack traces
- Stripe API errors wrapped with context (endpoint, params)
