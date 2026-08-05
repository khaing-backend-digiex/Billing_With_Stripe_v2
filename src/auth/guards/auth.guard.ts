import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { AuthRequest } from '@/auth/interfaces/auth-request.interface';
import { AUTH_SCHEME_BEARER } from '@/common/constants/auth.constants';
import { ERROR_NO_AUTH_TOKEN, ERROR_INVALID_TOKEN } from '@/common/constants/error-messages.constants';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException(ERROR_NO_AUTH_TOKEN);
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.user = payload;
    } catch {
      throw new UnauthorizedException(ERROR_INVALID_TOKEN);
    }

    return true;
  }

  private extractTokenFromHeader(request: AuthRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === AUTH_SCHEME_BEARER ? token : undefined;
  }
}
