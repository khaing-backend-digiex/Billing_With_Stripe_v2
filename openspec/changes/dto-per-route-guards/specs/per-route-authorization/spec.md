## ADDED Requirements

### Requirement: Admin catalog endpoints require authentication and CATALOG_MANAGE permission
All endpoints under `/admin/catalog` SHALL require a valid JWT token and the `CATALOG_MANAGE` permission.

#### Scenario: Unauthenticated request to admin catalog
- **GIVEN** a request without an Authorization header
- **WHEN** any admin catalog endpoint is accessed
- **THEN** the system SHALL reject with 401 Unauthorized

#### Scenario: Authenticated request without CATALOG_MANAGE permission
- **GIVEN** an authenticated user without the `CATALOG_MANAGE` permission
- **WHEN** any admin catalog endpoint is accessed
- **THEN** the system SHALL reject with 403 Forbidden

#### Scenario: Authenticated admin with CATALOG_MANAGE permission
- **GIVEN** an authenticated user with the `CATALOG_MANAGE` permission
- **WHEN** any admin catalog endpoint is accessed
- **THEN** the system SHALL process the request normally

### Requirement: Billing checkout endpoints require BILLING_ACCESS permission
The `POST /billing/checkout/subscription` and `POST /billing/checkout/addon` endpoints SHALL require the `BILLING_ACCESS` permission in addition to authentication.

#### Scenario: Authenticated user without BILLING_ACCESS permission
- **GIVEN** an authenticated user without the `BILLING_ACCESS` permission
- **WHEN** a checkout endpoint is accessed
- **THEN** the system SHALL reject with 403 Forbidden

#### Scenario: Authenticated user with BILLING_ACCESS permission
- **GIVEN** an authenticated user with the `BILLING_ACCESS` permission
- **WHEN** a checkout endpoint is accessed with valid input
- **THEN** the system SHALL process the checkout request

### Requirement: Billing subscription listing requires BILLING_ACCESS permission
The `GET /billing/subscriptions` endpoint SHALL require the `BILLING_ACCESS` permission.

#### Scenario: Authenticated user without BILLING_ACCESS viewing subscriptions
- **GIVEN** an authenticated user without the `BILLING_ACCESS` permission
- **WHEN** the subscription listing endpoint is accessed
- **THEN** the system SHALL reject with 403 Forbidden

#### Scenario: Authenticated user with BILLING_ACCESS viewing subscriptions
- **GIVEN** an authenticated user with the `BILLING_ACCESS` permission
- **WHEN** the subscription listing endpoint is accessed
- **THEN** the system SHALL return the user's subscriptions

### Requirement: Credit endpoints require CREDIT_ACCESS permission
The `POST /credits/consume` and `GET /credits/balance` endpoints SHALL require the `CREDIT_ACCESS` permission.

#### Scenario: Authenticated user without CREDIT_ACCESS consuming credits
- **GIVEN** an authenticated user without the `CREDIT_ACCESS` permission
- **WHEN** the credit consume endpoint is accessed
- **THEN** the system SHALL reject with 403 Forbidden

#### Scenario: Authenticated user with CREDIT_ACCESS checking balance
- **GIVEN** an authenticated user with the `CREDIT_ACCESS` permission
- **WHEN** the credit balance endpoint is accessed
- **THEN** the system SHALL return the user's current credit balance

### Requirement: Stripe webhook endpoint remains signature-based
The `POST /billing/webhook` endpoint SHALL NOT use `AuthGuard` or `PermissionsGuard`. It SHALL continue to rely on Stripe signature verification for security.

#### Scenario: Webhook with valid Stripe signature
- **GIVEN** a Stripe webhook request with a valid signature
- **WHEN** the webhook endpoint receives the event
- **THEN** the system SHALL process the event normally

#### Scenario: Webhook with invalid Stripe signature
- **GIVEN** a request with an invalid or missing Stripe signature
- **WHEN** the webhook endpoint receives the request
- **THEN** the system SHALL reject with 400 Bad Request

### Requirement: Auth endpoints remain public
The `POST /auth/register` and `POST /auth/login` endpoints SHALL NOT require any authentication guards.

#### Scenario: Unauthenticated registration
- **GIVEN** an unauthenticated request
- **WHEN** the registration endpoint is accessed with valid input
- **THEN** the system SHALL process the registration

#### Scenario: Unauthenticated login
- **GIVEN** an unauthenticated request
- **WHEN** the login endpoint is accessed with valid credentials
- **THEN** the system SHALL return a JWT token

### Requirement: Protected endpoints use @CurrentUser() decorator
All protected endpoints that need to access the authenticated user's data SHALL use the `@CurrentUser()` parameter decorator instead of `@Req() req: any`.

#### Scenario: Controller accesses user ID with type safety
- **GIVEN** a protected endpoint that needs the authenticated user's ID
- **WHEN** the controller method uses `@CurrentUser('sub') userId: string`
- **THEN** the system SHALL provide the user ID from the JWT payload's `sub` field with full TypeScript type checking

#### Scenario: Controller attempts to use untyped request access
- **GIVEN** a developer writes a controller method with `@Req() req: any`
- **WHEN** they attempt to access `req.user.id`
- **THEN** the code SHALL not compile if the `AuthRequest` interface is properly enforced, preventing the `undefined` bug
