# Implementation Tasks: Implement Refresh Token, Cookie Auth, and JWT Scopes

## Setup
- [x] Add `cookie-parser` and `@types/cookie-parser` to dependencies.
- [x] Import and register `cookie-parser` middleware in `src/main.ts`.

## Database Schema
- [x] Add `RefreshToken` model to `prisma/schema.prisma` with `token`, `userId`, `expiresAt`, `createdAt`.
- [x] Add inverse relation to `User` model (`refreshTokens RefreshToken[]`).
- [ ] Generate Prisma client and format schema (`npx prisma generate` and `npx prisma format`). (Defer migration to user).

## AuthService (`src/auth/auth.service.ts`)
- [x] Extract permissions mapping logic into a private method `getUserPermissions(userId: string)`.
- [x] Update `login` method to call `getUserPermissions`, append `permissions` to JWT payload, and generate a `refreshToken`.
- [x] Implement `storeRefreshToken(userId, token, expiresAt)` to save the token to the database.
- [x] Implement `refreshAccessToken(token)` to validate token, check expiry, revoke old token, and issue new access & refresh tokens.
- [x] Implement `revokeRefreshToken(token)` to delete a refresh token.

## AuthController (`src/auth/auth.controller.ts`)
- [x] Update `login` endpoint to inject `@Res({ passthrough: true }) res: Response` and set the `refreshToken` HTTP-only cookie.
- [x] Implement `POST /refresh` endpoint to read the cookie via `@Req()`, call `refreshAccessToken`, and set the new cookie.
- [x] Implement `POST /logout` endpoint to call `revokeRefreshToken` and clear the cookie.

## PermissionsGuard (`src/auth/guards/permissions.guard.ts`)
- [x] Remove `PrismaService` injection and all database query logic.
- [x] Extract `userPermissions` from `request['user'].permissions`.
- [x] Validate `requiredPermissions` against `userPermissions`.

## Testing
- [x] Update `src/auth/guards/permissions.guard.spec.ts` to mock the JWT payload (`request.user.permissions`) instead of mocking Prisma queries.
- [x] Verify test suite passes (`npm run test`).
