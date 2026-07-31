## Why

When deploying the application to a new environment, there is currently no automated way to set up the initial admin user with the correct permissions. This requires manual database intervention to create the user and assign the `ADMIN` role. This change solves this by auto-provisioning the admin user on application startup using environment variables.

## What Changes

- Introduce a new NestJS service (`SeederService` or `AdminSetupService`) that implements `OnApplicationBootstrap`.
- The service will run at application startup to check if an admin user exists.
- If no admin exists, it will ensure the base `USER` and `ADMIN` roles exist.
- It will ensure all system permissions are seeded and linked to the `ADMIN` role.
- It will read `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`, create the user, hash the password, and assign the `ADMIN` role.
- If an admin user already exists, the setup will gracefully skip.

## Capabilities

### New Capabilities
- `admin-auto-provisioning`: Automatically seeds base roles, permissions, and an initial admin user on application startup if none exists.

### Modified Capabilities
- 

## Impact

- **AppModule / AuthModule**: Will include the new seeder service which executes during the NestJS bootstrap phase.
- **Environment Config**: Requires `ADMIN_EMAIL` and `ADMIN_PASSWORD` to be defined in `.env` for the admin to be created successfully.
- **Database (Prisma)**: Will run read/write queries on startup to the `User`, `Role`, `Permission`, `RolePermission`, and `UserRole` tables.
