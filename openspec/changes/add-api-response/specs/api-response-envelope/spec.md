## ADDED Requirements

### Requirement: Global response envelope structure
All successful API responses MUST be wrapped in a standard envelope containing `statusCode`, `data`, and `meta` fields.

#### Scenario: Successful single resource response
- **WHEN** a client makes a successful GET request to `/api/v1/auth/login`
- **THEN** the response body MUST be:
  ```json
  {
    "statusCode": 200,
    "data": {
      "id": "user-uuid",
      "email": "user@example.com",
      "roles": ["USER"],
      "accessToken": "jwt-token"
    },
    "meta": {
      "requestId": "request-uuid",
      "timestamp": "2026-08-03T10:00:00.000Z",
      "path": "/api/v1/auth/login",
      "method": "POST"
    }
  }
  ```

#### Scenario: Successful list response without pagination
- **WHEN** a client makes a successful GET request to `/api/v1/catalog/exchange-rates`
- **THEN** the response body MUST be:
  ```json
  {
    "statusCode": 200,
    "data": [
      { "targetCurrency": "USD", "rate": 0.000042, "updatedAt": "2026-08-03T10:00:00.000Z" }
    ],
    "meta": {
      "requestId": "request-uuid",
      "timestamp": "2026-08-03T10:00:00.000Z",
      "path": "/api/v1/catalog/exchange-rates",
      "method": "GET"
    }
  }
  ```

### Requirement: Pagination metadata for list endpoints
List endpoints MUST include pagination metadata in the `meta.pagination` field when returning arrays.

#### Scenario: Paginated product list response
- **WHEN** a client makes a GET request to `/api/v1/catalog/products?page=1&limit=20`
- **THEN** the response body MUST include pagination metadata:
  ```json
  {
    "statusCode": 200,
    "data": [...],
    "meta": {
      "requestId": "request-uuid",
      "timestamp": "2026-08-03T10:00:00.000Z",
      "path": "/api/v1/catalog/products",
      "method": "GET",
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 150,
        "totalPages": 8,
        "hasNext": true,
        "hasPrev": false
      }
    }
  }
  ```

#### Scenario: Paginated subscription list response
- **WHEN** a client makes a GET request to `/api/v1/billing/subscriptions?page=2&limit=10`
- **THEN** the response MUST include `meta.pagination` with `page: 2`, `limit: 10`, `total`, `totalPages`, `hasNext`, and `hasPrev` fields

#### Scenario: Default pagination values
- **WHEN** a client requests a paginated endpoint without `page` or `limit` query parameters
- **THEN** the system MUST use default values: `page=1` and `limit=20` for products, `limit=10` for subscriptions

### Requirement: API versioning with global prefix
All API routes MUST be prefixed with `/api/v1/` except for webhook endpoints.

#### Scenario: Auth endpoints use versioned prefix
- **WHEN** a client accesses auth endpoints
- **THEN** routes MUST be `/api/v1/auth/register` and `/api/v1/auth/login`

#### Scenario: Billing endpoints use versioned prefix
- **WHEN** a client accesses billing endpoints
- **THEN** routes MUST be `/api/v1/billing/checkout/subscription`, `/api/v1/billing/checkout/addon`, and `/api/v1/billing/subscriptions`

#### Scenario: Catalog endpoints use versioned prefix
- **WHEN** a client accesses catalog endpoints
- **THEN** routes MUST be `/api/v1/catalog/products`, `/api/v1/catalog/products/:id`, `/api/v1/catalog/products/:id/refresh-prices`, and `/api/v1/catalog/exchange-rates`

#### Scenario: Credit endpoints use versioned prefix
- **WHEN** a client accesses credit endpoints
- **THEN** routes MUST be `/api/v1/credits/consume` and `/api/v1/credits/balance`

#### Scenario: Webhook endpoint has no version prefix
- **WHEN** Stripe sends webhook events
- **THEN** the endpoint MUST remain at `/webhooks/stripe` (no `/api/v1/` prefix)

### Requirement: TransformResponseInterceptor implementation
The system MUST implement a global `TransformResponseInterceptor` that wraps all responses in the envelope format.

#### Scenario: Interceptor wraps successful responses
- **WHEN** a controller returns data
- **THEN** the interceptor MUST wrap it in `{ statusCode, data, meta }` format

#### Scenario: Interceptor adds meta fields
- **WHEN** the interceptor processes a response
- **THEN** the `meta` object MUST include `requestId` (from correlation ID), `timestamp` (ISO 8601), `path` (request URL), and `method` (HTTP method)

#### Scenario: Interceptor skips transformation when decorated
- **WHEN** a controller method is decorated with `@SkipTransform()`
- **THEN** the interceptor MUST NOT wrap the response and MUST return it as-is

### Requirement: SkipTransform decorator
The system MUST provide a `@SkipTransform()` decorator that allows endpoints to bypass response envelope wrapping.

#### Scenario: Webhook endpoint uses SkipTransform
- **WHEN** the StripeWebhookController handles webhook events
- **THEN** it MUST be decorated with `@SkipTransform()` and return `{ received: true }` without envelope wrapping

#### Scenario: SkipTransform preserves raw response
- **WHEN** an endpoint decorated with `@SkipTransform()` returns data
- **THEN** the response body MUST be exactly what the controller returns, with no envelope wrapper

### Requirement: Pagination query parameters
Paginated endpoints MUST accept `page` and `limit` query parameters with validation.

#### Scenario: Valid pagination parameters
- **WHEN** a client requests `/api/v1/catalog/products?page=2&limit=10`
- **THEN** the system MUST validate `page` is a positive integer (>= 1) and `limit` is between 1 and 100

#### Scenario: Invalid pagination parameters
- **WHEN** a client requests `/api/v1/catalog/products?page=0&limit=200`
- **THEN** the system MUST return a 400 error with validation details

#### Scenario: Pagination parameter defaults
- **WHEN** a client requests a paginated endpoint without query parameters
- **THEN** the system MUST use `page=1` and the module-specific default `limit` (20 for products, 10 for subscriptions)
