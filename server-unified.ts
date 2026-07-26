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

// Upload directory — resolved early so both upload handler and static middleware use the same path
import { existsSync, mkdirSync } from 'fs';
import { resolve as resolvePath } from 'path';
const uploadsDir = resolvePath(process.env['LOCAL_UPLOAD_DIR'] ?? path.join(__dirname, '..', 'uploads'));
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

// Upload route must be mounted BEFORE express.json() because it needs raw multipart body
// Upload route — uses raw body for multipart, mounted before express.json()
// We use express.raw() specifically for this route
app.post('/api/upload', authMiddleware, express.raw({ type: 'multipart/form-data', limit: '10mb' }), async (_req: Request, res: Response) => {
  res.status(501).json({ data: null, success: false, message: 'Use /api/upload-json instead' });
});

// JSON-based upload endpoint (reliable — no multipart parsing issues)
app.post('/api/upload-json', express.json({ limit: '15mb' }), authMiddleware, async (req: Request, res: Response) => {
  try {
    const { fileName, mimeType, base64Data, folder } = req.body as {
      fileName: string; mimeType: string; base64Data: string; folder?: string;
    };

    if (!fileName || !mimeType || !base64Data) {
      res.status(422).json({ data: null, success: false, message: 'fileName, mimeType y base64Data son requeridos' });
      return;
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowedMimes.includes(mimeType)) {
      res.status(422).json({ data: null, success: false, message: 'Tipo no permitido. Use: JPG, PNG, WebP, GIF o PDF.' });
      return;
    }

    const data = Buffer.from(base64Data, 'base64');
    if (data.length > 10 * 1024 * 1024) {
      res.status(413).json({ data: null, success: false, message: 'El archivo excede 10MB' });
      return;
    }

    const crypto = await import('crypto');
    const pathMod = await import('path');
    const ext = pathMod.extname(fileName) || '.jpg';
    const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const storagePath = `${folder ?? 'uploads'}/${uniqueName}`;

    // Local storage (development)
    const fs = await import('fs');
    const fullPath = pathMod.join(uploadsDir, storagePath);
    const dir = pathMod.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, data);

    const baseUrl = process.env['LOCAL_UPLOAD_BASE_URL'] ?? `http://localhost:${PORT}/uploads`;
    const url = `${baseUrl}/${storagePath}`;

    logger.info({ storagePath, size: data.length }, 'File uploaded');
    res.json({ data: { url, path: storagePath, fileName: uniqueName }, success: true, message: 'Archivo subido' });
  } catch (err) {
    logger.error({ err }, 'Upload error');
    res.status(500).json({ data: null, success: false, message: 'Error al subir archivo' });
  }
});

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

// Serve uploaded files (local storage — development)
// Disable CORP header for uploads so cross-origin (Angular dev server) can load images
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(uploadsDir));
logger.info({ uploadsDir }, 'Static uploads directory');

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

