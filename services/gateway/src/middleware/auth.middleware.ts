import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '@tournament/shared';
import { config } from '../config.js';

const COOKIE_NAME = 'auth_token';

export interface JwtPayload {
  sub:    string;
  email:  string;
  roles:  string[];
  role?:  string;   // backward compat with old tokens
  name?:  string;
  iat:    number;
  exp:    number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * JWT authentication middleware.
 *
 * Token resolution order (first match wins):
 *  1. httpOnly cookie `auth_token`  — set by /auth/login (browser clients)
 *  2. Authorization: Bearer <token> — for Postman / API clients
 *
 * On success: attaches decoded payload to req.user and forwards
 * X-User-ID, X-User-Role headers so downstream services can authorize.
 *
 * Security notes:
 *  - HS256 with secret from env — never hardcoded.
 *  - Expiry validated by jsonwebtoken automatically.
 *  - Token value never logged.
 */
export const authMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  // 1. Try httpOnly cookie (browser flow)
  const cookieToken = req.cookies?.[COOKIE_NAME] as string | undefined;

  // 2. Try Authorization header (Postman / API clients)
  const authHeader = req.headers['authorization'];
  const headerToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

  const token = cookieToken ?? headerToken;

  if (!token) {
    return next(new UnauthorizedError('Autenticación requerida'));
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = payload;

    // Forward user context to downstream microservices
    req.headers['x-user-id']    = payload.sub;
    req.headers['x-user-roles'] = JSON.stringify(payload.roles ?? [payload.role ?? 'viewer']);

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('La sesión ha expirado'));
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return next(new UnauthorizedError('Token inválido'));
    }
    next(err);
  }
};
