## Why

The API currently returns raw, unwrapped responses with inconsistent error handling and no standard structure. Clients have no way to distinguish between success and error responses programmatically, pagination is missing for list endpoints, and there's no API documentation. This creates friction for frontend integration and makes the API harder to maintain and evolve.

## What Changes

- **BREAKING**: Wrap all success responses in a standard envelope: `{ statusCode, data, meta }`
- **BREAKING**: Refactor error responses to use nested error object: `{ statusCode, error: { code, message, details? }, meta }`
- **BREAKING**: Add `/api/v1/` prefix to all routes (except webhooks)
- Add response DTOs for all endpoints to control field exposure and enable Swagger documentation
- Add pagination metadata for list endpoints (products, subscriptions)
- Integrate `@nestjs/swagger` for API documentation at `/api/docs`
- Create `TransformResponseInterceptor` to automatically wrap responses in the envelope
- Create `@SkipTransform()` decorator for endpoints that bypass wrapping (webhooks)
- Unify error handling: migrate all services to use `ServiceError` with structured error codes
- Unify logging: migrate remaining services to `AppLogger` (Pino)

## Capabilities

### New Capabilities
- `api-response-envelope`: Standard response envelope pattern with TransformResponseInterceptor, pagination metadata, and API versioning
- `response-dtos`: Response DTOs for all endpoints with field exposure control and Swagger decorators
- `swagger-documentation`: OpenAPI/Swagger integration with auto-generated documentation at `/api/docs`

### Modified Capabilities
- `global-error-handling`: Refactor error response to use nested error object within envelope, unify all services to use ServiceError
- `structured-logging`: Migrate remaining services (CatalogService, ExchangeRateService) to AppLogger

## Impact

**Breaking API Changes:**
- All response shapes change (envelope wrapper)
- All routes change (add `/api/v1/` prefix)
- List endpoints return paginated structure: `{ data: [...], meta: { pagination: {...} } }`

**Affected Code:**
- All 5 controllers (AuthController, BillingController, StripeWebhookController, CatalogController, CreditController)
- All services (AuthService, CatalogService, ExchangeRateService need ServiceError migration)
- GlobalExceptionFilter (refactor to envelope format)
- main.ts (add global prefix, register interceptor, setup Swagger)
- app.module.ts (register TransformResponseInterceptor)

**New Dependencies:**
- `@nestjs/swagger` (Swagger/OpenAPI integration)

**Test Impact:**
- E2E tests (billing.e2e-spec.ts) need updates for envelope shape and new routes
- Unit tests need updates for ServiceError throws in auth/catalog services
- New tests for TransformResponseInterceptor and pagination logic

**Frontend Impact:**
- Frontend must be updated to handle envelope structure
- Frontend must update all API calls to use `/api/v1/` prefix
- Frontend must handle paginated responses for list endpoints
