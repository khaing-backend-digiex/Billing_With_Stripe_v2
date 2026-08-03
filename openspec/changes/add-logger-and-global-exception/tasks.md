## 1. Dependencies & Setup

- [x] 1.1 Install runtime dependencies: `nestjs-pino`, `pino-http`
- [x] 1.2 Install dev dependency: `pino-pretty`
- [x] 1.3 Create directory structure: `src/logger/` and `src/common/exceptions/` and `src/common/filters/` and `src/common/middleware/`

## 2. Logger Infrastructure

- [x] 2.1 Create `src/logger/logger-config.ts` with Pino configuration (JSON for production, pino-pretty transport for development)
- [x] 2.2 Create `src/logger/app-logger.ts` implementing NestJS `LoggerService` interface, wrapping `PinoLogger`
- [x] 2.3 Create `src/logger/logger.module.ts` that exports `AppLogger` and configures `PinoLogger` using `LoggerConfig`
- [x] 2.4 Add sensitive data redaction configuration to `LoggerConfig` (redact `authorization` header, `password` fields in request body)

## 3. Exception Infrastructure

- [x] 3.1 Create `src/common/exceptions/service-error.exception.ts` with `code`, `message`, and optional `details` properties
- [x] 3.2 Create `src/common/filters/global-exception.filter.ts` implementing `ExceptionFilter` with `@Catch()` decorator
- [x] 3.3 Implement ServiceError code to HTTP status mapping in filter: `USER_NOT_FOUND`, `PRICE_NOT_FOUND`, `SUBSCRIPTION_NOT_FOUND`, `CREDIT_BALANCE_NOT_FOUND` → 404
- [x] 3.4 Implement ServiceError code to HTTP status mapping for validation errors: `INSUFFICIENT_CREDITS`, `INVALID_WEBHOOK_SIGNATURE`, `ADDON_REQUIRES_PRO`, `CROSS_TIER_UPGRADE_DENIED` → 400
- [x] 3.5 Implement `STRIPE_API_ERROR` → 502 mapping in filter
- [x] 3.6 Add Prisma error handling: catch `PrismaClientKnownRequestError` and `PrismaClientValidationError`, return 400 with structured details
- [x] 3.7 Add HttpException handling to extract message, error name, and details from response
- [x] 3.8 Add fallback handling for unknown errors (500 Internal Server Error)
- [x] 3.9 Implement consistent error response format: `{ statusCode, timestamp, path, method, message, error, details? }`
- [x] 3.10 Configure filter to log all 4xx and 5xx errors at `error` level with request context (path, method, reqId)

## 4. Correlation ID Middleware

- [x] 4.1 Create `src/common/middleware/correlation-id.middleware.ts` that extracts `X-Request-Id` header or generates UUID v4
- [x] 4.2 Attach correlation ID to request object for downstream access
- [x] 4.3 Inject correlation ID into Pino logger context using `PinoLogger.assignKeys()` or child logger

## 5. Wire Up Application

- [x] 5.1 Update `src/app.module.ts` to import `LoggerModule`
- [x] 5.2 Register `GlobalExceptionFilter` as global filter using `APP_FILTER` provider token in `AppModule`
- [x] 5.3 Update `src/main.ts` to apply correlation ID middleware globally using `app.use()`
- [x] 5.4 Update `src/main.ts` to use `AppLogger` as the application logger via `app.useLogger()`
- [x] 5.5 Configure `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` (if not already present)

## 6. Migrate Billing Services

- [x] 6.1 Update `src/billing/billing.service.ts` to inject `AppLogger` instead of `new Logger()`
- [x] 6.2 Replace `NotFoundException('User not found')` with `ServiceError('USER_NOT_FOUND', 'User not found')` in billing.service.ts
- [x] 6.3 Replace `NotFoundException('Price not found')` with `ServiceError('PRICE_NOT_FOUND', 'Price not found')` in billing.service.ts
- [x] 6.4 Replace `BadRequestException('Add-on purchases require Pro subscription')` with `ServiceError('ADDON_REQUIRES_PRO', 'Add-on purchases require Pro subscription')` in billing.service.ts
- [x] 6.5 Replace `NotFoundException('No active subscription')` with `ServiceError('SUBSCRIPTION_NOT_FOUND', 'No active subscription')` in billing.service.ts
- [x] 6.6 Replace `BadRequestException('Cross-tier changes require cancel and create')` with `ServiceError('CROSS_TIER_UPGRADE_DENIED', 'Cross-tier changes require cancel and create')` in billing.service.ts

## 7. Migrate Stripe Service

- [x] 7.1 Update `src/billing/stripe.service.ts` to inject `AppLogger` instead of `new Logger()`
- [x] 7.2 Wrap `createCheckoutSession()` in try-catch, throw `ServiceError('STRIPE_API_ERROR', 'Failed to create checkout session', { originalError, endpoint: 'checkout.sessions.create' })`
- [x] 7.3 Wrap `createCustomer()` in try-catch with similar error wrapping
- [x] 7.4 Wrap `createSubscription()` in try-catch with similar error wrapping
- [x] 7.5 Wrap `updateSubscription()` in try-catch with similar error wrapping
- [x] 7.6 Wrap `cancelSubscription()` in try-catch with similar error wrapping
- [x] 7.7 Wrap `getSubscription()` in try-catch with similar error wrapping
- [x] 7.8 Wrap `getCheckoutSession()` in try-catch with similar error wrapping
- [x] 7.9 Wrap `verifyWebhookSignature()` in try-catch, throw `ServiceError('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature')` on failure

## 8. Migrate Credit Service

- [x] 8.1 Update `src/credit/credit.service.ts` to inject `AppLogger` instead of `new Logger()`
- [x] 8.2 Replace `NotFoundException('Credit balance not found')` with `ServiceError('CREDIT_BALANCE_NOT_FOUND', 'Credit balance not found')` in all occurrences
- [x] 8.3 Replace `BadRequestException('Insufficient credits')` with `ServiceError('INSUFFICIENT_CREDITS', 'Insufficient credits')` in credit.service.ts

## 9. Migrate Webhook Controller

- [x] 9.1 Update `src/billing/stripe-webhook.controller.ts` to replace `BadRequestException('Invalid webhook signature')` with `ServiceError('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature')`

## 10. Testing & Verification

- [x] 10.1 Verify all billing endpoints return consistent error response format
- [x] 10.2 Verify logs include correlation ID (`reqId` field) for all requests
- [x] 10.3 Verify 4xx errors log at `error` level (not `warn`)
- [x] 10.4 Verify Prisma errors return 400 with structured details
- [x] 10.5 Verify Stripe API errors return 502 with original error details
- [x] 10.6 Verify sensitive data (authorization headers, passwords) is redacted in logs
- [x] 10.7 Run existing test suite and fix any broken tests due to logger injection
- [x] 10.8 Test both development (pretty-print) and production (JSON) log formats
