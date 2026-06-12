import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { pinoHttp }          from 'pino-http';
import { pool, checkDbConnection } from './db/pool.js';
import { SportsRepository }  from './sports/sports.repository.js';
import { SportsService }     from './sports/sports.service.js';
import { buildSportsRouter } from './sports/sports.router.js';
import { errorMiddleware }   from './middleware/error.middleware.js';
import { logger }            from './logger.js';
import { config }            from './config.js';

export async function createApp() {
  // Verify DB is reachable before accepting traffic
  await checkDbConnection();

  const app = express();

  // ── Security headers ───────────────────────────────────────────────────────
  // Internal service — less strict CSP than the gateway, but still hardened
  app.use(helmet({ contentSecurityPolicy: false }));

  // ── Request logging ────────────────────────────────────────────────────────
  app.use(pinoHttp({
    logger,
    customProps: (req) => ({ correlationId: req.headers['x-correlation-id'] }),
    autoLogging: { ignore: (req) => req.url === '/health' },
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[REDACTED]' },
  }));

  // ── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: '512kb' }));

  // ── Health check ───────────────────────────────────────────────────────────
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', service: 'sports', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'error', service: 'sports' });
    }
  });

  // ── Dependency wiring ──────────────────────────────────────────────────────
  const sportsRepo    = new SportsRepository(pool);
  const sportsService = new SportsService(sportsRepo);

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/sports', buildSportsRouter(sportsService));

  // ── 404 ────────────────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found' });
  });

  // ── Error handler (must be last) ───────────────────────────────────────────
  app.use(errorMiddleware);

  // Log resolved configuration (no secrets)
  logger.info({ port: config.port, env: config.nodeEnv }, 'Sports service configured');

  return app;
}
