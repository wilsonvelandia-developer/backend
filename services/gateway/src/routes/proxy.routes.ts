import { Router, Request, Response, NextFunction } from 'express';
import proxy from 'express-http-proxy';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  blockReadOnlyWrites,
  authorizeTournamentWrite,
  authorizeTeamWrite,
  authorizeMatchWrite,
} from '../middleware/authorization.middleware.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const router = Router();

/**
 * Builds a proxy handler for a downstream microservice.
 *
 * Responsibilities:
 *  1. Resolves the request path (strips /api prefix).
 *  2. Injects correlation ID and user context headers.
 *  3. Normalizes JSON responses to the Angular frontend envelope:
 *       { data, success: true, message: '' }
 *     Microservices return { data } — this decorator adds the missing fields.
 *     Error responses { code, message } are forwarded as-is (already handled by
 *     each service's error middleware).
 */
function buildProxy(serviceUrl: string, serviceName: string) {
  return proxy(serviceUrl, {
    proxyReqPathResolver: (req: Request) => req.originalUrl.replace(/^\/(api|public)/, ''),

    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      const correlationId = (srcReq.res?.locals['correlationId'] as string | undefined) ?? '';
      if (!proxyReqOpts.headers) proxyReqOpts.headers = {};
      const headers = proxyReqOpts.headers as Record<string, string>;
      headers['x-correlation-id'] = correlationId;

      // Forward user context from auth middleware to downstream services
      if (srcReq.headers['x-user-id']) {
        headers['x-user-id'] = srcReq.headers['x-user-id'] as string;
      }
      if (srcReq.headers['x-user-roles']) {
        headers['x-user-roles'] = srcReq.headers['x-user-roles'] as string;
        // Also set x-user-role (singular) with the highest role for backward compat
        try {
          const roles = JSON.parse(srcReq.headers['x-user-roles'] as string) as string[];
          headers['x-user-role'] = roles[0] ?? 'viewer';
        } catch {
          headers['x-user-role'] = 'viewer';
        }
      }

      logger.info({
        correlationId,
        service: serviceName,
        method:  srcReq.method,
        path:    srcReq.originalUrl,
      }, `Proxying to ${serviceName}`);

      return proxyReqOpts;
    },

    userResDecorator: (proxyRes, proxyResData, _userReq, userRes) => {
      const correlationId = (userRes.locals['correlationId'] as string | undefined) ?? '';
      userRes.setHeader('X-Correlation-ID', correlationId);

      // Only normalize JSON success responses
      const contentType = proxyRes.headers['content-type'] ?? '';
      const statusCode  = proxyRes.statusCode ?? 200;

      if (!contentType.includes('application/json') || statusCode >= 400) {
        return proxyResData;
      }

      try {
        const body = JSON.parse(proxyResData.toString('utf8')) as Record<string, unknown>;

        // Already normalized or is an error — pass through
        if ('success' in body || 'code' in body) {
          return proxyResData;
        }

        // Wrap: add success + message to the { data } envelope
        const normalized = { ...body, success: true, message: '' };
        return Buffer.from(JSON.stringify(normalized), 'utf8');
      } catch {
        // Not valid JSON — forward as-is
        return proxyResData;
      }
    },
  });
}

// ── Route definitions ────────────────────────────────────────────────────────

// ── PUBLIC routes (no authentication required) ──────────────────────────────
// Read-only access to tournament data for spectators/parents.

router.use(
  '/public/tournaments',
  (req: Request, res: Response, next: NextFunction) => {
    // Allow GET and POST /public/tournaments/:id/enroll for self-enrollment
    if (req.method === 'GET') {
      return buildProxy(config.services.tournaments, 'tournaments')(req, res, next);
    }
    if (req.method === 'POST' && req.originalUrl.includes('/enroll')) {
      return buildProxy(config.services.tournaments, 'tournaments')(req, res, next);
    }
    res.status(405).json({ data: null, success: false, message: 'Method not allowed on public routes' });
    return;
  },
);

router.use(
  '/public/teams',
  (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      res.status(405).json({ data: null, success: false, message: 'Method not allowed on public routes' });
      return;
    }
    buildProxy(config.services.teams, 'teams')(req, res, next);
  },
);

router.use(
  '/public/matches',
  (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      res.status(405).json({ data: null, success: false, message: 'Method not allowed on public routes' });
      return;
    }
    buildProxy(config.services.matches, 'matches')(req, res, next);
  },
);

router.use(
  '/public/standings',
  (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      res.status(405).json({ data: null, success: false, message: 'Method not allowed on public routes' });
      return;
    }
    buildProxy(config.services.standings, 'standings')(req, res, next);
  },
);

router.use(
  '/public/sports',
  (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      res.status(405).json({ data: null, success: false, message: 'Method not allowed on public routes' });
      return;
    }
    buildProxy(config.services.sports, 'sports')(req, res, next);
  },
);

// ── PROTECTED routes (authentication required) ──────────────────────────────

router.use(
  '/api/sports',
  authMiddleware,
  blockReadOnlyWrites,
  (req: Request, res: Response, next: NextFunction) =>
    buildProxy(config.services.sports, 'sports')(req, res, next),
);

router.use(
  '/api/tournaments',
  authMiddleware,
  blockReadOnlyWrites,
  authorizeTournamentWrite,
  (req: Request, res: Response, next: NextFunction) =>
    buildProxy(config.services.tournaments, 'tournaments')(req, res, next),
);

router.use(
  '/api/teams',
  authMiddleware,
  blockReadOnlyWrites,
  authorizeTeamWrite,
  (req: Request, res: Response, next: NextFunction) =>
    buildProxy(config.services.teams, 'teams')(req, res, next),
);

router.use(
  '/api/matches',
  authMiddleware,
  blockReadOnlyWrites,
  authorizeMatchWrite,
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
