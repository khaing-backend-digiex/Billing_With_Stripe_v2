## Why

The billing service needs a foundational authentication and authorization layer before any billing or subscription features can be built. User identity, role-based access control, and a clean separation between auth credentials and user profile data are prerequisites for every downstream domain (billing, subscriptions, Stripe integration). This change establishes that basement.

## What Changes

- **New Prisma schema** with User, Profile, Role, and Permission models
- **User registration** endpoint accepting username, email (format-validated), password (min 6 chars), and dateOfBirth
- **User login** endpoint accepting email and password, returning auth token/response
- **Role-based authorization** with predefined roles (ADMIN, USER) seeded into the database
- **Permission-based access control** using a Permission table with name and description fields (CREATEUSER, GETUSER, GETUSERPROFILE, GETUSERSUB)
- **Profile as identity hub** — 1:1 with User, serving as the FK target for all non-auth domains (billing, subscriptions, etc.)
- **Code-level role constants** (`PredefinedRole` object with `as const` for type safety)
- **JWT access token issuance** — login endpoint returns a signed JWT access token for API authentication
- Clean separation: User table holds only auth credentials (email + hashed password); Profile holds identity details (username, firstname, lastname, dateOfBirth, avatar)

## Capabilities

### New Capabilities
- `user-auth`: User registration and login with email/password, bcrypt password hashing, email format validation, minimum password length enforcement
- `access-token`: JWT access token issued on successful login for stateless API authentication
- `user-profile`: Profile model (1:1 with User) acting as the identity hub and FK target for other domains; stores username, firstname, lastname, dateOfBirth, and optional avatar
- `role-permission`: Role-based access control with predefined seeded roles (ADMIN, USER), M:N user-role and role-permission relationships, and a Permission table with name and description fields (CREATEUSER, GETUSER, GETUSERPROFILE, GETUSERSUB)

### Modified Capabilities

_None — this is the first capability set for the project._

## Impact

- **Prisma schema**: New models introduced (User, Profile, Role, UserRole, RolePermission) and a new Permission enum
- **Database**: New tables and seed migration for predefined roles
- **API**: New REST endpoints for registration and login
- **Dependencies**: bcrypt for password hashing, class-validator or equivalent for email format validation, jsonwebtoken (or @nestjs/jwt) for JWT signing
- **Future domains**: All downstream tables (billing, subscriptions, Stripe events) will FK to Profile, not User — establishing a clean architectural boundary from day one
