import { SetMetadata } from '@nestjs/common';
import { PredefinedRole } from '@/common/constants/predefined-role';

export const ROLES_KEY = 'roles';
export const RequireRoles = (...roles: PredefinedRole[]) => SetMetadata(ROLES_KEY, roles);
