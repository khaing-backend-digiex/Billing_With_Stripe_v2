## Context

The billing system currently uses NestJS's default `Logger` class, which outputs unstructured text logs. When errors occur in production, developers must parse log lines manually to trace request flows. There is no centralized error handling - each controller/service throws generic HTTP exceptions (`NotFoundException`, `BadRequestException`) without domain context.

Current state:
- 4 files instantiate `new Logger()` directly
- 13 exception throws across billing/credit services
- No correlation between related log entries
- Prisma errors bubble up with generic 500 responses
- Stripe API errors lack context about which operation failed

Stakeholders: Backend developers debugging billing issues, DevOps monitoring production errors, support teams investigating customer payment problems.

## Goals / Non-Goals

**Goals:**
- Structured JSON logging in production for machine-parseable log aggregation
- Request correlation IDs that propagate through all log entries
- Domain-specific error codes that map to HTTP status codes
- Consistent error response format across all endpoints
- Injection-based logger usage (no `new Logger()` in services)
- 4xx errors logged at `error` level for billing system visibility

**Non-Goals:**
- Log aggregation system setup (assume ELK/Datadog/etc. already configured)
- Alerting rules or dashboards
- Performance optimization of logging (Pino is already fast)
- Breaking existing API contracts (error response shape is additive)
- Replacing NestJS's built-in logger globally (only our modules use AppLogger)

## Decisions

### 1. Pino over Winston/Bunyan

**Choice:** Use `nestjs-pino` with `pino-http`

**Rationale:**
- Pino is 5-10x faster than Winston for JSON serialization
- Native async logging (non-blocking)
- `nestjs-pino` provides seamless NestJS integration
- Built-in request/response serializers
- Child logger support for correlation IDs

**Alternatives considered:**
- Winston: More flexible but slower, requires more configuration
- Bunyan: Good but less community support, similar performance
- NestJS default Logger: No structured output, blocking I/O

### 2. Global exception filter over per-controller filters

**Choice:** Single `@Catch()` filter registered globally in `app.module.ts`

**Rationale:**
- One place to define error mapping logic
- Consistent response format across all endpoints
- Easier to add new error types/codes
- Reduces duplication (no filter per module)

**Alternatives considered:**
- Per-module filters: More granular but duplicates mapping logic
- Interceptors: Can't catch all exceptions (only response transformation)
- Middleware: Runs too early, can't access NestJS exception context

### 3. ServiceError class with code mapping

**Choice:** Custom `ServiceError` class with `code` property, mapped to HTTP status in filter

**Rationale:**
- Domain-specific errors (e.g., `INSUFFICIENT_CREDITS`) are more meaningful than generic HTTP exceptions
- Centralized status mapping in filter (not scattered in services)
- Easy to add new codes without changing filter logic
- Preserves original error details for debugging

**Alternatives considered:**
- Extend `HttpException`: Loses domain context, harder to distinguish business logic errors
- Error code constants: No type safety, easy to misuse
- Enum-based errors: Less flexible for adding metadata

### 4. Correlation ID middleware before logger initialization

**Choice:** Extract/generate correlation ID in middleware, inject into Pino logger context

**Rationale:**
- All logs for a request share the same ID
- Works with async/await (Pino child loggers)
- Survives across service boundaries
- Clients can pass their own IDs for tracing

**Alternatives considered:**
- Generate in logger: No way to extract from request headers
- Use request ID from NestJS: Not available by default
- AsyncLocalStorage: More complex, Pino child loggers are simpler

### 5. AppLogger injection over static logger

**Choice:** Inject `AppLogger` via constructor, not `new Logger()`

**Rationale:**
- Testable (can mock logger in tests)
- Consistent configuration across all services
- Child logger context propagates automatically
- Follows NestJS DI patterns

**Alternatives considered:**
- Static `Logger`: Can't inject context, harder to test
- Global logger instance: No per-request context
- `@Inject(Logger)` with token: More verbose, same result

### 6. Express adapter over Fastify

**Choice:** Use Express types (`Response`, `Request`) in exception filter

**Rationale:**
- Project already uses `@nestjs/platform-express`
- No need to add Fastify dependency
- Existing middleware ecosystem (correlation ID, etc.)

**Alternatives considered:**
- Fastify: Faster but requires migration, breaks existing setup
- Abstract adapter: Over-engineering for single use case

## Risks / Trade-offs

**[Risk] Logger injection breaks existing tests** → Update all service tests to mock `AppLogger`. Add `LoggerModule` to test imports.

**[Risk] Correlation ID middleware adds overhead** → Minimal (UUID generation is fast). Can skip for health checks if needed.

**[Risk] ServiceError codes become stale** → Document codes in proposal. Add lint rule or runtime check for unmapped codes.

**[Risk] Pino configuration differs between environments** → Use `NODE_ENV` to switch between pretty-print (dev) and JSON (prod). Test both modes.

**[Risk] Exception filter logs sensitive data** → Redact `authorization` headers, `password` fields in request body. Use Pino serializers.

**[Trade-off] 4xx errors at `error` level increases log volume** → Acceptable for billing system (need visibility). Can filter in log aggregation.

**[Trade-off] Global filter catches all exceptions** → Some exceptions might need special handling (e.g., validation errors). Filter can delegate to specific handlers.

## Migration Plan

**Phase 1: Setup (no breaking changes)**
1. Install dependencies
2. Create logger infrastructure
3. Create exception infrastructure
4. Wire up in `app.module.ts` and `main.ts`

**Phase 2: Migrate services (backward compatible)**
1. Update `billing.service.ts` - replace exceptions, inject logger
2. Update `stripe.service.ts` - wrap Stripe errors, inject logger
3. Update `credit.service.ts` - replace exceptions, inject logger
4. Update `stripe-webhook.controller.ts` - replace exception

**Phase 3: Verify**
1. Test all billing endpoints return new error format
2. Verify logs include correlation IDs
3. Check 4xx errors log at `error` level
4. Confirm Prisma/Stripe errors are wrapped correctly

**Rollback strategy:**
- Revert `app.module.ts` changes to remove global filter
- Revert `main.ts` to use default logger
- Services still work with old exceptions (backward compatible)

## Open Questions

None - all decisions resolved during exploration.
