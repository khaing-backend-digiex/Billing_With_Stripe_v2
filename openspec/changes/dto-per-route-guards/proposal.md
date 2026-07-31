## Why

Five protected routes use `@Req() req: any` to access the authenticated user, which hides a live bug: the JWT payload stores the user ID as `sub`, but controllers read `req.user.id` (always `undefined`). This untyped access pattern prevents TypeScript from catching the error. Additionally, admin catalog endpoints have no authentication or authorization guards, and no endpoint uses the existing `PermissionsGuard` or `@RequirePermissions` decorator.

## What Changes

- Eliminate all `req: any` usage by introducing an `AuthRequest` interface and `@CurrentUser()` parameter decorator for type-safe access to the authenticated user
- Fix the `req.user.id` (undefined) bug — the JWT uses `sub`, controllers must read `sub`
- Add DTOs only where they add validation value (complex query params, multi-field inputs) — not for every route
- Apply `AuthGuard` + `PermissionsGuard` with `@RequirePermissions` on all admin and protected endpoints
- Keep existing DTOs and class-level guards intact (backward compatible)

## Capabilities

### New Capabilities
- `typed-request-handling`: `AuthRequest` interface and `@CurrentUser()` decorator to eliminate `req: any` and provide type-safe access to the authenticated user across all controllers
- `per-route-authorization`: Per-route guard composition using `AuthGuard`, `PermissionsGuard`, and `@RequirePermissions` so each handler declares its own access requirements

### Modified Capabilities

## Impact

- **Code:** All controllers (`billing`, `catalog`, `credit`) — replace `req: any` with `@CurrentUser()`, add guard decorators on route handlers
- **Bug fix:** `req.user.id` (undefined) → `@CurrentUser('sub') userId: string` on 5 routes
- **Security:** Admin catalog endpoints gain authentication and authorization for the first time
- **APIs:** No breaking changes to request/response contracts
- **Dependencies:** No new dependencies — uses existing `class-validator`, `class-transformer`, `@nestjs/common`
