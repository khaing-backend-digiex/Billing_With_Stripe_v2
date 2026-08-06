import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@/auth/decorators/require-roles.decorator';
import { PredefinedRole } from '@/common/constants/predefined-role';
import { ERROR_USER_NOT_AUTHENTICATED, ERROR_INSUFFICIENT_PERMISSIONS } from '@/common/constants/error-messages.constants';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<PredefinedRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request['user'];

    if (!user) {
      throw new UnauthorizedException(ERROR_USER_NOT_AUTHENTICATED);
    }

    const userRoles = user.roles || [];

    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(ERROR_INSUFFICIENT_PERMISSIONS);
    }

    return true;
  }
}
