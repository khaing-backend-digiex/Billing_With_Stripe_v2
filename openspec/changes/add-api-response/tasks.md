## 1. Setup & Dependencies

- [x] 1.1 Install `@nestjs/swagger` package (`npm install @nestjs/swagger`)
- [x] 1.2 Create `src/common/decorators/skip-transform.decorator.ts` — `@SkipTransform()` metadata decorator
- [x] 1.3 Create `src/common/interfaces/api-response.interface.ts` — `ApiResponse<T>`, `PaginatedMeta`, `RequestMeta` interfaces

## 2. Common Infrastructure

- [x] 2.1 Create `src/common/dto/pagination.dto.ts` — `PaginationMetaDto` (with `@ApiProperty`) and `PaginatedResponse<T>` generic class
- [x] 2.2 Create `src/common/interceptors/transform-response.interceptor.ts` — global `TransformResponseInterceptor` that wraps responses in `{ statusCode, data, meta }`, detects paginated responses, and respects `@SkipTransform()`
- [x] 2.3 Register `TransformResponseInterceptor` globally in `app.module.ts` using `APP_INTERCEPTOR` provider token

## 3. Response DTOs

- [x] 3.1 Create `src/auth/dto/auth-response.dto.ts` — `RegisterResponseDto` (id, email) and `LoginResponseDto` (id, email, roles, accessToken) with `@ApiProperty` decorators
- [x] 3.2 Create `src/billing/dto/billing-response.dto.ts` — `CheckoutUrlResponseDto` (url) and `SubscriptionResponseDto` (id, stripeSubscriptionId, plan, status, currentPeriodStart, currentPeriodEnd, createdAt, updatedAt) with `@ApiProperty` decorators
- [x] 3.3 Create `src/billing/dto/billing-query.dto.ts` — `SubscriptionListQueryDto` with validated `page`, `limit`, optional `status` filter
- [x] 3.4 Create `src/catalog/dto/catalog-response.dto.ts` — `PriceResponseDto`, `ProductWithPricesResponseDto`, `ExchangeRateResponseDto` with `@ApiProperty` decorators
- [x] 3.5 Create `src/catalog/dto/catalog-query.dto.ts` — `ProductListQueryDto` with validated `page`, `limit`, optional `planType` and `isActive` filters
- [x] 3.6 Create `src/credit/dto/credit-response.dto.ts` — `CreditBalanceResponseDto` (planCredits, addonCreditsAvailable, addonCreditsFrozen, lastResetAt, createdAt, updatedAt) with `@ApiProperty` decorators, excluding `userId`

## 4. Error Handling Refactor

- [x] 4.1 Refactor `src/common/filters/global-exception.filter.ts` — restructure error response to envelope format: `{ statusCode, error: { code, message, details? }, meta: { requestId, timestamp, path, method } }`
- [x] 4.2 Add new error code mappings to `GlobalExceptionFilter.mapServiceErrorToStatus()`: `EMAIL_ALREADY_IN_USE`→409, `INVALID_CREDENTIALS`→401, `PRODUCT_NOT_FOUND`→404, `EXCHANGE_RATE_UNAVAILABLE`→503
- [x] 4.3 Migrate `AuthService` — replace `ConflictException` with `ServiceError('EMAIL_ALREADY_IN_USE', ...)`, replace `UnauthorizedException` with `ServiceError('INVALID_CREDENTIALS', ...)`
- [x] 4.4 Migrate `CatalogService` — replace `NotFoundException` with `ServiceError('PRODUCT_NOT_FOUND', ...)`
- [x] 4.5 Migrate `ExchangeRateService` — replace `ServiceUnavailableException` with `ServiceError('EXCHANGE_RATE_UNAVAILABLE', ...)`

## 5. Logger Unification

- [x] 5.1 Migrate `CatalogService` — replace `new Logger(CatalogService.name)` with injected `AppLogger`
- [x] 5.2 Migrate `ExchangeRateService` — replace `new Logger(ExchangeRateService.name)` with injected `AppLogger`

## 6. Service Layer Updates (Pagination)

- [x] 6.1 Update `CatalogService.findAllProducts()` — accept pagination params, return `{ data, total }` using Prisma `skip`/`take`/`count`
- [x] 6.2 Update `BillingService.getUserSubscriptions()` — accept pagination params, return `{ data, total }` using Prisma `skip`/`take`/`count`

## 7. Controller Updates

- [x] 7.1 Update `AuthController` — add `@ApiTags('Auth')`, `@ApiOperation`, `@ApiResponse` decorators, type return values with response DTOs
- [x] 7.2 Update `BillingController` — add `@ApiTags('Billing')`, `@ApiOperation`, `@ApiResponse` decorators, implement pagination for `getUserSubscriptions` using `paginated()` helper, type return values
- [x] 7.3 Update `StripeWebhookController` — add `@SkipTransform()` decorator to webhook handler, ensure raw `{ received: true }` response
- [x] 7.4 Update `CatalogController` — add `@ApiTags('Catalog')`, `@ApiOperation`, `@ApiResponse` decorators, implement pagination for `findAllProducts` using `paginated()` helper, type return values
- [x] 7.5 Update `CreditController` — add `@ApiTags('Credits')`, `@ApiOperation`, `@ApiResponse` decorators, type return values with response DTOs

## 8. API Versioning

- [x] 8.1 Update `main.ts` — add `app.setGlobalPrefix('api/v1', { exclude: ['webhooks/stripe'] })`

## 9. Swagger Setup

- [x] 9.1 Update `main.ts` — configure Swagger with `DocumentBuilder`, setup at `/api/docs` with title "Billing API", version "1.0", Bearer auth
- [x] 9.2 Add `@ApiBearerAuth()` to all authenticated endpoints across all controllers

## 10. Test Updates

- [ ] 10.1 Update `test/billing.e2e-spec.ts` — assert envelope response shape (`res.body.data`, `res.body.meta`), update route paths to `/api/v1/...`
- [ ] 10.2 Update `src/auth/auth.service.spec.ts` — update assertions for `ServiceError` instead of `HttpException`
- [ ] 10.3 Update `src/catalog/__tests__/catalog.service.spec.ts` — update assertions for `ServiceError` and pagination return shape
- [ ] 10.4 Update `src/catalog/__tests__/exchange-rate.service.spec.ts` — update assertions for `ServiceError`
- [ ] 10.5 Update `src/credit/__tests__/credit.service.spec.ts` — update for any response shape changes
- [ ] 10.6 Update `src/billing/__tests__/stripe-webhook.controller.spec.ts` — verify `@SkipTransform` preserves raw response
- [ ] 10.7 Create `src/common/__tests__/transform-response.interceptor.spec.ts` — test envelope wrapping, pagination detection, `@SkipTransform` bypass, meta field population

## 11. Verification

- [ ] 11.1 Run `npm run build` — verify no TypeScript compilation errors
- [ ] 11.2 Run `npm test` — verify all unit and integration tests pass
- [ ] 11.3 Run `npm run test:e2e` — verify E2E tests pass with new envelope format and routes
- [ ] 11.4 Manual verification — start app, hit `/api/docs` to verify Swagger UI renders correctly
