## ADDED Requirements

### Requirement: Predefined Roles
The system SHALL define predefined roles as code-level constants using a `PredefinedRole` object with `as const` for type safety. The initial predefined roles SHALL be `ADMIN` and `USER`. These constants SHALL be used in guards, middleware, and seed scripts to reference roles in a type-safe manner.

#### Scenario: PredefinedRole constants available in code
- **GIVEN** the application is running
- **WHEN** any guard, middleware, or service references `PredefinedRole.ADMIN` or `PredefinedRole.USER`
- **THEN** the resolved values are the string literals "ADMIN" and "USER" respectively, with full TypeScript type inference

#### Scenario: PredefinedRole is immutable
- **GIVEN** the PredefinedRole constant object
- **WHEN** code attempts to modify or add properties to the object at compile time
- **THEN** TypeScript rejects the mutation due to the `as const` assertion

### Requirement: Role Database Model
The system SHALL store roles in a database table with fields: name (PK) and description. The name field SHALL serve as the primary key. The Role table SHALL be seeded with the predefined roles (ADMIN, USER) via a Prisma seed migration. The seed migration SHALL be idempotent using upsert operations keyed on the role name.

#### Scenario: Roles seeded on initial deployment
- **GIVEN** a fresh database with no existing roles
- **WHEN** the seed migration runs
- **THEN** two Role records are created: one with name "ADMIN" and a description, and one with name "USER" and a description

#### Scenario: Seed migration is idempotent
- **GIVEN** the database already contains seeded ADMIN and USER roles
- **WHEN** the seed migration runs again
- **THEN** no duplicate roles are created; the existing records remain unchanged

#### Scenario: Role name uniqueness
- **GIVEN** a Role with name "ADMIN" already exists
- **WHEN** an attempt is made to create another Role with name "ADMIN"
- **THEN** the system rejects the operation due to the unique constraint on name

### Requirement: User-Role Many-to-Many Relationship
The system SHALL support a many-to-many relationship between Users and Roles via an explicit join table `UserRole` containing `userId` and `roleName` as a composite primary key. A user SHALL be able to have multiple roles, and a role SHALL be assignable to multiple users.

#### Scenario: User assigned multiple roles
- **GIVEN** a user with id "user-1" and roles ADMIN and USER both exist
- **WHEN** both roles are assigned to the user
- **THEN** two UserRole records are created: { userId: "user-1", roleName: "ADMIN" } and { userId: "user-1", roleName: "USER" }

#### Scenario: Duplicate role assignment rejected
- **GIVEN** a user already has the ADMIN role assigned
- **WHEN** an attempt is made to assign the ADMIN role again to the same user
- **THEN** the system rejects the operation due to the composite primary key constraint on UserRole

#### Scenario: Role assigned to multiple users
- **GIVEN** the USER role exists and two users "user-1" and "user-2" exist
- **WHEN** the USER role is assigned to both users
- **THEN** two UserRole records are created, one for each user, both referencing the same roleName

### Requirement: Permission Table
The system SHALL define permissions in a database table with fields: name (PK) and description. The initial permissions SHALL be: `CREATEUSER`, `GETUSER`, `GETUSERPROFILE`, `GETUSERSUB`. Each permission SHALL have a description explaining its purpose. The table SHALL be seeded via a Prisma seed migration that is idempotent using upsert operations keyed on the permission name.

#### Scenario: Permission values are type-safe
- **GIVEN** the Prisma schema defines the Permission ENUM
- **WHEN** a RolePermission record is created with a permission value
- **THEN** only values defined in the ENUM (CREATEUSER, GETUSER, GETUSERPROFILE, GETUSERSUB) are accepted; any other value is rejected by Prisma and PostgreSQL

### Requirement: Role-Permission Many-to-Many Relationship
The system SHALL support a many-to-many relationship between Roles and Permissions via an explicit join table `RolePermission` containing `roleName` and `permissionName` as a composite primary key. A role SHALL be able to have multiple permissions, and a permission SHALL be assignable to multiple roles.

#### Scenario: Role assigned multiple permissions
- **GIVEN** the ADMIN role exists
- **WHEN** permissions CREATEUSER, GETUSER, GETUSERPROFILE, and GETUSERSUB are assigned to the ADMIN role
- **THEN** four RolePermission records are created, each linking the ADMIN roleName to one of the permission names

#### Scenario: Duplicate permission assignment rejected
- **GIVEN** the ADMIN role already has the GETUSER permission assigned
- **WHEN** an attempt is made to assign GETUSER to ADMIN again
- **THEN** the system rejects the operation due to the composite primary key constraint on RolePermission

### Requirement: Authorization Guard
The system SHALL provide an authorization guard that checks whether the authenticated user's roles contain the required permission(s) for a given endpoint. The guard SHALL resolve permissions by traversing: User → UserRole → Role → RolePermission → Permission.

#### Scenario: User with required permission granted access
- **GIVEN** an authenticated user with the ADMIN role, and the ADMIN role has the GETUSER permission
- **WHEN** the user accesses an endpoint protected by the GETUSER permission
- **THEN** the guard allows the request to proceed

#### Scenario: User without required permission denied access
- **GIVEN** an authenticated user with the USER role, and the USER role does NOT have the CREATEUSER permission
- **WHEN** the user accesses an endpoint protected by the CREATEUSER permission
- **THEN** the guard denies the request and returns a 403 Forbidden response

#### Scenario: Unauthenticated user denied access
- **GIVEN** no authenticated user (no valid credentials/token)
- **WHEN** any protected endpoint is accessed
- **THEN** the system returns a 401 Unauthorized response before the permission guard is evaluated

### Requirement: Default Role Assignment
The system SHALL automatically assign the USER role to every newly registered user. The ADMIN role SHALL NOT be assigned automatically and SHALL only be granted explicitly by an administrator.

#### Scenario: New user gets USER role
- **GIVEN** a new user completes registration
- **WHEN** the registration process finishes
- **THEN** a UserRole record is created linking the new user to the USER role

#### Scenario: New user does not get ADMIN role
- **GIVEN** a new user completes registration
- **WHEN** the registration process finishes
- **THEN** no UserRole record exists linking the new user to the ADMIN role

### Failure Scenarios

#### Scenario: Role lookup fails during authorization
- **GIVEN** an authenticated user
- **WHEN** the authorization guard attempts to resolve the user's roles but the database query fails
- **THEN** the system denies the request and returns a 500 Internal Server Error response

#### Scenario: Permission check with no roles assigned
- **GIVEN** an authenticated user with no roles assigned (UserRole table has no entries for this user)
- **WHEN** the user accesses any permission-protected endpoint
- **THEN** the guard denies the request and returns a 403 Forbidden response
