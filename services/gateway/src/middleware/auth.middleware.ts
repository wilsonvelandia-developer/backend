import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '@tournament/shared';
import { config } from '../config.js';

/**
 * Shape of the decoded JWT payload.
 * Extend this interface as the auth service evolves.
 */
export interface JwtPayload {
  sub: string;   // user ID
  email: string;
  role: string;  // e.g. 'admin' | 'organizer' | 'viewer'
  iat: number;
  exp: number;
}

/**
 * Augment Express Request to carry the authenticated user.
 * Downstream handlers access it via req.user.
 */
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
 * Expects: Authorization: Bearer <token>
 *
 * On success: attaches decoded payload to req.user and forwards X-User-ID,
 * X-User-Role headers to downstream services so they can make authorization decisions.
 *
 * On failure: throws UnauthorizedError — caught by the global error handler.
 *
 * Security notes:
 *   - Uses HS256 with a secret loaded from env (never hardcoded).
 *   - Validates expiry automatically via jsonwebtoken.
 *   - Never logs the token value.
 */
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = payload;

    // Forward user context to downstream microservices via internal headers.
    // Services trust these headers only on requests from the gateway (internal network).
    req.headers['x-user-id']   = payload.sub;
    req.headers['x-user-role'] = payload.role;

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Token has expired'));
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return next(new UnauthorizedError('Invalid token'));
    }
    next(err);
  }
};
