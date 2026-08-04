import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '@/auth/interfaces/auth-request.interface';

export const extractUser = (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.user as AuthUser;
  return data ? user[data] : user;
};

export const CurrentUser = createParamDecorator(extractUser);
