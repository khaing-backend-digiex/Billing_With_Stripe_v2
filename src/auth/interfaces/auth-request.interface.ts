import { Request } from 'express';

export interface AuthUser {
  sub: string;
  email: string;
  roles: string[];
}

export interface AuthRequest extends Request {
  user: AuthUser;
}
