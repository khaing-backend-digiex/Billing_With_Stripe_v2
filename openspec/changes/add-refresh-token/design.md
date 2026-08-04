# Change Design: Implement Refresh Token, Cookie Auth, and JWT Scopes

## Architecture Overview
This change upgrades the authentication system to support persistent, revocable sessions and optimizes the authorization layer. It uses a dual-token strategy:
1. **Access Token (JWT)**: Short-lived token stored in memory by the client. Contains identity (`sub`, `email`) and access control data (`roles`, `permissions`). Used to authenticate against API endpoints.
2. **Refresh Token**: Long-lived token stored securely in an `HttpOnly` cookie. Stored in the database to support explicit revocation.

## Key Components

### 1. Database Layer (`schema.prisma`)
The `RefreshToken` model tracks active sessions. This allows a single user to log in from multiple devices independently.
```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("refresh_tokens")
}
```

### 2. JWT Scopes (`auth.service.ts`)
During the `login` or `refresh` phase, `AuthService` will query `UserRole` -> `Role` -> `RolePermission` to retrieve all permissions associated with the user's roles.
It will flatten these permissions into an array of strings:
```typescript
const userRoles = await this.prisma.userRole.findMany({
  where: { userId: user.id },
  include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
});
const permissions = Array.from(new Set(
  userRoles.flatMap(ur => ur.role.rolePermissions.map(rp => rp.permission.name))
));
```
This array is then injected into the JWT payload.

### 3. PermissionsGuard Refactor (`permissions.guard.ts`)
The guard will be drastically simplified. Instead of making Prisma calls, it will extract permissions directly from the request object (populated by `JwtAuthGuard`).
```typescript
const userPermissions = request['user'].permissions || [];
const hasPermission = requiredPermissions.every((permission) =>
  userPermissions.includes(permission),
);
```

### 4. Controller Endpoints (`auth.controller.ts`)
- `POST /auth/login`: Sets `refreshToken` cookie. Returns `accessToken` JSON.
- `POST /auth/refresh`: Reads `req.cookies.refreshToken`. Verifies DB and expiration. Sets new `refreshToken` cookie. Returns new `accessToken` JSON.
- `POST /auth/logout`: Clears cookie. Revokes token in DB.

## Dependencies
- `cookie-parser`: Middleware to easily access `req.cookies`.

## Edge Cases
- **Token Rotation**: The refresh token is rotated upon use. If an old, valid token is used (e.g., due to network replay), the system should ideally revoke the entire session tree, but for MVP, we simply overwrite or delete the old token and issue a new one.
- **Role Changes**: If an admin changes a user's roles, the change will take effect the next time the user requests a new access token (within 15 minutes).
