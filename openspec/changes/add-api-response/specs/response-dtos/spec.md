## ADDED Requirements

### Requirement: Response DTOs for all endpoints
The system MUST provide response DTOs for all API endpoints to define the shape of response data and enable Swagger documentation.

#### Scenario: Auth response DTOs
- **WHEN** the auth controller returns data
- **THEN** it MUST use `RegisterResponseDto` with fields: `id` (string), `email` (string)
- **AND** `LoginResponseDto` with fields: `id` (string), `email` (string), `roles` (string[]), `accessToken` (string)

#### Scenario: Billing response DTOs
- **WHEN** the billing controller returns checkout URLs
- **THEN** it MUST use `CheckoutUrlResponseDto` with field: `url` (string)
- **AND** for subscription lists, use `SubscriptionResponseDto` with fields: `id`, `stripeSubscriptionId`, `plan`, `status`, `currentPeriodStart`, `currentPeriodEnd`, `createdAt`, `updatedAt`

#### Scenario: Catalog response DTOs
- **WHEN** the catalog controller returns product data
- **THEN** it MUST use `ProductWithPricesResponseDto` with fields: `id`, `stripeProductId`, `name`, `planType`, `isActive`, `createdAt`, `updatedAt`, `prices` (array of `PriceResponseDto`)
- **AND** `PriceResponseDto` with fields: `id`, `stripePriceId`, `currency`, `amount`, `interval`, `isActive`, `createdAt`, `updatedAt`
- **AND** for exchange rates, use `ExchangeRateResponseDto` with fields: `targetCurrency`, `rate`, `updatedAt`

#### Scenario: Credit response DTOs
- **WHEN** the credit controller returns credit balance data
- **THEN** it MUST use `CreditBalanceResponseDto` with fields: `planCredits`, `addonCreditsAvailable`, `addonCreditsFrozen`, `lastResetAt`, `createdAt`, `updatedAt`

### Requirement: Response DTOs exclude sensitive fields
Response DTOs MUST NOT expose sensitive internal fields to API clients.

#### Scenario: User password never exposed
- **WHEN** returning user data from auth endpoints
- **THEN** the response DTO MUST NOT include `password` or `passwordHash` fields

#### Scenario: Internal IDs excluded from client responses
- **WHEN** returning subscription or credit balance data
- **THEN** the response DTO MUST NOT include `userId` (client should use JWT context instead)
- **AND** MUST NOT include `stripeCustomerId` (internal reference)

### Requirement: Response DTOs use Swagger decorators
All response DTOs MUST include `@ApiProperty()` decorators for Swagger documentation generation.

#### Scenario: Swagger decorators on all DTO fields
- **WHEN** a response DTO is defined
- **THEN** every field MUST have an `@ApiProperty()` decorator
- **AND** the decorator MUST include type information and examples where appropriate

#### Scenario: Array fields use proper type annotation
- **WHEN** a response DTO includes an array field
- **THEN** the `@ApiProperty()` decorator MUST use `type: [ItemType]` syntax
- **AND** example MUST be an array of sample items

### Requirement: Response DTOs handle date formatting
Response DTOs MUST convert Date objects to ISO 8601 string format.

#### Scenario: DateTime fields as ISO strings
- **WHEN** a response includes DateTime fields (createdAt, updatedAt, lastResetAt, etc.)
- **THEN** the values MUST be formatted as ISO 8601 strings (e.g., "2026-08-03T10:00:00.000Z")
- **AND** NOT as Unix timestamps or other formats

#### Scenario: Nullable DateTime fields
- **WHEN** a DateTime field is optional (e.g., currentPeriodStart, currentPeriodEnd)
- **THEN** the field MUST be marked as optional in the DTO
- **AND** if present, MUST still be formatted as ISO 8601 string

### Requirement: Pagination response DTOs
The system MUST provide generic pagination response DTOs for paginated endpoints.

#### Scenario: PaginatedResponse generic DTO
- **WHEN** an endpoint returns paginated data
- **THEN** it MUST use `PaginatedResponse<T>` with fields: `data` (T[]), `meta` (PaginationMetaDto)

#### Scenario: PaginationMetaDto structure
- **WHEN** pagination metadata is returned
- **THEN** it MUST include: `page` (number), `limit` (number), `total` (number), `totalPages` (number), `hasNext` (boolean), `hasPrev` (boolean)
- **AND** all fields MUST have `@ApiProperty()` decorators