// Public card backgrounds endpoint (for card generation — no auth)
app.get('/public/card-backgrounds', async (req: Request, res: Response) => {
  try {
    const cardType = req.query['cardType'] as string | undefined;
    const conditions = ["is_active = true"];
    const values: unknown[] = [];
    if (cardType && cardType !== 'all') {
      conditions.push(`(card_type = $1 OR card_type = 'all')`);
      values.push(cardType);
    }
    const result = await pool.query(
      `SELECT id, card_type AS "cardType", name, image_url AS "imageUrl", display_order AS "displayOrder"
       FROM card_backgrounds WHERE ${conditions.join(' AND ')}
       ORDER BY display_order, created_at DESC`,
      values,
    );
    res.json({ data: result.rows, success: true, message: '' });
  } catch {
    res.json({ data: [], success: false, message: 'Error loading backgrounds' });
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

// ── Players listing (all players across teams with filters) ──────────────────
app.get('/api/players', authMiddleware, async (req: Request, res: Response) => {
  try {
    const teamId       = req.query['teamId']       as string | undefined;
    const tournamentId = req.query['tournamentId'] as string | undefined;
    const position     = req.query['position']     as string | undefined;
    const search       = req.query['search']       as string | undefined;
    const page         = parseInt(req.query['page'] as string ?? '1', 10);
    const pageSize     = parseInt(req.query['pageSize'] as string ?? '20', 10);

    const conditions: string[] = ['p.is_active = true'];
    const values: unknown[] = [];
    let idx = 1;

    if (teamId) { conditions.push(`p.team_id = $${idx++}`); values.push(teamId); }
    if (tournamentId) { conditions.push(`t.tournament_id = $${idx++}`); values.push(tournamentId); }
    if (position) { conditions.push(`p.position ILIKE $${idx++}`); values.push(`%${position}%`); }
    if (search) { conditions.push(`(p.name ILIKE $${idx} OR u.document_number ILIKE $${idx})`); values.push(`%${search}%`); idx++; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;
    values.push(pageSize, offset);

    const result = await pool.query(
      `SELECT p.id, p.team_id AS "teamId", p.name, p.jersey_number AS "jerseyNumber",
              p.position, p.is_active AS "isActive", p.user_id AS "userId",
              t.name AS "teamName", t.tournament_id AS "tournamentId",
              trn.name AS "tournamentName", trn.category,
              u.birth_date AS "birthDate", u.photo_url AS "photoUrl",
              u.document_number AS "documentNumber",
              COUNT(*) OVER()::int AS _total
       FROM players p
       JOIN teams t ON t.id = p.team_id
       LEFT JOIN tournaments trn ON trn.id = t.tournament_id
       LEFT JOIN users u ON u.id = p.user_id
       ${where}
       ORDER BY p.name ASC
       LIMIT $${idx++} OFFSET $${idx}`,
      values,
    );

    const total = result.rows[0] ? parseInt((result.rows[0] as Record<string, string>)['_total'], 10) : 0;
    const data = result.rows.map((r: Record<string, unknown>) => {
      const row = { ...r };
      delete row['_total'];
      return row;
    });

    res.json({ data, total, page, pageSize, success: true, message: '' });
  } catch (err) {
    res.status(500).json({ data: [], total: 0, success: false, message: 'Error cargando jugadores' });
  }
});
app.use('/api/venues', authMiddleware, blockReadOnlyWrites, venuesRouter);
app.use('/api/announcements', authMiddleware, blockReadOnlyWrites, announcementsRouter);
app.use('/api/payments', authMiddleware, blockReadOnlyWrites, paymentsRouter);
app.use('/api/gallery', authMiddleware, blockReadOnlyWrites, galleryRouter);

// ── Admin: Card Backgrounds CRUD ─────────────────────────────────────────────
app.get('/api/card-backgrounds', authMiddleware, async (_req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT id, card_type AS "cardType", name, image_url AS "imageUrl", is_active AS "isActive", display_order AS "displayOrder", created_at AS "createdAt"
     FROM card_backgrounds ORDER BY display_order, created_at DESC`,
  );
  res.json({ data: result.rows, success: true, message: '' });
});

app.post('/api/card-backgrounds', authMiddleware, async (req: Request, res: Response) => {
  const roles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];
  if (!roles.includes('admin')) { res.status(403).json({ data: null, success: false, message: 'Solo admin' }); return; }
  const { cardType, name, imageUrl, displayOrder } = req.body as { cardType: string; name: string; imageUrl: string; displayOrder?: number };
  if (!cardType || !name || !imageUrl) { res.status(422).json({ data: null, success: false, message: 'cardType, name, imageUrl requeridos' }); return; }
  const result = await pool.query(
    `INSERT INTO card_backgrounds (card_type, name, image_url, display_order) VALUES ($1, $2, $3, $4) RETURNING id, card_type AS "cardType", name, image_url AS "imageUrl", is_active AS "isActive"`,
    [cardType, name, imageUrl, displayOrder ?? 0],
  );
  res.status(201).json({ data: result.rows[0], success: true, message: 'Background creado' });
});

app.put('/api/card-backgrounds/:id', authMiddleware, async (req: Request, res: Response) => {
  const roles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];
  if (!roles.includes('admin')) { res.status(403).json({ data: null, success: false, message: 'Solo admin' }); return; }
  const { id } = req.params;
  const { name, imageUrl, isActive, displayOrder, cardType } = req.body as Record<string, unknown>;
  const fields: string[] = []; const values: unknown[] = []; let idx = 1;
  if (name !== undefined) { fields.push(`name=$${idx++}`); values.push(name); }
  if (imageUrl !== undefined) { fields.push(`image_url=$${idx++}`); values.push(imageUrl); }
  if (isActive !== undefined) { fields.push(`is_active=$${idx++}`); values.push(isActive); }
  if (displayOrder !== undefined) { fields.push(`display_order=$${idx++}`); values.push(displayOrder); }
  if (cardType !== undefined) { fields.push(`card_type=$${idx++}`); values.push(cardType); }
  if (fields.length === 0) { res.status(422).json({ data: null, success: false, message: 'Nada que actualizar' }); return; }
  values.push(id);
  await pool.query(`UPDATE card_backgrounds SET ${fields.join(', ')} WHERE id = $${idx}`, values);
  res.json({ data: { id }, success: true, message: 'Background actualizado' });
});

app.delete('/api/card-backgrounds/:id', authMiddleware, async (req: Request, res: Response) => {
  const roles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];
  if (!roles.includes('admin')) { res.status(403).json({ data: null, success: false, message: 'Solo admin' }); return; }
  await pool.query(`DELETE FROM card_backgrounds WHERE id = $1`, [req.params['id']]);
  res.json({ data: null, success: true, message: 'Background eliminado' });
});

// ── CSV Fixture Import ────────────────────────────────────────────────────────

// POST /api/tournaments/:id/import-fixture — import matches from JSON array
app.post('/api/tournaments/:tournamentId/import-fixture', authMiddleware, express.json({ limit: '5mb' }), async (req: Request, res: Response) => {
  try {
    // tournamentId from URL validates the route context
    const { phaseId, matches } = req.body as {
      phaseId: string;
      matches: Array<{ homeTeamId: string; awayTeamId: string; scheduledAt?: string; venue?: string; round?: string }>;
    };

    if (!phaseId || !matches || !Array.isArray(matches)) {
      res.status(422).json({ data: null, success: false, message: 'phaseId y matches[] requeridos' });
      return;
    }

    let created = 0;
    for (const m of matches) {
      if (!m.homeTeamId || !m.awayTeamId) continue;
      await pool.query(
        `INSERT INTO matches (phase_id, home_team_id, away_team_id, scheduled_at, venue, round)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [phaseId, m.homeTeamId, m.awayTeamId, m.scheduledAt ?? null, m.venue ?? null, m.round ?? null],
      );
      created++;
    }

    res.status(201).json({ data: { created }, success: true, message: `${created} partidos importados` });
  } catch (err) {
    logger.error({ err }, 'Fixture import error');
    res.status(500).json({ data: null, success: false, message: 'Error importando fixture' });
  }
});

// ── Live Streaming CRUD ───────────────────────────────────────────────────────

// GET /api/matches/:matchId/stream — get stream info for a match (public-friendly)
app.get('/api/matches/:matchId/stream', async (req: Request, res: Response) => {
  const { matchId } = req.params;
  const result = await pool.query(
    `SELECT id, match_id AS "matchId", platform, stream_url AS "streamUrl",
            embed_url AS "embedUrl", status, started_at AS "startedAt", ended_at AS "endedAt"
     FROM match_streams WHERE match_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [matchId],
  );
  res.json({ data: result.rows[0] ?? null, success: true, message: '' });
});

// Also expose on public route
app.get('/public/matches/:matchId/stream', async (req: Request, res: Response) => {
  const { matchId } = req.params;
  const result = await pool.query(
    `SELECT id, platform, stream_url AS "streamUrl", embed_url AS "embedUrl", status
     FROM match_streams WHERE match_id = $1 AND status IN ('live', 'scheduled') LIMIT 1`,
    [matchId],
  );
  res.json({ data: result.rows[0] ?? null, success: true, message: '' });
});

// POST /api/matches/:matchId/stream — create/update stream for a match
app.post('/api/matches/:matchId/stream', authMiddleware, async (req: Request, res: Response) => {
  const { matchId } = req.params;
  const { platform, streamUrl } = req.body as { platform: string; streamUrl: string };
  const userId = req.headers['x-user-id'] as string | undefined;

  if (!platform || !streamUrl) {
    res.status(422).json({ data: null, success: false, message: 'platform y streamUrl requeridos' });
    return;
  }

  // Auto-generate embed URL for known platforms
  const embedUrl = generateEmbedUrl(platform, streamUrl);

  // Upsert: delete previous stream for this match and create new
  await pool.query(`DELETE FROM match_streams WHERE match_id = $1`, [matchId]);
  const result = await pool.query(
    `INSERT INTO match_streams (match_id, platform, stream_url, embed_url, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, platform, stream_url AS "streamUrl", embed_url AS "embedUrl", status`,
    [matchId, platform, streamUrl, embedUrl, userId ?? null],
  );

  res.status(201).json({ data: result.rows[0], success: true, message: 'Stream configurado' });
});

// PUT /api/matches/:matchId/stream/status — change stream status (live/ended)
app.put('/api/matches/:matchId/stream/status', authMiddleware, async (req: Request, res: Response) => {
  const { matchId } = req.params;
  const { status } = req.body as { status: string };

  if (!['scheduled', 'live', 'ended'].includes(status)) {
    res.status(422).json({ data: null, success: false, message: 'Status inválido' });
    return;
  }

  const updates: string[] = [`status = '${status}'`];
  if (status === 'live') updates.push(`started_at = NOW()`);
  if (status === 'ended') updates.push(`ended_at = NOW()`);

  await pool.query(
    `UPDATE match_streams SET ${updates.join(', ')} WHERE match_id = $1`,
    [matchId],
  );

  res.json({ data: { matchId, status }, success: true, message: `Stream marcado como ${status}` });
});

// DELETE /api/matches/:matchId/stream
app.delete('/api/matches/:matchId/stream', authMiddleware, async (req: Request, res: Response) => {
  await pool.query(`DELETE FROM match_streams WHERE match_id = $1`, [req.params['matchId']]);
  res.json({ data: null, success: true, message: 'Stream eliminado' });
});

/**
 * Generates an embeddable URL from a stream watch URL.
 */
function generateEmbedUrl(platform: string, url: string): string | null {
  if (platform === 'youtube') {
    // https://www.youtube.com/watch?v=VIDEO_ID → https://www.youtube.com/embed/VIDEO_ID
    // https://youtu.be/VIDEO_ID → https://www.youtube.com/embed/VIDEO_ID
    // https://www.youtube.com/live/VIDEO_ID → https://www.youtube.com/embed/VIDEO_ID
    const match = url.match(/(?:v=|youtu\.be\/|\/live\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (match) return `https://www.youtube.com/embed/${match[1]}?autoplay=1`;
  }
  if (platform === 'facebook') {
    // Encode the URL for Facebook embed
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&autoplay=true`;
  }
  if (platform === 'twitch') {
    // https://www.twitch.tv/CHANNEL → embed
    const match = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
    if (match) return `https://player.twitch.tv/?channel=${match[1]}&parent=${process.env['FRONTEND_URL'] ?? 'localhost'}`;
  }
  // Custom: assume the URL is already embeddable
  return url;
}

// ── Talent Scouting API ───────────────────────────────────────────────────────

// GET /api/scouting/search — advanced player search with performance metrics
app.get('/api/scouting/search', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      position, minAge, maxAge, tournamentId,
      sortBy, page, pageSize,
    } = req.query as Record<string, string | undefined>;

    const pg = parseInt(page ?? '1', 10);
    const ps = parseInt(pageSize ?? '30', 10);
    const offset = (pg - 1) * ps;

    const conditions: string[] = ['p.is_active = true', 't.is_deleted = false'];
    const values: unknown[] = [];
    let idx = 1;

    if (position) { conditions.push(`p.position ILIKE $${idx++}`); values.push(`%${position}%`); }
    if (tournamentId) { conditions.push(`t.tournament_id = $${idx++}`); values.push(tournamentId); }
    if (minAge) {
      const maxBirth = new Date();
      maxBirth.setFullYear(maxBirth.getFullYear() - parseInt(minAge, 10));
      conditions.push(`u.birth_date <= $${idx++}`);
      values.push(maxBirth.toISOString().slice(0, 10));
    }
    if (maxAge) {
      const minBirth = new Date();
      minBirth.setFullYear(minBirth.getFullYear() - parseInt(maxAge, 10) - 1);
      conditions.push(`u.birth_date >= $${idx++}`);
      values.push(minBirth.toISOString().slice(0, 10));
    }

    const orderMap: Record<string, string> = {
      goals: '"goals" DESC',
      matches: '"matchesPlayed" DESC',
      winRate: '"winRate" DESC',
      goalsPerMatch: '"goalsPerMatch" DESC',
      age: '"age" ASC NULLS LAST',
      rating: '"performanceScore" DESC',
    };
    const orderBy = orderMap[sortBy ?? 'goals'] ?? '"goals" DESC';

    const where = conditions.join(' AND ');
    values.push(ps, offset);

    // Use subqueries to avoid cartesian products
    const result = await pool.query(
      `SELECT
         p.id AS "playerId",
         p.name AS "playerName",
         p.jersey_number AS "jerseyNumber",
         p.position,
         t.name AS "teamName",
         t.id AS "teamId",
         trn.name AS "tournamentName",
         trn.category,
         u.birth_date AS "birthDate",
         u.photo_url AS "photoUrl",
         CASE WHEN u.birth_date IS NOT NULL
           THEN EXTRACT(YEAR FROM AGE(NOW(), u.birth_date))::int
           ELSE NULL END AS "age",
         COALESCE((SELECT SUM(ms.points)::int FROM match_scorers ms WHERE ms.player_id = p.id), 0) AS "goals",
         COALESCE((SELECT COUNT(DISTINCT m.id)::int FROM matches m
           WHERE m.status = 'finished' AND (m.home_team_id = t.id OR m.away_team_id = t.id)), 0) AS "matchesPlayed",
         CASE WHEN (SELECT COUNT(DISTINCT m.id) FROM matches m WHERE m.status = 'finished' AND (m.home_team_id = t.id OR m.away_team_id = t.id)) > 0
           THEN ROUND(COALESCE((SELECT SUM(ms.points) FROM match_scorers ms WHERE ms.player_id = p.id), 0)::numeric
                / (SELECT COUNT(DISTINCT m.id) FROM matches m WHERE m.status = 'finished' AND (m.home_team_id = t.id OR m.away_team_id = t.id)), 2)::float
           ELSE 0 END AS "goalsPerMatch",
         COALESCE((SELECT COUNT(DISTINCT m.id)::int FROM matches m
           WHERE m.status = 'finished' AND m.winner_id = t.id AND (m.home_team_id = t.id OR m.away_team_id = t.id)), 0) AS "wins",
         CASE WHEN (SELECT COUNT(DISTINCT m.id) FROM matches m WHERE m.status = 'finished' AND (m.home_team_id = t.id OR m.away_team_id = t.id)) > 0
           THEN ROUND((SELECT COUNT(DISTINCT m.id) FROM matches m WHERE m.status = 'finished' AND m.winner_id = t.id AND (m.home_team_id = t.id OR m.away_team_id = t.id))::numeric
                / (SELECT COUNT(DISTINCT m.id) FROM matches m WHERE m.status = 'finished' AND (m.home_team_id = t.id OR m.away_team_id = t.id)) * 100, 1)::float
           ELSE 0 END AS "winRate",
         COALESCE((SELECT COUNT(*)::int FROM match_sanctions msan JOIN sanction_types st ON st.id = msan.sanction_type_id WHERE msan.player_id = p.id AND st.code = 'YELLOW'), 0) AS "yellowCards",
         COALESCE((SELECT COUNT(*)::int FROM match_sanctions msan JOIN sanction_types st ON st.id = msan.sanction_type_id WHERE msan.player_id = p.id AND st.code = 'RED'), 0) AS "redCards",
         -- Performance score
         (COALESCE((SELECT SUM(ms.points) FROM match_scorers ms WHERE ms.player_id = p.id), 0) * 3
          + COALESCE((SELECT COUNT(DISTINCT m.id) FROM matches m WHERE m.status = 'finished' AND m.winner_id = t.id AND (m.home_team_id = t.id OR m.away_team_id = t.id)), 0) * 2
          - COALESCE((SELECT COUNT(*) FROM match_sanctions msan JOIN sanction_types st ON st.id = msan.sanction_type_id WHERE msan.player_id = p.id AND st.code = 'YELLOW'), 0)
          - COALESCE((SELECT COUNT(*) FROM match_sanctions msan JOIN sanction_types st ON st.id = msan.sanction_type_id WHERE msan.player_id = p.id AND st.code = 'RED'), 0) * 3
         )::int AS "performanceScore",
         COUNT(*) OVER()::int AS _total
       FROM players p
       JOIN teams t ON t.id = p.team_id
       LEFT JOIN tournaments trn ON trn.id = t.tournament_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${idx++} OFFSET $${idx}`,
      values,
    );

    const total = result.rows[0] ? parseInt((result.rows[0] as Record<string, string>)['_total'], 10) : 0;
    const data = result.rows.map((r: Record<string, unknown>) => { const row = { ...r }; delete row['_total']; return row; });

    res.json({ data, total, page: pg, pageSize: ps, success: true, message: '' });
  } catch (err) {
    logger.error({ err }, 'Scouting search error');
    res.status(500).json({ data: [], total: 0, success: false, message: 'Error en búsqueda de talentos' });
  }
});

