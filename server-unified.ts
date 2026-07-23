/**
 * Unified Server — Single process deployment.
 *
 * Consolidates all 10 microservices into one Express server.
 * Instead of proxying HTTP requests between services, mounts all routers directly.
 *
 * This reduces deployment cost from ~$50/mo (10 containers) to ~$5/mo (1 container).
 * The code structure remains modular — each domain stays in its own folder.
 *
 * Usage:
 *   NODE_ENV=production node dist/server-unified.js
 *
 * Requires:
 *   - DATABASE_URL (PostgreSQL connection string)
 *   - JWT_SECRET (min 64 chars)
 *   - FRONTEND_URL (for CORS in production)
 */

import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Pool } from 'pg';
import { pinoHttp } from 'pino-http';
import path from 'path';
import dotenv from 'dotenv';

// Load env
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config();

// ── Shared imports ───────────────────────────────────────────────────────────
import { logger } from './services/gateway/src/logger.js';
import { config } from './services/gateway/src/config.js';

// Gateway middleware
import { correlationMiddleware } from './services/gateway/src/middleware/correlation.middleware.js';
import { rateLimitMiddleware } from './services/gateway/src/middleware/rate-limit.middleware.js';
import { authMiddleware } from './services/gateway/src/middleware/auth.middleware.js';
import { buildAuthorizationMiddleware } from './services/gateway/src/middleware/authorization.middleware.js';
import { writeLoggerMiddleware } from './services/gateway/src/middleware/write-logger.middleware.js';
import { planLimitsMiddleware } from './services/gateway/src/middleware/plan-limits.middleware.js';
import { tournamentLifecycleMiddleware } from './services/gateway/src/middleware/tournament-lifecycle.middleware.js';
import { errorMiddleware } from './services/gateway/src/middleware/error.middleware.js';

// Gateway direct routes (auth, users, notifications)
import { buildAuthRouter } from './services/gateway/src/routes/auth.routes.js';
import { usersRouter } from './services/gateway/src/routes/users.routes.js';
import { notificationsRouter } from './services/gateway/src/routes/notifications.routes.js';

// Service routers
import { buildSportsRouter } from './services/sports/src/sports/sports.router.js';
import { SportsRepository } from './services/sports/src/sports/sports.repository.js';
import { SportsService } from './services/sports/src/sports/sports.service.js';

import { buildTournamentsRouter } from './services/tournaments/src/tournaments/tournaments.router.js';
import { TournamentsRepository } from './services/tournaments/src/tournaments/tournaments.repository.js';
import { TournamentsService } from './services/tournaments/src/tournaments/tournaments.service.js';

import { buildTeamsRouter } from './services/teams/src/teams/teams.router.js';
import { TeamsRepository } from './services/teams/src/teams/teams.repository.js';
import { TeamsService } from './services/teams/src/teams/teams.service.js';

import { buildMatchesRouter } from './services/matches/src/matches/matches.router.js';
import { MatchesRepository } from './services/matches/src/matches/matches.repository.js';
import { MatchesService } from './services/matches/src/matches/matches.service.js';
import { NotificationsHelper } from './services/matches/src/matches/notifications.helper.js';

import { buildStandingsRouter } from './services/standings/src/standings/standings.router.js';
import { StandingsRepository } from './services/standings/src/standings/standings.repository.js';
import { StandingsService } from './services/standings/src/standings/standings.service.js';

import { buildVenuesRouter } from './services/venues/src/venues/venues.router.js';
import { VenuesRepository } from './services/venues/src/venues/venues.repository.js';
import { VenuesService } from './services/venues/src/venues/venues.service.js';

import { buildAnnouncementsRouter } from './services/announcements/src/announcements/announcements.router.js';
import { AnnouncementsRepository } from './services/announcements/src/announcements/announcements.repository.js';
import { AnnouncementsService } from './services/announcements/src/announcements/announcements.service.js';

import { buildPaymentsRouter } from './services/payments/src/payments/payments.router.js';
import { PaymentsRepository } from './services/payments/src/payments/payments.repository.js';
import { PaymentsService } from './services/payments/src/payments/payments.service.js';

