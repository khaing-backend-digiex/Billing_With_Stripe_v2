## ADDED Requirements

### Requirement: Admin auto-provisioning on startup
The system MUST auto-provision an initial admin user and required base roles on application startup if no admin exists.

#### Scenario: No admin exists, env vars provided
- **WHEN** the application starts and there is no user with the `ADMIN` role in the database, and `ADMIN_EMAIL` and `ADMIN_PASSWORD` are present in the environment
- **THEN** the system MUST ensure the `USER` and `ADMIN` roles exist
- **THEN** the system MUST ensure all system permissions are seeded and linked to the `ADMIN` role
- **THEN** the system MUST create the admin user using the provided credentials
- **THEN** the system MUST assign the `ADMIN` role to the newly created user

#### Scenario: Admin already exists
- **WHEN** the application starts and there is at least one user with the `ADMIN` role in the database
- **THEN** the system MUST gracefully skip the seeding process and make no changes to users or roles

#### Scenario: No admin exists, env vars missing
- **WHEN** the application starts, there is no admin user, and `ADMIN_EMAIL` or `ADMIN_PASSWORD` are missing from the environment
- **THEN** the system MUST log a warning message
- **THEN** the system MUST NOT crash or fail the startup process
- **THEN** the system MUST NOT create an admin user