// POST /api/scouting/reports — save/update a scout report for a player
app.post('/api/scouting/reports', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  const { playerId, overallRating, technicalRating, physicalRating, tacticalRating, attitudeRating, notes, recommendation } = req.body as Record<string, unknown>;

  if (!playerId) { res.status(422).json({ data: null, success: false, message: 'playerId requerido' }); return; }

  const result = await pool.query(
    `INSERT INTO scout_reports (scout_user_id, player_id, overall_rating, technical_rating, physical_rating, tactical_rating, attitude_rating, notes, recommendation)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (scout_user_id, player_id) DO UPDATE SET
       overall_rating = COALESCE($3, scout_reports.overall_rating),
       technical_rating = COALESCE($4, scout_reports.technical_rating),
       physical_rating = COALESCE($5, scout_reports.physical_rating),
       tactical_rating = COALESCE($6, scout_reports.tactical_rating),
       attitude_rating = COALESCE($7, scout_reports.attitude_rating),
       notes = COALESCE($8, scout_reports.notes),
       recommendation = COALESCE($9, scout_reports.recommendation),
       updated_at = NOW()
     RETURNING id`,
    [userId, playerId, overallRating ?? null, technicalRating ?? null, physicalRating ?? null, tacticalRating ?? null, attitudeRating ?? null, notes ?? null, recommendation ?? null],
  );

  res.json({ data: result.rows[0], success: true, message: 'Reporte guardado' });
});

