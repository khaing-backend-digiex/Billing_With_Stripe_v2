## Context

The billing-stripe-prompt API has 13 endpoints across 5 controllers. Currently:
- 5 protected routes use `@Req() req: any` to access the authenticated user
- These routes read `req.user.id`, but the JWT payload stores the user ID as `sub` — resulting in `undefined` values (live bug)
- 7 endpoints have DTOs with `class-validator` decorators
- 5 endpoints use `AuthGuard` (applied at class-level on billing and credit controllers)
- 0 endpoints use `PermissionsGuard` or `@RequirePermissions` despite these being implemented
- Admin catalog endpoints (`/admin/catalog/*`) have no authentication or authorization

The codebase uses NestJS 11, TypeScript, Prisma ORM, and already has the infrastructure for permission-based access control (`AuthGuard`, `PermissionsGuard`, `@RequirePermissions` decorator).

## Goals / Non-Goals

**Goals:**
- Eliminate all `req: any` usage by introducing type-safe request handling
- Fix the `req.user.id` bug (should read `sub` from JWT payload)
- Add DTOs only where they add validation value (complex query params, multi-field inputs)
- Every protected endpoint declares its authorization requirements at the route level using `@UseGuards` and `@RequirePermissions`
- Admin endpoints are secured with `AuthGuard` + `PermissionsGuard`
- Maintain backward compatibility with existing API contracts

**Non-Goals:**
- Creating DTOs for every endpoint regardless of complexity
- Refactoring existing DTOs that already work correctly
- Changing the authentication mechanism (JWT stays as-is)
- Adding rate limiting or request throttling
- Modifying the database schema or permission model

## Decisions

### 1. Type-safe request handling via `@CurrentUser()` decorator + `AuthRequest` interface

**Decision:** Create an `AuthRequest` interface extending Express `Request` with a typed `user` property, and a `@CurrentUser()` parameter decorator for ergonomic access.

**Rationale:**
- Eliminates `req: any` — the root cause of the `req.user.id` bug
- Provides compile-time type checking for user properties (`sub`, `email`, `roles`)
- Decorator allows `@CurrentUser('sub') userId: string` for single-field extraction
- Full user object available via `@CurrentUser() user: AuthUser`
- Follows NestJS idioms and patterns already in the codebase

**Alternatives considered:**
- Typed interface only (rejected: still requires `req.user.sub` drilling in every controller)
- Continue with `req: any` (rejected: hides bugs, no type safety)

### 2. DTOs only where they add value (not one per endpoint)

**Decision:** Add DTOs only for endpoints with complex query parameters, multi-field inputs, or validation rules. Simple path params (`:id`) and endpoints with no input don't need DTOs.

**Rationale:**
- Path params like `:id` are already typed by TypeScript (`@Param('id') id: string`)
- Single-field inputs don't justify a separate DTO file
- Reduces boilerplate while maintaining type safety
- Focus on validation value, not coverage metrics

**Decision framework:**
- Has body input? → DTO (already doing this)
- Has query params with validation rules? → DTO
- Has only path param (`:id`)? → `@Param('id') id: string` is sufficient
- Just needs userId from auth? → `@CurrentUser('sub') userId: string`
- No input at all? → No DTO needed

**Alternatives considered:**
- One DTO per endpoint (rejected: creates unnecessary files for simple cases)
- No DTOs at all (rejected: loses validation for complex inputs)

### 3. Per-route guards (not class-level guards)

**Decision:** Apply `@UseGuards(AuthGuard, PermissionsGuard)` at the method level for each route.

**Rationale:**
- Makes authorization explicit and visible at each handler
- Allows different permission requirements per endpoint
- Easier to audit security by reading controller code
- Aligns with user requirement: "per-route guards"

**Alternatives considered:**
- Class-level guards (rejected: too coarse-grained, hides which routes are protected)
- Global guards with route metadata (rejected: less explicit, harder to reason about)

### 4. Permission naming convention

**Decision:** Use resource-based permission names: `CATALOG_MANAGE`, `BILLING_ACCESS`, `CREDIT_ACCESS`

**Rationale:**
- Matches existing permission model in database (`Permission` table with `name` field)
- Clear and descriptive
- Easy to assign to roles via existing `RolePermission` junction table

## Risks / Trade-offs

**[Risk] Breaking existing API clients with stricter validation**  
→ Mitigation: Review existing DTOs to ensure new validation rules don't reject previously accepted input. Test with existing payloads.

**[Risk] Admin endpoints become inaccessible if permissions not seeded**  
→ Mitigation: Ensure `seed.ts` creates required permissions (`CATALOG_MANAGE`) and assigns to admin role. Document setup steps.

**[Risk] Webhook endpoint validation complexity**  
→ Mitigation: Keep webhook signature verification as-is (Stripe SDK). No DTO needed for webhook body validation.

**[Trade-off] Some endpoints won't have DTOs**  
→ Accepted: Type safety is achieved through `@CurrentUser()` decorator and TypeScript's param typing, not DTO proliferation. DTOs are added where they provide validation value.
