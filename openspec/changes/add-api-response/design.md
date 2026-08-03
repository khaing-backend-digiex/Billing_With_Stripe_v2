## Context

The API currently has inconsistent response patterns:
- Success responses return raw data (Prisma models, plain objects, arrays)
- Error responses vary by service (HttpException vs ServiceError)
- No pagination on list endpoints
- No API documentation
- No API versioning strategy
- Frontend must know exact response shapes per endpoint

This creates friction for API consumers and makes the system harder to maintain.

## Goals / Non-Goals

**Goals:**
- Standardize all API responses with a consistent envelope pattern
- Add pagination metadata for list endpoints (products, subscriptions)
- Implement response DTOs with Swagger decorators for auto-generated documentation
- Add API versioning with `/api/v1/` prefix
- Unify error handling to use ServiceError across all services
- Maintain backwards compatibility for Stripe webhooks

**Non-Goals:**
- Cursor-based pagination (offset-based is sufficient for current scale)
- Response compression or caching layers
- GraphQL or other API protocols
- Real-time WebSocket responses
- Changing business logic or data models

## Decisions

### 1. Use Global TransformInterceptor for Response Envelope

**Decision:** Implement a global `TransformInterceptor` that wraps all responses in a standard envelope.

**Rationale:**
- Avoids repetitive boilerplate in every controller method
- Centralizes response formatting logic
- Easy to apply consistently across all endpoints

**Alternatives Considered:**
- Manual wrapping in each controller → rejected: too much repetition
- Service-level wrapping → rejected: services shouldn't know about HTTP response format
- Base controller with helper methods → rejected: still requires explicit calls in every method

### 2. Envelope Structure

**Decision:** Use this envelope format:
```json
{
  "statusCode": 200,
  "data": { ... },
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO-8601",
    "path": "/api/v1/...",
    "method": "GET"
  }
}
```

**Rationale:**
- `statusCode` at top level for quick HTTP status identification
- `data` contains the actual response payload
- `meta` provides request context for debugging and tracing
- Separates concerns: data vs metadata

**Alternatives Considered:**
- `{ success: true, data, meta }` → rejected: statusCode already indicates success/failure
- `{ data, meta, error }` all at top level → rejected: error should be separate from success path
- Nested everything under `response` → rejected: adds unnecessary nesting

### 3. Pagination Approach

**Decision:** Offset-based pagination with metadata in `meta.pagination`:
```json
{
  "data": [...],
  "meta": {
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

**Rationale:**
- Offset-based is simpler to implement and understand
- Sufficient for current data volumes (hundreds to low thousands)
- Frontend can easily build pagination UI
- Works well with admin dashboards

**Alternatives Considered:**
- Cursor-based pagination → rejected: overkill for current scale, adds complexity
- Link headers (RFC 5988) → rejected: less explicit, harder for frontend to parse
- No pagination → rejected: list endpoints will grow over time

### 4. API Versioning with /api/v1/ Prefix

**Decision:** Use URL path versioning with `/api/v1/` prefix for all routes except webhooks.

**Rationale:**
- Clear versioning for future breaking changes
- Standard industry practice
- Easy to implement with NestJS global prefix
- Webhooks excluded to maintain Stripe compatibility

**Alternatives Considered:**
- Header-based versioning (Accept header) → rejected: harder to test, less explicit
- No versioning → rejected: need a path for future breaking changes
- Version per controller → rejected: global prefix is cleaner

### 5. Response DTOs with Swagger Decorators

**Decision:** Create response DTOs for all endpoints with `@ApiProperty()` decorators.

**Rationale:**
- Enables auto-generated Swagger documentation
- Explicit contract for what each endpoint returns
- Controls field exposure (e.g., never return password hashes)
- Type safety with TypeScript

**Alternatives Considered:**
- No DTOs, use interfaces only → rejected: Swagger needs classes with decorators
- DTOs only for complex responses → rejected: consistency across all endpoints
- Separate input/output DTOs per endpoint → rejected: reuse DTOs where shapes match

### 6. Webhook Endpoint Special Handling

**Decision:** Use `@SkipTransform()` decorator to bypass envelope wrapping for Stripe webhooks.

**Rationale:**
- Stripe expects specific response format (`{ received: true }`)
- Webhook endpoint is at `/webhooks/stripe` (no version prefix)
- Maintains compatibility with Stripe's webhook retry logic

**Alternatives Considered:**
- Wrap webhook response in envelope → rejected: Stripe may not accept it
- Check route path in interceptor → rejected: implicit, harder to understand
- Separate interceptor for webhooks → rejected: overcomplicated

### 7. Error Response Format

**Decision:** Unify all errors to use ServiceError pattern within envelope:
```json
{
  "statusCode": 400,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found",
    "details": { ... }
  },
  "meta": { ... }
}
```

**Rationale:**
- Consistent error structure across all endpoints
- Machine-readable error codes for frontend handling
- Optional details for additional context
- Matches existing ServiceError pattern in billing/credit services

**Alternatives Considered:**
- Keep HttpException for auth/catalog → rejected: inconsistent error handling
- Use HTTP status codes only → rejected: need specific error codes for frontend logic
- Nested error under `meta.error` → rejected: error is primary response, not metadata

## Risks / Trade-offs

### Breaking API Changes
**Risk:** All existing API consumers must update to handle envelope structure and new routes.
**Mitigation:** 
- Coordinate with frontend team before deployment
- Update API documentation (Swagger) before release
- Consider temporary versioning (v0 for old, v1 for new) if migration is complex

### Test Updates Required
**Risk:** All existing tests will break due to response shape changes.
**Mitigation:**
- Update E2E tests to expect envelope structure
- Update unit tests for ServiceError migrations
- Add new tests for TransformInterceptor and pagination logic

### Pagination Performance
**Risk:** Count queries for pagination may be slow on large tables.
**Mitigation:**
- Add database indexes on commonly filtered fields
- Monitor query performance
- Consider cursor-based pagination if performance degrades

### Swagger Documentation Maintenance
**Risk:** DTOs and decorators may become outdated.
**Mitigation:**
- Include DTO updates in code review checklist
- Use TypeScript strict mode to catch type mismatches
- Regular API documentation reviews

### ServiceError Migration Complexity
**Risk:** Migrating auth/catalog services to ServiceError may introduce bugs.
**Mitigation:**
- Update tests alongside service changes
- Test each service migration independently
- Rollback plan: keep HttpException handling in GlobalExceptionFilter as fallback