// GET /api/scouting/reports/:playerId — get all reports for a player
app.get('/api/scouting/reports/:playerId', authMiddleware, async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT sr.*, u.name AS "scoutName"
     FROM scout_reports sr
     JOIN users u ON u.id = sr.scout_user_id
     WHERE sr.player_id = $1
     ORDER BY sr.updated_at DESC`,
    [req.params['playerId']],
  );
  res.json({ data: result.rows, success: true, message: '' });
});

// ── Shortlists CRUD ──────────────────────────────────────────────────────────

app.get('/api/scouting/shortlists', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  const result = await pool.query(
    `SELECT sl.*, (SELECT COUNT(*)::int FROM scout_shortlist_players WHERE shortlist_id = sl.id) AS "playerCount"
     FROM scout_shortlists sl WHERE sl.user_id = $1 ORDER BY sl.created_at DESC`,
    [userId],
  );
  res.json({ data: result.rows, success: true, message: '' });
});

app.post('/api/scouting/shortlists', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  const { name, description } = req.body as { name: string; description?: string };
  if (!name) { res.status(422).json({ data: null, success: false, message: 'name requerido' }); return; }
  const result = await pool.query(
    `INSERT INTO scout_shortlists (user_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
    [userId, name, description ?? null],
  );
  res.json({ data: result.rows[0], success: true, message: 'Lista creada' });
});

