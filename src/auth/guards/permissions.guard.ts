import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { Permission } from '../enums/permission.enum';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
      throw new UnauthorizedException('User not authenticated');
    }

    if (!user.roles || user.roles.length === 0) {
      throw new ForbiddenException('No roles assigned');
    }

    if (!user.permissions || user.permissions.length === 0) {
      throw new ForbiddenException('No permissions assigned');
    }

    const userPermissions = new Set<string>(user.permissions);

    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
