## ADDED Requirements

### Requirement: Structured JSON logging in production
The system SHALL output all logs in JSON format when `NODE_ENV=production` and use human-readable pretty-print format when `NODE_ENV` is not `production`.

#### Scenario: Production environment uses JSON
- **GIVEN** `NODE_ENV` is set to `production`
- **WHEN** a log entry is written via `AppLogger`
- **THEN** the log output SHALL be a single-line JSON object containing `level`, `time`, `msg`, and `reqId` fields

#### Scenario: Development environment uses pretty-print
- **GIVEN** `NODE_ENV` is set to `development`
- **WHEN** a log entry is written via `AppLogger`
- **THEN** the log output SHALL be colorized, single-line, human-readable text via `pino-pretty` transport

### Requirement: Request correlation ID propagation
The system SHALL extract a correlation ID from the incoming `X-Request-Id` header, or generate a UUID v4 if the header is absent, and include it in all log entries for that request.

#### Scenario: Client provides correlation ID
- **GIVEN** an incoming HTTP request with header `X-Request-Id: client-trace-123`
- **WHEN** any service logs a message during that request's lifecycle
- **THEN** the log entry SHALL include `"reqId": "client-trace-123"`

#### Scenario: Client does not provide correlation ID
- **GIVEN** an incoming HTTP request without an `X-Request-Id` header
- **WHEN** the correlation ID middleware processes the request
- **THEN** the system SHALL generate a UUID v4 and assign it as the request's correlation ID
- **THEN** all subsequent log entries for that request SHALL include the generated ID

### Requirement: AppLogger injection
All services and controllers SHALL receive `AppLogger` via constructor injection rather than instantiating `new Logger()` directly.

#### Scenario: Service uses injected logger
- **GIVEN** a service class that declares `private readonly logger: AppLogger` in its constructor
- **WHEN** the service calls `this.logger.error('something failed')`
- **THEN** the log entry SHALL be written through the Pino transport with the current request context

#### Scenario: No direct Logger instantiation
- **GIVEN** any file under `src/`
- **WHEN** the file is a service or controller
- **THEN** the file SHALL NOT contain `new Logger(` expressions

### Requirement: 4xx errors logged at error level
The system SHALL log all HTTP 4xx responses at the `error` severity level, not `warn`.

#### Scenario: 400 Bad Request logs at error level
- **GIVEN** a request that results in a 400 response
- **WHEN** the global exception filter logs the error
- **THEN** the log entry SHALL have severity level `error` (Pino level 50)

#### Scenario: 404 Not Found logs at error level
- **GIVEN** a request that results in a 404 response
- **WHEN** the global exception filter logs the error
- **THEN** the log entry SHALL have severity level `error` (Pino level 50)

#### Scenario: 500 Internal Server Error logs at error level
- **GIVEN** a request that results in a 500 response
- **WHEN** the global exception filter logs the error
- **THEN** the log entry SHALL have severity level `error` (Pino level 50) and include the full stack trace

### Requirement: Sensitive data redaction
The system SHALL redact sensitive fields from log output, including `authorization` headers, `password` fields in request bodies, and Stripe secret keys.

#### Scenario: Authorization header is redacted
- **GIVEN** an incoming request with `Authorization: Bearer sk_live_abc123`
- **WHEN** the exception filter logs the request headers
- **THEN** the log output SHALL contain `"authorization": "[REDACTED]"` instead of the actual value

#### Scenario: Password field in body is redacted
- **GIVEN** a request body containing `{ "email": "user@example.com", "password": "secret123" }`
- **WHEN** the exception filter logs the request body
- **THEN** the log output SHALL contain `"password": "[REDACTED]"` instead of the actual value
