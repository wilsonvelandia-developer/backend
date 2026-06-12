import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { correlationMiddleware } from './middleware/correlation.middleware.js';
import { rateLimitMiddleware }   from './middleware/rate-limit.middleware.js';
import { errorMiddleware }       from './middleware/error.middleware.js';
import { proxyRouter }           from './routes/proxy.routes.js';
import { logger }                from './logger.js';
import { config }                from './config.js';

/**
 * Express application factory for the API Gateway.
 *
 * Middleware order (matters):
 *  1. helmet         — security headers
 *  2. cors           — cross-origin policy
 *  3. correlation    — attach/generate correlation ID
 *  4. pino-http      — structured request logging
 *  5. rate limiter   — protect against abuse
 *  6. json parser    — parse request bodies
 *  7. routes         — health check + proxy routes
 *  8. error handler  — must be last
 */
export function createApp() {
  const app = express();

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }));

  // ── CORS ───────────────────────────────────────────────────────────────────
  // In production, replace origin with the actual frontend domain(s)
  app.use(cors({
    origin:      config.nodeEnv === 'production' ? false : true,
    credentials: true,
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  }));

  // ── Correlation ID ─────────────────────────────────────────────────────────
  app.use(correlationMiddleware);

  // ── HTTP request logging ───────────────────────────────────────────────────
  app.use(pinoHttp({
    logger,
    customProps: (_req, res) => ({
      correlationId: res.locals['correlationId'],
    }),
    // Never log Authorization header value — only presence
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
    // Skip logging health checks to reduce noise
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
  }));

  // ── Rate limiting ──────────────────────────────────────────────────────────
  app.use(rateLimitMiddleware);

  // ── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // ── Health check (public — no auth required) ───────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status:    'ok',
      service:   'gateway',
      timestamp: new Date().toISOString(),
    });
  });

  // ── Proxy routes ───────────────────────────────────────────────────────────
  app.use(proxyRouter);

  // ── 404 fallback ───────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      code:    'NOT_FOUND',
      message: 'Route not found',
    });
  });

  // ── Global error handler (must be last) ───────────────────────────────────
  app.use(errorMiddleware);

  return app;
}
