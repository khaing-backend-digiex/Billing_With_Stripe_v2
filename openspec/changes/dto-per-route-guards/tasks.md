## 1. Create Typed Request Handling Infrastructure

- [x] 1.1 Create `AuthRequest` interface extending Express `Request` with typed `user` property containing `sub: string`, `email: string`, `roles: string[]`
- [x] 1.2 Create `@CurrentUser()` parameter decorator that extracts user from request, supporting both full user object and specific property extraction (e.g., `@CurrentUser('sub') userId: string`)
- [x] 1.3 Update `AuthGuard` to set `request.user` with proper `AuthRequest` typing

## 2. Fix req: any Usage in Billing Controller

- [x] 2.1 Replace `@Req() req: any` with `@CurrentUser('sub') userId: string` in `POST /billing/checkout/subscription`
- [x] 2.2 Replace `@Req() req: any` with `@CurrentUser('sub') userId: string` in `POST /billing/checkout/addon`
- [x] 2.3 Replace `@Req() req: any` with `@CurrentUser('sub') userId: string` in `GET /billing/subscriptions`
- [x] 2.4 Add `@UseGuards(PermissionsGuard)` and `@RequirePermissions('BILLING_ACCESS')` to all billing endpoints

## 3. Fix req: any Usage in Credit Controller

- [x] 3.1 Replace `@Req() req: any` with `@CurrentUser('sub') userId: string` in `POST /credits/consume`
- [x] 3.2 Replace `@Req() req: any` with `@CurrentUser('sub') userId: string` in `GET /credits/balance`
- [x] 3.3 Add `@UseGuards(PermissionsGuard)` and `@RequirePermissions('CREDIT_ACCESS')` to all credit endpoints

## 4. Add Per-Route Guards to Catalog Controller

- [x] 4.1 Add `@UseGuards(AuthGuard, PermissionsGuard)` and `@RequirePermissions('CATALOG_MANAGE')` to `POST /admin/catalog/products`
- [x] 4.2 Add `@UseGuards(AuthGuard, PermissionsGuard)` and `@RequirePermissions('CATALOG_MANAGE')` to `GET /admin/catalog/products`
- [x] 4.3 Add `@UseGuards(AuthGuard, PermissionsGuard)` and `@RequirePermissions('CATALOG_MANAGE')` to `GET /admin/catalog/products/:id`
- [x] 4.4 Add `@UseGuards(AuthGuard, PermissionsGuard)` and `@RequirePermissions('CATALOG_MANAGE')` to `PUT /admin/catalog/products/:id`
- [x] 4.5 Add `@UseGuards(AuthGuard, PermissionsGuard)` and `@RequirePermissions('CATALOG_MANAGE')` to `POST /admin/catalog/products/:id/refresh-prices`
- [x] 4.6 Add `@UseGuards(AuthGuard, PermissionsGuard)` and `@RequirePermissions('CATALOG_MANAGE')` to `GET /admin/catalog/exchange-rates`

## 5. Update Database Seed

- [x] 5.1 Add `BILLING_ACCESS` permission to seed data
- [x] 5.2 Add `CREDIT_ACCESS` permission to seed data
- [x] 5.3 Add `CATALOG_MANAGE` permission to seed data
- [x] 5.4 Assign all three permissions to admin role in seed
- [x] 5.5 Assign `BILLING_ACCESS` and `CREDIT_ACCESS` permissions to user role in seed

## 6. Testing

- [ ] 6.1 Write unit tests for `@CurrentUser()` decorator with various extraction modes
- [ ] 6.2 Write integration tests for catalog endpoints with and without proper permissions
- [ ] 6.3 Write integration tests for billing endpoints with and without BILLING_ACCESS permission
- [ ] 6.4 Write integration tests for credit endpoints with and without CREDIT_ACCESS permission
- [ ] 6.5 Verify webhook endpoint still works with signature verification (no guards)
- [ ] 6.6 Verify auth endpoints remain public and accessible without authentication
- [ ] 6.7 Verify `req.user.id` bug is fixed (user ID correctly extracted from JWT `sub` field)

## 7. Documentation

- [ ] 7.1 Update API documentation to reflect new permission requirements
- [ ] 7.2 Document `@CurrentUser()` decorator usage and `AuthRequest` interface
- [ ] 7.3 Add setup instructions for seeding permissions in development environment
