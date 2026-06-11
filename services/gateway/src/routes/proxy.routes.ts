import { Router, Request, Response, NextFunction } from 'express';
import proxy from 'express-http-proxy';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const router = Router();

/**
 * Builds a proxy handler that:
 *  1. Forwards the original path and query string to the target service.
 *  2. Injects the correlation ID header on every proxied request.
 *  3. Logs each forwarded request for observability.
 *
 * All routes require JWT authentication (authMiddleware applied before proxy).
 */
function buildProxy(serviceUrl: string, serviceName: string) {
  return proxy(serviceUrl, {
    proxyReqPathResolver: (req: Request) => req.originalUrl.replace(/^\/api/, ''),

    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      const correlationId = (srcReq.res?.locals['correlationId'] as string | undefined) ?? '';
      if (!proxyReqOpts.headers) {
        proxyReqOpts.headers = {};
      }
      (proxyReqOpts.headers as Record<string, string>)['x-correlation-id'] = correlationId;

      logger.info({
        correlationId,
        service:  serviceName,
        method:   srcReq.method,
        path:     srcReq.originalUrl,
      }, `Proxying to ${serviceName}`);

      return proxyReqOpts;
    },

    userResDecorator: (_proxyRes, proxyResData, _userReq, userRes) => {
      const correlationId = (userRes.locals['correlationId'] as string | undefined) ?? '';
      userRes.setHeader('X-Correlation-ID', correlationId);
      return proxyResData;
    },
  });
}

// ── Route definitions ────────────────────────────────────────────────────────
// All routes under /api/* require a valid JWT.
// The auth middleware runs first; on success the proxy forwards to the service.

router.use(
  '/api/sports',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) =>
    buildProxy(config.services.sports, 'sports')(req, res, next),
);

router.use(
  '/api/tournaments',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) =>
    buildProxy(config.services.tournaments, 'tournaments')(req, res, next),
);

router.use(
  '/api/teams',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) =>
    buildProxy(config.services.teams, 'teams')(req, res, next),
);

router.use(
  '/api/matches',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) =>
    buildProxy(config.services.matches, 'matches')(req, res, next),
);

router.use(
  '/api/standings',
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) =>
    buildProxy(config.services.standings, 'standings')(req, res, next),
);

export { router as proxyRouter };
