## Context

Currently, the application does not have a mechanism to automatically provision an initial admin account. This means when the application is deployed to a new environment, a developer or DBA must manually connect to the database to insert an admin user and set up the corresponding roles. This is error-prone and slows down environment setup.

## Goals / Non-Goals

**Goals:**
- Automatically create an admin user on app startup if none exists.
- Ensure the `ADMIN` and `USER` base roles exist in the database.
- Automatically assign all system permissions to the `ADMIN` role on startup.
- Securely read the initial admin credentials from `.env` (`ADMIN_EMAIL` and `ADMIN_PASSWORD`).

**Non-Goals:**
- We will not create an ongoing admin management dashboard in this change.
- We will not support seeding multiple admin accounts via config.
- We will not automatically delete the admin account if the env vars are removed later.

## Decisions

1. **NestJS `OnApplicationBootstrap` Hook**:
   - **Rationale**: We will use NestJS's `OnApplicationBootstrap` interface within a dedicated `SeederService`. This hook runs after all modules are initialized, allowing us to safely inject the `PrismaService` and execute database queries before the app starts handling HTTP traffic.
   - **Alternative**: Using a separate Prisma `seed.ts` script. While viable, this requires an additional deployment step (`npx prisma db seed`). Running it in the bootstrap hook guarantees it executes on every startup automatically.

2. **Role and Permission Seeding**:
   - **Rationale**: Before creating the user, we must ensure the `ADMIN` and `USER` roles exist in the `Role` table. We will define an array of all system permissions in code, upsert them into the `Permission` table, and then link them all to the `ADMIN` role via `RolePermission`.
   - **Alternative**: Manually writing SQL. This would bypass Prisma's type safety. We will use Prisma's `upsert` and `createMany` for idempotency.

3. **Idempotency Strategy**:
   - **Rationale**: The seed logic must be safe to run on every startup. It will check if any user has the `ADMIN` role. If `true`, the process terminates immediately.

## Risks / Trade-offs

- **Risk: Missing Environment Variables** 
  - **Mitigation**: If `ADMIN_EMAIL` or `ADMIN_PASSWORD` is missing, the seeder will gracefully log a warning and skip user creation rather than crashing the application.
- **Risk: Concurrency on Multiple Instances**
  - **Mitigation**: In a multi-node deployment, multiple instances might try to seed simultaneously. We will use Prisma's `upsert` and transaction features where possible to minimize race conditions, or simply catch and ignore unique constraint errors on initial user creation.