app.post('/api/scouting/shortlists/:id/players', authMiddleware, async (req: Request, res: Response) => {
  const { playerId } = req.body as { playerId: string };
  if (!playerId) { res.status(422).json({ data: null, success: false, message: 'playerId requerido' }); return; }
  await pool.query(
    `INSERT INTO scout_shortlist_players (shortlist_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.params['id'], playerId],
  );
  res.json({ data: null, success: true, message: 'Jugador agregado a la lista' });
});

app.delete('/api/scouting/shortlists/:id/players/:playerId', authMiddleware, async (req: Request, res: Response) => {
  await pool.query(
    `DELETE FROM scout_shortlist_players WHERE shortlist_id = $1 AND player_id = $2`,
    [req.params['id'], req.params['playerId']],
  );
  res.json({ data: null, success: true, message: 'Jugador removido de la lista' });
});

// ── Feature Modules (plan-gated) ─────────────────────────────────────────────
import { buildFeatureModulesRouter } from './modules/feature-modules.js';
const featureModulesRouter = buildFeatureModulesRouter(pool, authMiddleware);
app.use('/api/modules', authMiddleware, featureModulesRouter);

// Public calendar sync (no auth needed for iCal)
app.get('/public/calendar/:tournamentId.ics', async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT m.id, m.scheduled_at, m.venue, ht.name AS home, at.name AS away, trn.name AS tournament
     FROM matches m JOIN teams ht ON ht.id = m.home_team_id JOIN teams at ON at.id = m.away_team_id
     JOIN phases ph ON ph.id = m.phase_id JOIN tournaments trn ON trn.id = ph.tournament_id
     WHERE ph.tournament_id = $1 AND m.scheduled_at IS NOT NULL ORDER BY m.scheduled_at`,
    [req.params['tournamentId']],
  );
  let ical = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//OlimpicApp//ES\r\n';
  for (const m of result.rows) {
    const row = m as Record<string, string>;
    const start = new Date(row['scheduled_at']).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    ical += `BEGIN:VEVENT\r\nUID:${row['id']}@olimpicapp\r\nDTSTART:${start}\r\nSUMMARY:${row['home']} vs ${row['away']}\r\nEND:VEVENT\r\n`;
  }
  ical += 'END:VCALENDAR\r\n';
  res.setHeader('Content-Type', 'text/calendar');
  res.send(ical);
});

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