import { buildGalleryRouter } from './services/gallery/src/gallery/gallery.router.js';
import { GalleryRepository } from './services/gallery/src/gallery/gallery.repository.js';
import { GalleryService } from './services/gallery/src/gallery/gallery.service.js';

// WebSocket (optional — for real-time features)
import { createSocketServer } from './services/gateway/src/websocket/socket-server.js';

// ── Database Pool (shared by all services) ───────────────────────────────────
const pool = new Pool({
  connectionString: config.db.connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Query safety: prevent runaway queries from holding connections
  statement_timeout: 30000,                    // 30s max per query
  idle_in_transaction_session_timeout: 60000,  // 60s max idle in transaction
});

// ── Build all service routers ────────────────────────────────────────────────
const authRouter = buildAuthRouter(pool);
const {
  blockReadOnlyWrites,
  authorizeTournamentWrite,
  authorizeTeamWrite,
  authorizeMatchWrite,
  injectOwnershipContext,
} = buildAuthorizationMiddleware(pool);

// Shared audit service for tracking write operations
import { AuditService } from './shared/src/audit/audit.service.js';
const auditService = new AuditService(pool);

const sportsRouter = buildSportsRouter(new SportsService(new SportsRepository(pool)));
const tournamentsRouter = buildTournamentsRouter(new TournamentsService(new TournamentsRepository(pool)), auditService);
const teamsRouter = buildTeamsRouter(new TeamsService(new TeamsRepository(pool)), auditService);
const matchesRouter = buildMatchesRouter(new MatchesService(new MatchesRepository(pool), new NotificationsHelper(pool)), auditService);
const standingsRouter = buildStandingsRouter(new StandingsService(new StandingsRepository(pool)));
const venuesRouter = buildVenuesRouter(new VenuesService(new VenuesRepository(pool)));
const announcementsRouter = buildAnnouncementsRouter(new AnnouncementsService(new AnnouncementsRepository(pool)));
const paymentsRouter = buildPaymentsRouter(new PaymentsService(new PaymentsRepository(pool)));
const galleryRouter = buildGalleryRouter(new GalleryService(new GalleryRepository(pool)));

// ── Express App ──────────────────────────────────────────────────────────────
const app = express();

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Angular requires inline styles
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      fontSrc: ["'self'", 'https:', 'data:'],
      connectSrc: [
        "'self'",
        // WebSocket connections
        'ws://localhost:*',
        'wss://localhost:*',
        // Firebase Cloud Messaging
        'https://fcm.googleapis.com',
        'https://firebaseinstallations.googleapis.com',
        ...(process.env['FRONTEND_URL'] ? [process.env['FRONTEND_URL']] : []),
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // Required for some image loading patterns
}));

// CORS
const allowedOrigins = config.nodeEnv === 'production'
  ? (process.env['FRONTEND_URL'] ? [process.env['FRONTEND_URL']] : false)
  : ['http://localhost:4200', 'http://127.0.0.1:4200'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
}));

app.use(cookieParser());
app.use(correlationMiddleware);

import { apiVersionMiddleware } from './services/gateway/src/middleware/api-version.middleware.js';
import { contentTypeMiddleware } from './services/gateway/src/middleware/content-type.middleware.js';
app.use(apiVersionMiddleware);

app.use(pinoHttp({
  logger,
  customProps: (_req, res) => ({ correlationId: res.locals['correlationId'] }),
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[REDACTED]' },
  autoLogging: { ignore: (req) => req.url === '/health' },
}));

