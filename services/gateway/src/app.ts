import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import { correlationMiddleware }         from './middleware/correlation.middleware.js';
import { rateLimitMiddleware }           from './middleware/rate-limit.middleware.js';
import { responseNormalizeMiddleware }   from './middleware/response-normalize.middleware.js';
import { authMiddleware }               from './middleware/auth.middleware.js';
import { errorMiddleware }               from './middleware/error.middleware.js';
import { authRouter }                    from './routes/auth.routes.js';
import { usersRouter }                   from './routes/users.routes.js';
import { notificationsRouter }           from './routes/notifications.routes.js';
import { proxyRouter }                   from './routes/proxy.routes.js';
import { logger }                        from './logger.js';
import { config }                        from './config.js';

/**
 * Express application factory for the API Gateway.
 *
 * Middleware order:
 *  1. helmet           — security headers
 *  2. cors             — cross-origin with credentials (needed for httpOnly cookies)
 *  3. cookie-parser    — parses httpOnly cookies for /auth/me and proxied auth checks
 *  4. correlation      — attach/generate X-Correlation-ID
 *  5. pino-http        — structured request logging
 *  6. rate limiter     — protect against abuse
 *  7. json parser      — parse request bodies
 *  8. /health          — public health check
 *  9. /auth            — public login/logout/me (no JWT required)
 * 10. /api/*           — proxied routes (JWT required)
 * 11. error handler    — must be last
 */
export function createApp() {
  const app = express();

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:    ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // needed for the Angular dev server
  }));

  // ── CORS ───────────────────────────────────────────────────────────────────
  // credentials: true is required for the browser to send httpOnly cookies.
  // In production, replace the origin list with the real frontend URL.
  const allowedOrigins = config.nodeEnv === 'production'
    ? (process.env['FRONTEND_URL'] ? [process.env['FRONTEND_URL']] : false)
    : ['http://localhost:4200', 'http://127.0.0.1:4200'];

  app.use(cors({
    origin:         allowedOrigins,
    credentials:    true,
    methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  }));

  // ── Cookie parser ──────────────────────────────────────────────────────────
  // Required to read the httpOnly auth_token cookie in /auth/me
  app.use(cookieParser());

  // ── Correlation ID ─────────────────────────────────────────────────────────
  app.use(correlationMiddleware);

  // ── HTTP request logging ───────────────────────────────────────────────────
  app.use(pinoHttp({
    logger,
    customProps: (_req, res) => ({
      correlationId: res.locals['correlationId'],
    }),
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
  }));

  // ── Rate limiting ──────────────────────────────────────────────────────────
  app.use(rateLimitMiddleware);

  // ── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // ── Health check (public) ──────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      data:      { status: 'ok', service: 'gateway', timestamp: new Date().toISOString() },
      success:   true,
      message:   '',
    });
  });

  // ── Swagger / OpenAPI docs (public) ────────────────────────────────────────
  try {
    // Try dist/docs first (production), fallback to src/docs (development)
    let specPath = resolve(__dirname, 'docs', 'openapi.yaml');
    try { readFileSync(specPath); } catch {
      specPath = resolve(__dirname, '..', 'src', 'docs', 'openapi.yaml');
    }
    const specContent = readFileSync(specPath, 'utf8');
    const swaggerDocument = parseYaml(specContent) as Record<string, unknown>;
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'OlimpicApp API Docs',
    }));
    logger.info('Swagger UI mounted at /api-docs');
  } catch (err) {
    logger.warn({ err }, 'Failed to load OpenAPI spec — /api-docs disabled');
  }

  // ── Auth routes (public — no JWT required) ─────────────────────────────────
  // POST /auth/login  → sets httpOnly cookie
  // POST /auth/logout → clears httpOnly cookie
  // GET  /auth/me     → returns user from cookie
  app.use('/auth', authRouter);

  // ── Users API (auth required, handled directly by gateway) ─────────────────
  app.use('/api/users', authMiddleware, usersRouter);

  // ── Notifications API (auth required) ──────────────────────────────────────
  app.use('/api/notifications', authMiddleware, notificationsRouter);

  // ── Response normalization for all proxied routes ──────────────────────────
  // Wraps { data } → { data, success: true, message: '' }
  // Applied before proxy so it intercepts the proxied response.
  app.use('/api', responseNormalizeMiddleware);
  app.use('/public', responseNormalizeMiddleware);

  // ── Proxied microservice routes (JWT required) ─────────────────────────────
  app.use(proxyRouter);

  // ── 404 fallback ───────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      data:    null,
      success: false,
      message: 'Ruta no encontrada',
      code:    'NOT_FOUND',
    });
  });

  // ── Global error handler (must be last) ───────────────────────────────────
  app.use(errorMiddleware);

  return app;
}
