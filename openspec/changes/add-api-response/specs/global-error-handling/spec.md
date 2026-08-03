## MODIFIED Requirements

### Requirement: Consistent error response format
All error responses SHALL follow a consistent JSON structure with `statusCode`, `error` object (containing `code`, `message`, and optional `details`), and `meta` object (containing `requestId`, `timestamp`, `path`, `method`).

#### Scenario: Error response structure
- **GIVEN** any unhandled exception
- **WHEN** the exception filter sends the response
- **THEN** the response body SHALL be:
  ```json
  {
    "statusCode": 400,
    "error": {
      "code": "INSUFFICIENT_CREDITS",
      "message": "Insufficient credits",
      "details": { "required": 100, "available": 50 }
    },
    "meta": {
      "requestId": "request-uuid",
      "timestamp": "2026-08-03T10:00:00.000Z",
      "path": "/api/v1/billing/checkout",
      "method": "POST"
    }
  }
  ```

#### Scenario: Error response without details
- **GIVEN** an exception without a `details` property
- **WHEN** the exception filter sends the response
- **THEN** the error object SHALL omit the `details` field (not include `details: null`)

#### Scenario: Error response includes request metadata
- **GIVEN** any exception occurs during request processing
- **WHEN** the exception filter constructs the error response
- **THEN** the `meta` object SHALL include `requestId` from the correlation ID middleware
- **AND** `timestamp` in ISO 8601 format
- **AND** `path` containing the request URL
- **AND** `method` containing the HTTP method

## ADDED Requirements

### Requirement: Migrate AuthService to ServiceError
The AuthService SHALL use `ServiceError` for all domain exceptions instead of NestJS HttpException classes.

#### Scenario: Email already in use error
- **GIVEN** a user attempts to register with an email that already exists
- **WHEN** the AuthService detects the duplicate email
- **THEN** it SHALL throw `new ServiceError('EMAIL_ALREADY_IN_USE', 'Email already in use')`

#### Scenario: Invalid credentials error
- **GIVEN** a user attempts to login with incorrect credentials
- **WHEN** the AuthService validates the credentials
- **THEN** it SHALL throw `new ServiceError('INVALID_CREDENTIALS', 'Invalid email or password')`

#### Scenario: User not found error
- **GIVEN** a user ID is provided that does not exist
- **WHEN** the AuthService queries for the user
- **THEN** it SHALL throw `new ServiceError('USER_NOT_FOUND', 'User not found')`

### Requirement: Migrate CatalogService to ServiceError
The CatalogService SHALL use `ServiceError` for all domain exceptions instead of NestJS HttpException classes.

#### Scenario: Product not found error
- **GIVEN** a product ID is provided that does not exist
- **WHEN** the CatalogService queries for the product
- **THEN** it SHALL throw `new ServiceError('PRODUCT_NOT_FOUND', 'Product not found')`

#### Scenario: Price not found error
- **GIVEN** a price ID is provided that does not exist
- **WHEN** the CatalogService queries for the price
- **THEN** it SHALL throw `new ServiceError('PRICE_NOT_FOUND', 'Price not found')`

### Requirement: Migrate ExchangeRateService to ServiceError
The ExchangeRateService SHALL use `ServiceError` for all domain exceptions instead of NestJS HttpException classes.

#### Scenario: Exchange rate unavailable error
- **GIVEN** the exchange rate API is unreachable or returns an error
- **WHEN** the ExchangeRateService attempts to fetch rates
- **THEN** it SHALL throw `new ServiceError('EXCHANGE_RATE_UNAVAILABLE', 'Unable to fetch exchange rates', { provider: 'api-provider', originalError: error.message })`

### Requirement: Update ServiceError code to HTTP status mapping
The GlobalExceptionFilter SHALL map new ServiceError codes to appropriate HTTP status codes.

#### Scenario: EMAIL_ALREADY_IN_USE maps to 409
- **GIVEN** a `ServiceError` with code `EMAIL_ALREADY_IN_USE`
- **WHEN** the exception filter processes the error
- **THEN** the HTTP response status SHALL be 409 (Conflict)

#### Scenario: INVALID_CREDENTIALS maps to 401
- **GIVEN** a `ServiceError` with code `INVALID_CREDENTIALS`
- **WHEN** the exception filter processes the error
- **THEN** the HTTP response status SHALL be 401 (Unauthorized)

#### Scenario: PRODUCT_NOT_FOUND maps to 404
- **GIVEN** a `ServiceError` with code `PRODUCT_NOT_FOUND`
- **WHEN** the exception filter processes the error
- **THEN** the HTTP response status SHALL be 404 (Not Found)

#### Scenario: EXCHANGE_RATE_UNAVAILABLE maps to 503
- **GIVEN** a `ServiceError` with code `EXCHANGE_RATE_UNAVAILABLE`
- **WHEN** the exception filter processes the error
- **THEN** the HTTP response status SHALL be 503 (Service Unavailable)
