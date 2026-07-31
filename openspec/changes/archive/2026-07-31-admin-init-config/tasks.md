## 1. Setup Service and Permissions List

- [x] 1.1 Create `src/auth/auth-seeder.service.ts`.
- [x] 1.2 Define a constant array of all available system permissions (e.g., `MANAGE_USERS`, `MANAGE_BILLING`, etc.) in the codebase.
- [x] 1.3 Add `AuthSeederService` to `AuthModule` providers.

## 2. Implement Bootstrap and Idempotency Logic

- [x] 2.1 Implement `OnApplicationBootstrap` in `AuthSeederService`.
- [x] 2.2 Add a Prisma query to check if any user has the `ADMIN` role.
- [x] 2.3 Ensure the method logs and exits early if an admin already exists.
- [x] 2.4 If no admin exists but `ADMIN_EMAIL` or `ADMIN_PASSWORD` are missing, log a warning and exit early without crashing.

## 3. Implement Role and Permission Seeding

- [x] 3.1 Implement logic to upsert `USER` and `ADMIN` base roles into the `Role` table.
- [x] 3.2 Implement logic to upsert all defined system permissions into the `Permission` table.
- [x] 3.3 Link all system permissions to the `ADMIN` role in the `RolePermission` table.

## 4. Implement Initial Admin Creation

- [x] 4.1 Read `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment configuration.
- [x] 4.2 Hash the password using the existing `AuthService` utilities or bcrypt.
- [x] 4.3 Create the new user with the hashed password.
- [x] 4.4 Create a `UserRole` record linking the new user to the `ADMIN` role.
