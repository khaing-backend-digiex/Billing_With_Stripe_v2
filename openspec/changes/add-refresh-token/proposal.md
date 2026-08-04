# Change Proposal: Implement Refresh Token, Cookie Auth, and JWT Scopes

## What
Introduce a secure Refresh Token mechanism stored in an HTTP-only cookie, and optimize the authorization system by injecting permissions (scopes) directly into the Access Token (JWT). This replaces the current approach of querying the database in `PermissionsGuard` on every authenticated request.

## Why
1. **Security & UX**: Currently, the system only issues an access token. A short-lived access token provides better security, but without a refresh token, users are forced to log in frequently.
2. **Revocation**: Adding a `RefreshToken` model to the database allows tracking active sessions across multiple devices and revoking specific sessions upon logout or suspicious activity.
3. **Performance Optimization**: `PermissionsGuard` currently queries `UserRole` -> `Role` -> `RolePermission` on every request. By querying these permissions once during login/refresh and embedding them in the JWT, we eliminate a costly database query for all protected endpoints.
4. **Cookie Security**: Returning the Refresh Token in an HTTP-only cookie prevents XSS attacks from reading the token via JavaScript.

## Impacted Files
- `prisma/schema.prisma` — Add `RefreshToken` model.
- `package.json` — Add `cookie-parser` and `@types/cookie-parser`.
- `src/main.ts` — Register `cookie-parser` middleware.
- `src/auth/auth.service.ts` — Update `login` to build scopes/permissions and store refresh token. Add `refreshAccessToken` and `revokeRefreshToken`.
- `src/auth/auth.controller.ts` — Update `login` to attach cookie. Add `refresh` and `logout` endpoints.
- `src/auth/guards/permissions.guard.ts` — Refactor to read permissions from `request['user'].permissions` instead of querying the DB.
- `src/auth/guards/permissions.guard.spec.ts` — Update tests to mock JWT payload instead of Prisma.

## Rollback Plan
Since this change alters the database schema, a rollback would involve deleting the `refresh_tokens` table in the database and reverting the code changes via `git revert`. It is recommended to perform this change on a separate branch before merging.
