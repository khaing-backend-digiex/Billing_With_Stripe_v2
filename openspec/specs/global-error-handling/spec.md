## ADDED Requirements

### Requirement: ServiceError domain exception class
The system SHALL provide a `ServiceError` class that extends `Error` with `code` (string), `message` (string), and optional `details` (any) properties for domain-specific error handling.

#### Scenario: ServiceError with code and message
- **GIVEN** a service throws `new ServiceError('INSUFFICIENT_CREDITS', 'Not enough credits')`
- **WHEN** the exception filter catches the error
- **THEN** the error response SHALL include `"error": "INSUFFICIENT_CREDITS"` and `"message": "Not enough credits"`

#### Scenario: ServiceError with details
- **GIVEN** a service throws `new ServiceError('INSUFFICIENT_CREDITS', 'Not enough credits', { required: 100, available: 50 })`
- **WHEN** the exception filter catches the error
- **THEN** the error response SHALL include `"details": { "required": 100, "available": 50 }`

### Requirement: ServiceError code to HTTP status mapping
The global exception filter SHALL map `ServiceError` codes to HTTP status codes according to a predefined mapping table.

#### Scenario: NOT_FOUND codes map to 404
- **GIVEN** a `ServiceError` with code `USER_NOT_FOUND`, `PRICE_NOT_FOUND`, `SUBSCRIPTION_NOT_FOUND`, or `CREDIT_BALANCE_NOT_FOUND`
- **WHEN** the exception filter processes the error
- **THEN** the HTTP response status SHALL be 404

#### Scenario: Validation codes map to 400
- **GIVEN** a `ServiceError` with code `INSUFFICIENT_CREDITS`, `INVALID_WEBHOOK_SIGNATURE`, `ADDON_REQUIRES_PRO`, or `CROSS_TIER_UPGRADE_DENIED`
- **WHEN** the exception filter processes the error
- **THEN** the HTTP response status SHALL be 400

#### Scenario: External service errors map to 502
- **GIVEN** a `ServiceError` with code `STRIPE_API_ERROR`
- **WHEN** the exception filter processes the error
- **THEN** the HTTP response status SHALL be 502 (Bad Gateway)

#### Scenario: Unknown codes map to 400
- **GIVEN** a `ServiceError` with an unmapped code
- **WHEN** the exception filter processes the error
- **THEN** the HTTP response status SHALL default to 400

### Requirement: Prisma error handling
The global exception filter SHALL catch Prisma client errors and return appropriate HTTP responses with structured error details.

#### Scenario: PrismaClientKnownRequestError returns 400
- **GIVEN** a Prisma operation throws `PrismaClientKnownRequestError` with code `P2002` (unique constraint)
- **WHEN** the exception filter catches the error
- **THEN** the HTTP response SHALL have status 400, `"error": "DatabaseError"`, and `"details": { "code": "P2002", "meta": {...} }`

#### Scenario: PrismaClientValidationError returns 400
- **GIVEN** a Prisma operation throws `PrismaClientValidationError`
- **WHEN** the exception filter catches the error
- **THEN** the HTTP response SHALL have status 400, `"error": "ValidationError"`, and `"details": { "message": "..." }`

### Requirement: Stripe API error wrapping
The system SHALL catch Stripe API errors and wrap them in `ServiceError` with code `STRIPE_API_ERROR`, preserving the original error details.

#### Scenario: Stripe API timeout
- **GIVEN** a Stripe API call times out
- **WHEN** the Stripe service catches the error
- **THEN** it SHALL throw `new ServiceError('STRIPE_API_ERROR', 'Stripe API request failed', { originalError: error.message, endpoint: 'checkout.sessions.create' })`

#### Scenario: Stripe card declined
- **GIVEN** a Stripe checkout session fails with `card_declined` error
- **WHEN** the Stripe service catches the error
- **THEN** it SHALL throw `new ServiceError('STRIPE_API_ERROR', 'Payment failed', { stripeError: 'card_declined', declineCode: 'insufficient_funds' })`

### Requirement: Consistent error response format
All error responses SHALL follow a consistent JSON structure with `statusCode`, `timestamp`, `path`, `method`, `message`, `error`, and optional `details` fields.

#### Scenario: Error response structure
- **GIVEN** any unhandled exception
- **WHEN** the exception filter sends the response
- **THEN** the response body SHALL be:
  ```json
  {
    "statusCode": 400,
    "timestamp": "2026-08-03T10:00:00.000Z",
    "path": "/billing/checkout",
    "method": "POST",
    "message": "Insufficient credits",
    "error": "INSUFFICIENT_CREDITS",
    "details": { "required": 100, "available": 50 }
  }
  ```

#### Scenario: Error response without details
- **GIVEN** an exception without a `details` property
- **WHEN** the exception filter sends the response
- **THEN** the response body SHALL omit the `details` field (not include `details: null`)

### Requirement: Global exception filter registration
The exception filter SHALL be registered globally in `app.module.ts` using `APP_FILTER` provider token.

#### Scenario: Filter catches all exceptions
- **GIVEN** the application is running
- **WHEN** any controller throws an unhandled exception
- **THEN** the global exception filter SHALL catch it and return a structured error response

#### Scenario: Filter does not interfere with validation pipes
- **GIVEN** a request with invalid DTO fields
- **WHEN** the ValidationPipe throws a `BadRequestException`
- **THEN** the exception filter SHALL catch it and return the standard error response format