app.use(rateLimitMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use(contentTypeMiddleware);
app.use(writeLoggerMiddleware);

// ── Health ───────────────────────────────────────────────────────────────────
const startTime = Date.now();

// Liveness — lightweight check (always responds if process is alive)
app.get('/health/live', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness — full check (DB connection, pool health)
app.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// Full health — detailed status for monitoring dashboards
app.get('/health', async (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  const poolStatus = {
    totalConnections: pool.totalCount,
    idleConnections:  pool.idleCount,
    waitingRequests:  pool.waitingCount,
  };

  let dbHealthy = false;
  try {
    await pool.query('SELECT 1');
    dbHealthy = true;
  } catch { /* db unreachable */ }

  const status = dbHealthy ? 'ok' : 'degraded';
  const httpStatus = dbHealthy ? 200 : 503;

  res.status(httpStatus).json({
    data: {
      status,
      mode: 'unified',
      version: '1.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      database: {
        connected: dbHealthy,
        pool: poolStatus,
      },
      memory: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      },
    },
    success: dbHealthy,
    message: dbHealthy ? '' : 'Database unavailable',
  });
});

// ── Auth (public) ────────────────────────────────────────────────────────────
app.use('/auth', authRouter);

// ── Public routes (no auth) ──────────────────────────────────────────────────
app.use('/public/sports', sportsRouter);
app.use('/public/tournaments', tournamentsRouter);
app.use('/public/teams', teamsRouter);
app.use('/public/matches', matchesRouter);
app.use('/public/standings', standingsRouter);

// Public plans endpoint (no auth, no router — direct handler)
app.get('/public/plans', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, slug, name, price_cop AS "priceCop",
              max_teams_per_tournament AS "maxTeamsPerTournament",
              max_active_tournaments AS "maxActiveTournaments",
              max_venues AS "maxVenues",
              features, display_order AS "displayOrder"
       FROM subscription_plans
       WHERE is_active = TRUE
       ORDER BY display_order`,
    );
    res.json({ data: result.rows, success: true, message: '' });
  } catch {
    res.json({ data: [], success: false, message: 'Error loading plans' });
  }
});

// ── Protected routes (auth required) ─────────────────────────────────────────
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api/notifications', authMiddleware, notificationsRouter);
app.use('/api/sports', authMiddleware, blockReadOnlyWrites, sportsRouter);
app.use('/api/tournaments', authMiddleware, planLimitsMiddleware, tournamentLifecycleMiddleware, blockReadOnlyWrites, authorizeTournamentWrite, tournamentsRouter);
app.use('/api/teams', authMiddleware, planLimitsMiddleware, tournamentLifecycleMiddleware, blockReadOnlyWrites, authorizeTeamWrite, injectOwnershipContext, teamsRouter);
app.use('/api/matches', authMiddleware, tournamentLifecycleMiddleware, blockReadOnlyWrites, authorizeMatchWrite, matchesRouter);
app.use('/api/standings', authMiddleware, standingsRouter);
app.use('/api/venues', authMiddleware, blockReadOnlyWrites, venuesRouter);
app.use('/api/announcements', authMiddleware, blockReadOnlyWrites, announcementsRouter);
app.use('/api/payments', authMiddleware, blockReadOnlyWrites, paymentsRouter);
app.use('/api/gallery', authMiddleware, blockReadOnlyWrites, galleryRouter);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ data: null, success: false, message: 'Ruta no encontrada' });
});

// ── Error handler ────────────────────────────────────────────────────────────
app.use(errorMiddleware);

// ── Start Server ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env['PORT'] ?? process.env['GATEWAY_PORT'] ?? '3000', 10);
const httpServer = createServer(app);

// Attach WebSocket server
createSocketServer(httpServer);

httpServer.listen(PORT, () => {
  logger.info({ port: PORT, mode: 'unified', env: config.nodeEnv }, '🚀 OlimpicApp unified server running');
});

// Graceful shutdown with connection drain
const SHUTDOWN_TIMEOUT_MS = 15000; // 15 seconds max for graceful drain

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, `${signal} received — starting graceful shutdown`);

  // 1. Stop accepting new connections
  httpServer.close(() => {
    logger.info('HTTP server closed — no new connections accepted');
  });

  // 2. Set a hard timeout in case drain takes too long
  const forceExit = setTimeout(() => {
    logger.warn('Shutdown timeout reached — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  // 3. Wait for existing connections to drain (Express handles this via server.close)
  // 4. Close database pool (waits for active queries to finish)
  try {
    await pool.end();
    logger.info('Database pool closed');
  } catch (err) {
    logger.error({ err }, 'Error closing database pool');
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
