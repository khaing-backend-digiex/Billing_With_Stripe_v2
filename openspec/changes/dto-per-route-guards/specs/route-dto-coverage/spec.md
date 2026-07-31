## ADDED Requirements

### Requirement: AuthRequest interface for typed request handling
The system SHALL define an `AuthRequest` interface extending Express `Request` with a typed `user` property containing `sub`, `email`, and `roles` fields. The `AuthGuard` SHALL set `request.user` with this type.

#### Scenario: AuthGuard sets typed user on request
- **GIVEN** a request with a valid JWT token
- **WHEN** the `AuthGuard` validates the token
- **THEN** the system SHALL set `request.user` as an `AuthUser` object with `sub: string`, `email: string`, and `roles: string[]`

#### Scenario: Controllers access user with type safety
- **GIVEN** a controller method that needs the authenticated user's ID
- **WHEN** the method uses `@CurrentUser('sub') userId: string`
- **THEN** TypeScript SHALL enforce that `userId` is a string and `sub` is a valid property

### Requirement: @CurrentUser() parameter decorator
The system SHALL provide a `@CurrentUser()` parameter decorator that extracts the authenticated user from the request. The decorator SHALL support extracting the full user object or a specific property.

#### Scenario: Extract full user object
- **GIVEN** a controller method parameter decorated with `@CurrentUser()`
- **WHEN** the method is called with an authenticated request
- **THEN** the system SHALL pass the full `AuthUser` object to the parameter

#### Scenario: Extract specific user property
- **GIVEN** a controller method parameter decorated with `@CurrentUser('sub')`
- **WHEN** the method is called with an authenticated request
- **THEN** the system SHALL pass only the `sub` value (user ID) as a string to the parameter

#### Scenario: Extract user email
- **GIVEN** a controller method parameter decorated with `@CurrentUser('email')`
- **WHEN** the method is called with an authenticated request
- **THEN** the system SHALL pass only the `email` value as a string to the parameter

### Requirement: Eliminate req: any usage
The system SHALL NOT use `@Req() req: any` in any controller method. All authenticated request handling SHALL use the `@CurrentUser()` decorator or typed `AuthRequest` interface.

#### Scenario: Billing controller uses @CurrentUser
- **GIVEN** the `BillingController` methods for checkout and subscription listing
- **WHEN** these methods need the authenticated user's ID
- **THEN** they SHALL use `@CurrentUser('sub') userId: string` instead of `@Req() req: any`

#### Scenario: Credit controller uses @CurrentUser
- **GIVEN** the `CreditController` methods for consuming credits and checking balance
- **WHEN** these methods need the authenticated user's ID
- **THEN** they SHALL use `@CurrentUser('sub') userId: string` instead of `@Req() req: any`

### Requirement: Fix req.user.id bug
The system SHALL read the user ID from the JWT payload's `sub` field, not from `id`. All controller methods that previously used `req.user.id` SHALL be updated to use `@CurrentUser('sub')` or access `req.user.sub`.

#### Scenario: User ID correctly extracted from JWT
- **GIVEN** a JWT payload with `{ sub: "user123", email: "test@example.com", roles: ["USER"] }`
- **WHEN** a controller method accesses the user ID via `@CurrentUser('sub')`
- **THEN** the system SHALL return `"user123"` (not `undefined`)

#### Scenario: TypeScript prevents incorrect property access
- **GIVEN** the `AuthUser` interface with properties `sub`, `email`, and `roles`
- **WHEN** a developer attempts to access `user.id` (which doesn't exist)
- **THEN** TypeScript SHALL produce a compile-time error
