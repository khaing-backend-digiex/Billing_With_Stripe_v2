## ADDED Requirements

### Requirement: Swagger UI endpoint
The system MUST expose Swagger UI at `/api/docs` for interactive API documentation.

#### Scenario: Access Swagger UI
- **WHEN** a client navigates to `/api/docs`
- **THEN** the system MUST serve the Swagger UI interface
- **AND** the UI MUST display all API endpoints grouped by controller

#### Scenario: Swagger JSON endpoint
- **WHEN** a client requests `/api/docs-json`
- **THEN** the system MUST return the OpenAPI JSON specification
- **AND** the JSON MUST include all endpoints, request/response schemas, and authentication requirements

### Requirement: Swagger decorators on all controllers
All controllers MUST include Swagger decorators for documentation generation.

#### Scenario: Controller-level decorators
- **WHEN** a controller is defined
- **THEN** it MUST have `@ApiTags()` decorator for grouping
- **AND** each route MUST have `@ApiOperation()` with a summary description
- **AND** each route MUST have `@ApiResponse()` decorators for success and error responses

#### Scenario: Authentication decorators
- **WHEN** an endpoint requires authentication
- **THEN** it MUST have `@ApiBearerAuth()` decorator
- **AND** the Swagger UI MUST display the authentication requirement

### Requirement: Request body documentation
All endpoints with request bodies MUST document the DTO structure in Swagger.

#### Scenario: POST/PUT endpoints document request body
- **WHEN** an endpoint accepts a request body (POST, PUT)
- **THEN** it MUST use `@ApiBody({ type: RequestDto })` decorator
- **AND** the Swagger UI MUST display the request body schema with field types and examples

#### Scenario: Query parameters documentation
- **WHEN** an endpoint accepts query parameters
- **THEN** it MUST use `@ApiQuery()` decorators for each parameter
- **AND** the Swagger UI MUST display parameter types, defaults, and validation rules

### Requirement: Response schema documentation
All endpoints MUST document their response schemas in Swagger.

#### Scenario: Success response schema
- **WHEN** an endpoint returns a response
- **THEN** it MUST use `@ApiResponse({ status: 200, type: ResponseDto })` decorator
- **AND** the Swagger UI MUST display the response schema with all fields

#### Scenario: Error response documentation
- **WHEN** an endpoint can return error responses
- **THEN** it MUST document common error codes (400, 401, 403, 404, 500) using `@ApiResponse()` decorators
- **AND** each error response MUST include example error structure

### Requirement: Swagger configuration
The system MUST configure Swagger with proper metadata and security definitions.

#### Scenario: Swagger setup in main.ts
- **WHEN** the application starts
- **THEN** Swagger MUST be configured with title "Billing API", version "1.0"
- **AND** MUST include Bearer authentication definition
- **AND** MUST be accessible at `/api/docs`

#### Scenario: Environment-specific Swagger
- **WHEN** running in production environment
- **THEN** Swagger SHOULD be disabled or require authentication
- **WHEN** running in development environment
- **THEN** Swagger MUST be enabled without authentication
