import { Request } from 'express';

export interface AuthUser {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface AuthRequest extends Request {
  user: AuthUser;
}
