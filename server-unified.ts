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
import {
  blockReadOnlyWrites,
  authorizeTournamentWrite,
  authorizeTeamWrite,
  authorizeMatchWrite,
  injectOwnershipContext,
} from './services/gateway/src/middleware/authorization.middleware.js';
import { errorMiddleware } from './services/gateway/src/middleware/error.middleware.js';

// Gateway direct routes (auth, users, notifications)
import { authRouter } from './services/gateway/src/routes/auth.routes.js';
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
});

// ── Build all service routers ────────────────────────────────────────────────
const sportsRouter = buildSportsRouter(new SportsService(new SportsRepository(pool)));
const tournamentsRouter = buildTournamentsRouter(new TournamentsService(new TournamentsRepository(pool)));
const teamsRouter = buildTeamsRouter(new TeamsService(new TeamsRepository(pool)));
const matchesRouter = buildMatchesRouter(new MatchesService(new MatchesRepository(pool), new NotificationsHelper(pool)));
const standingsRouter = buildStandingsRouter(new StandingsService(new StandingsRepository(pool)));
const venuesRouter = buildVenuesRouter(new VenuesService(new VenuesRepository(pool)));
const announcementsRouter = buildAnnouncementsRouter(new AnnouncementsService(new AnnouncementsRepository(pool)));
const paymentsRouter = buildPaymentsRouter(new PaymentsService(new PaymentsRepository(pool)));
const galleryRouter = buildGalleryRouter(new GalleryService(new GalleryRepository(pool)));

// ── Express App ──────────────────────────────────────────────────────────────
const app = express();

// Security
app.use(helmet({ contentSecurityPolicy: false }));

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

app.use(pinoHttp({
  logger,
  customProps: (_req, res) => ({ correlationId: res.locals['correlationId'] }),
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[REDACTED]' },
  autoLogging: { ignore: (req) => req.url === '/health' },
}));

app.use(rateLimitMiddleware);
app.use(express.json({ limit: '1mb' }));

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ data: { status: 'ok', mode: 'unified', timestamp: new Date().toISOString() }, success: true, message: '' });
  } catch {
    res.status(503).json({ data: { status: 'error' }, success: false, message: 'Database unavailable' });
  }
});

// ── Auth (public) ────────────────────────────────────────────────────────────
app.use('/auth', authRouter);

// ── Public routes (no auth) ──────────────────────────────────────────────────
app.use('/public/sports', sportsRouter);
app.use('/public/tournaments', tournamentsRouter);
app.use('/public/teams', teamsRouter);
app.use('/public/matches', matchesRouter);
app.use('/public/standings', standingsRouter);

// ── Protected routes (auth required) ─────────────────────────────────────────
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api/notifications', authMiddleware, notificationsRouter);
app.use('/api/sports', authMiddleware, blockReadOnlyWrites, sportsRouter);
app.use('/api/tournaments', authMiddleware, blockReadOnlyWrites, authorizeTournamentWrite, tournamentsRouter);
app.use('/api/teams', authMiddleware, blockReadOnlyWrites, authorizeTeamWrite, injectOwnershipContext, teamsRouter);
app.use('/api/matches', authMiddleware, blockReadOnlyWrites, authorizeMatchWrite, matchesRouter);
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  httpServer.close();
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down');
  httpServer.close();
  await pool.end();
  process.exit(0);
});
