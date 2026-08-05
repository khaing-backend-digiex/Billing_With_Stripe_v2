import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/enums/permission.enum';
import { ERROR_USER_NOT_AUTHENTICATED, ERROR_INSUFFICIENT_PERMISSIONS } from '@/common/constants/error-messages.constants';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request['user'];

    if (!user) {
      throw new UnauthorizedException(ERROR_USER_NOT_AUTHENTICATED);
    }

    const userPermissions = user.permissions || [];

    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException(ERROR_INSUFFICIENT_PERMISSIONS);
    }

    return true;
  }
}
