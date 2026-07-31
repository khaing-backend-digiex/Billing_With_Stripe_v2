## Context

This is a greenfield billing service built with TypeScript, NestJS, PostgreSQL, Prisma, and Stripe. No existing auth infrastructure exists. The auth domain must be established first as the foundation for all downstream features (billing, subscriptions, Stripe integration).

The system needs to support:
- User registration and email/password login
- Role-based access control with predefined roles
- Permission-based authorization
- Clean separation between auth credentials and user identity
- A profile hub that downstream domains (billing, subscriptions) can FK to

## Goals / Non-Goals

**Goals:**
- Establish the Prisma schema for User, Profile, Role, and Permission models
- Implement registration with validation (email format, password min 6 chars)
- Implement login with email + password
- Implement role-based authorization with seeded predefined roles
- Implement permission-based access control via guards/decorators
- Issue a signed JWT access token on successful login for stateless API authentication
- Create a clean architectural boundary: User = auth credentials, Profile = identity hub
- All downstream tables FK to Profile, not User

**Non-Goals:**
- Email verification flow (not in scope)
- Password reset / forgot password (not in scope)
- Two-factor authentication (not in scope)
- Account suspension / status management (not in scope)
- Session management / refresh tokens (deferred to a later change)
- OAuth2 social login providers (Google, GitHub, etc.) — not in scope
- Stripe integration (separate change)

## Decisions

### 1. User vs Profile Separation (Option C: Auth-only User, Identity Profile)

**Decision:** User table holds only auth credentials (email, hashed password). Profile table holds identity details (username, firstname, lastname, dateOfBirth, avatar) with a 1:1 relationship to User.

**Alternatives considered:**
- **Duplicate fields in both tables** — rejected due to sync problems when email/username changes
- **Minimal Profile, join User when needed** — rejected because downstream domains would need to join through User, coupling them to auth

**Rationale:** Clean separation of concerns. User is a thin auth table. Profile is the identity hub that all non-auth domains FK to. Changing an email doesn't touch Profile; updating an avatar doesn't touch User.

### 2. Role Storage: Database Table with Seed Data + Code Constants

**Decision:** Roles live in a database table, seeded via Prisma seed migration. Code-level constants (`PredefinedRole`) provide type-safe references.

```
// Code layer
export const PredefinedRole = {
  USER: "USER",
  ADMIN: "ADMIN",
} as const;

// DB layer: Role table seeded with matching rows
```

**Alternatives considered:**
- **Role as Prisma ENUM** — rejected because ENUMs can't hold descriptions, and M:N join tables require a real table to reference
- **Role as table without code constants** — rejected because middleware/guards need type-safe references

**Rationale:** Hybrid approach gives type safety in code AND queryable, descriptive roles in the database. Seed migration ensures roles exist on first deploy.

### 3. Permission as Database Table

**Decision:** Permissions are stored in a database table with fields: name (primary key) and description. Initial permissions are seeded: `CREATEUSER`, `GETUSER`, `GETUSERPROFILE`, `GETUSERSUB`.

**Alternatives considered:**
- **Permission as Prisma ENUM** — rejected because ENUMs cannot hold descriptions, and adding new permissions requires a migration
- **Permission as string literals** — rejected because a table provides queryability and descriptions

**Rationale:** A table allows permissions to have descriptions, be queried at runtime, and be extended without schema migrations. The name field serves as the primary key for simplicity and direct reference in join tables.

### 4. M:N Relationships via Explicit Join Tables

**Decision:** Use explicit join tables (`UserRole`, `RolePermission`) rather than Prisma's implicit many-to-many.

**Rationale:** Explicit join tables allow adding metadata later (e.g., `assignedAt`, `assignedBy`) and make queries more transparent.

### 5. Password Hashing with bcrypt

**Decision:** bcrypt with 10 salt rounds for password hashing.

**Alternatives considered:**
- **argon2** — stronger but less ecosystem support in NestJS
- **scrypt** — viable but bcrypt is the NestJS/Passport convention

**Rationale:** bcrypt is the industry standard for password hashing in Node.js/NestJS, well-supported by libraries, and 10 rounds provides a good balance of security and performance.

### 6. Email Format Validation at Application Layer

**Decision:** Email format validated using DTO-level validation (class-validator `@IsEmail()`) rather than database constraints.

**Rationale:** Database-level regex validation is PostgreSQL-specific and harder to test. Application-layer validation with class-validator is idiomatic NestJS, testable, and provides clear error messages.

### 7. JWT Access Token Issuance on Login

**Decision:** On successful login, the system issues a short-lived signed JWT access token (HS256, configurable expiry). The token payload includes the user id and assigned roles. The token is returned in the login response body. No refresh token mechanism is provided in this change.

**Alternatives considered:**
- **Opaque token stored server-side** — rejected because it requires server-side state and a token store
- **Full OAuth2 authorization server** — rejected as overkill for a first-party API; social login providers are explicitly out of scope

**Rationale:** JWTs are stateless, widely supported, and integrate natively with NestJS guards via `@nestjs/jwt`. A short-lived token without refresh is acceptable for initial development; refresh tokens can be added in a follow-up change.

## Risks / Trade-offs

- **[No session management yet]** → Users can't be logged out server-side. Mitigation: Add session/token management in a follow-up change. For now, keep auth simple and stateless.
- **[No email verification]** → Any email can register. Mitigation: Acceptable for initial development; add verification flow later when going to production.
- **[Seed migration must be idempotent]** → Running seed twice could create duplicate roles or permissions. Mitigation: Use `upsert` in seed script keyed on name field for both roles and permissions.
- **[No refresh token mechanism]** → Users must re-authenticate when their access token expires. Mitigation: Add refresh token flow in a follow-up change. For now, set a reasonable token expiry (e.g., 1 hour) and accept re-login.

## Schema Diagram

```
┌──────────────┐      1:1      ┌──────────────┐
│    User      │──────────────▶│   Profile    │
│──────────────│               │──────────────│
│ id (PK)      │               │ id (PK)      │
│ email        │               │ userId (FK,  │
│ password     │               │      unique) │
│ createdAt    │               │ username     │
│ updatedAt    │               │ firstname    │
└──────┬───────┘               │ lastname     │
       │                       │ dateOfBirth  │
       │ M:N                   │ avatar?      │
       ▼                       │ createdAt    │
┌──────────────┐    M:N    ┌──────────────┐
│    Role      │──────────▶│  Permission  │
│──────────────│           │──────────────│
│ name (PK)    │           │ name (PK)    │
│ description  │           │ description  │
└──────────────┘           └──────────────┘
       ▲                        
       │ seeded:                
       │ ADMIN, USER            
                                
Join tables:
  UserRole       { userId, roleName }
  RolePermission { roleName, permissionName }
```

## Open Questions

_None at this time. All key decisions have been resolved during exploration._
