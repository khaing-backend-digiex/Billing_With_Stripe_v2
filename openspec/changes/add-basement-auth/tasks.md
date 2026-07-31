## 0. Schema Alignment (Fix Current Schema to Match Plan)

- [x] 0.1 Restructure User model: remove username, dateOfBirth, isActive, emailVerified fields; keep only id (UUID PK), email (unique), password (renamed from passwordHash), createdAt, updatedAt
- [x] 0.2 Add Profile model: id (UUID PK), userId (unique FK to User), username, firstname, lastname, dateOfBirth, avatar (optional), createdAt, updatedAt
- [x] 0.3 Restructure Role model: change primary key from id (UUID) to name (string PK); remove id field; keep name (PK), description, createdAt, updatedAt
- [x] 0.4 Restructure Permission model: change primary key from id (UUID) to name (string PK); remove id field; keep name (PK), description
- [x] 0.5 Restructure UserRole join table: remove id field; change to composite primary key with userId (FK to User) and roleName (FK to Role); remove roleId field
- [x] 0.6 Restructure RolePermission join table: remove id field; change to composite primary key with roleName (FK to Role) and permissionName (FK to Permission); remove roleId and permissionId fields
- [x] 0.7 Remove Session model (deferred to later change)
- [x] 0.8 Remove Organization model (not in scope)
- [x] 0.9 Remove OrganizationMember model (not in scope)
- [x] 0.10 Remove all Stripe models: StripeCustomer, StripeProduct, StripePrice, StripeSubscription, StripeSubscriptionItem, StripePaymentMethod, StripeInvoice, StripeInvoiceLine, StripeConnectedAccount (separate change)
- [x] 0.11 Remove AuditLog model (not in scope)
- [x] 0.12 Update all relation references to use new primary key structures (role name instead of roleId, permission name instead of permissionId)

## 1. Prisma Schema Setup

- [x] 1.1 Initialize Prisma in the project (prisma init) with PostgreSQL provider
- [x] 1.2 Configure DATABASE_URL in .env file
- [x] 1.3 Define Permission table in schema.prisma with fields: id (UUID, primary key), name (unique), description

## 2. Database Models (After Schema Alignment)

- [x] 2.1 Restructure User model: id (UUID PK), email (unique), password, createdAt, updatedAt (auth-only, no identity fields)
- [x] 2.2 Create Profile model: id (UUID PK), userId (unique FK to User), username, firstname, lastname, dateOfBirth, avatar (optional), createdAt, updatedAt
- [x] 2.3 Restructure Role model: name (string PK), description (no UUID id)
- [x] 2.4 Restructure Permission model: name (string PK), description (no UUID id)
- [x] 2.5 Restructure UserRole: composite PK (userId, roleName), no id field
- [x] 2.6 Restructure RolePermission: composite PK (roleName, permissionName), no id field
- [x] 2.7 Run prisma migrate dev to create initial migration

## 3. Constants and Types

- [x] 3.1 Create src/constants/predefined-role.ts with PredefinedRole constant object using `as const` for ADMIN and USER roles
- [x] 3.2 Export PredefinedRole type for TypeScript type inference

## 4. Database Seeding

- [x] 4.1 Create prisma/seed.ts file
- [x] 4.2 Implement idempotent role seeding using upsert for ADMIN role with description
- [x] 4.3 Implement idempotent role seeding using upsert for USER role with description
- [x] 4.4 Implement idempotent permission seeding using upsert for CREATEUSER, GETUSER, GETUSERPROFILE, GETUSERSUB with descriptions
- [x] 4.5 Configure package.json to run seed script after migrations
- [x] 4.6 Run seed script and verify roles and permissions are created

## 5. Auth Module Structure

- [x] 5.1 Create src/auth/auth.module.ts with necessary imports (PrismaService, JwtModule, etc.)
- [x] 5.2 Create src/auth/auth.service.ts for business logic
- [x] 5.3 Create src/auth/auth.controller.ts for REST endpoints
- [x] 5.4 Create src/auth/dto/register.dto.ts with validation decorators (@IsEmail, @MinLength(6), @IsString, @IsDateString) for fields: email, password, username, firstname, lastname, dateOfBirth
- [x] 5.5 Create src/auth/dto/login.dto.ts with validation decorators (@IsEmail, @IsString)

## 6. User Registration Implementation

- [x] 6.1 Implement register method in AuthService that validates input, hashes password with bcrypt (10 rounds), creates User (email, password), creates Profile (username, firstname, lastname, dateOfBirth), and assigns USER role
- [x] 6.2 Wrap User creation, Profile creation, and UserRole assignment in a Prisma transaction
- [x] 6.3 Implement POST /auth/register endpoint in AuthController
- [x] 6.4 Add error handling for duplicate email (return 409 Conflict)
- [x] 6.5 Add error handling for validation errors (return 400 Bad Request)

## 7. User Login Implementation

- [x] 7.1 Implement login method in AuthService that finds user by email and compares password with bcrypt
- [x] 7.2 Implement POST /auth/login endpoint in AuthController
- [x] 7.3 Add error handling for invalid credentials (return 401 Unauthorized)
- [x] 7.4 Return appropriate response on successful login (user data without password)

## 8. JWT Access Token

- [x] 8.1 Install @nestjs/jwt package
- [x] 8.2 Configure JwtModule in auth.module.ts with secret and expiry settings from environment variables
- [x] 8.3 Implement JWT token generation in AuthService.login method (sign user id and roles into payload)
- [x] 8.4 Return signed JWT access token in login response body
- [x] 8.5 Add JWT secret and expiry configuration to .env file

## 9. Authorization Guard

- [x] 9.1 Create src/auth/guards/permissions.guard.ts that implements CanActivate
- [x] 9.2 Implement permission resolution logic: query User → UserRole → Role → RolePermission → Permission
- [x] 9.3 Create src/auth/decorators/require-permissions.decorator.ts for marking endpoints with required permissions
- [x] 9.4 Implement guard logic to check if user's permissions include required permissions
- [x] 9.5 Return 403 Forbidden if user lacks required permissions
- [x] 9.6 Return 401 Unauthorized if user is not authenticated

## 10. Authentication Guard

- [x] 10.1 Create src/auth/guards/auth.guard.ts that validates JWT tokens using @nestjs/jwt
- [x] 10.2 Implement JWT verification and payload extraction
- [x] 10.3 Apply AuthGuard to protected endpoints

## 11. Testing

- [x] 11.1 Write unit tests for AuthService.register method (successful registration, duplicate email, validation errors)
- [x] 11.2 Write unit tests for AuthService.login method (successful login, invalid credentials, token generation)
- [x] 11.3 Write unit tests for PermissionsGuard (user with permission, user without permission, no roles assigned)
- [ ] 11.4 Write integration tests for POST /auth/register endpoint
- [ ] 11.5 Write integration tests for POST /auth/login endpoint (verify JWT is returned)
- [ ] 11.6 Verify seed script creates roles correctly and is idempotent

## 12. Documentation and Cleanup

- [ ] 12.1 Add JSDoc comments to auth service methods explaining behavior
- [ ] 12.2 Update README with setup instructions (migrations, seeding, running app)
- [ ] 12.3 Verify all endpoints work as expected with manual testing
- [ ] 12.4 Review code for security best practices (no hardcoded secrets, proper error messages)
