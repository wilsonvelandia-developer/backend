import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { pool, checkDbConnection } from './db/pool.js';
import { VenuesRepository } from './venues/venues.repository.js';
import { VenuesService } from './venues/venues.service.js';
import { buildVenuesRouter } from './venues/venues.router.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { logger } from './logger.js';
import { config } from './config.js';

export async function createApp() {
  await checkDbConnection();

  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(pinoHttp({
    logger,
    customProps: (req) => ({ correlationId: req.headers['x-correlation-id'] }),
    autoLogging: { ignore: (req) => req.url === '/health' },
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[REDACTED]' },
  }));
  app.use(express.json({ limit: '512kb' }));

  app.get('/health', async (_req: Request, res: Response) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', service: 'venues', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'error', service: 'venues' });
    }
  });

  const venuesRepo = new VenuesRepository(pool);
  const venuesService = new VenuesService(venuesRepo);
  app.use('/venues', buildVenuesRouter(venuesService));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found' });
  });
  app.use(errorMiddleware);

  logger.info({ port: config.port, env: config.nodeEnv }, 'Venues service configured');
  return app;
}
