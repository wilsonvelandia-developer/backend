import { Request, Response, NextFunction } from 'express';

/**
 * API Version response header middleware.
 *
 * Adds X-API-Version to every response so clients can detect when
 * the backend has been updated. Useful for:
 *  - Client cache invalidation after deployments
 *  - Debugging version mismatches between frontend and backend
 *  - Gradual rollout detection
 */

const API_VERSION = '1.1.0';

export function apiVersionMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-API-Version', API_VERSION);
  next();
}
