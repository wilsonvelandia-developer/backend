import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { ForbiddenError } from '@tournament/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Authorization middleware.
 *
 * Validates that the authenticated user has permission to perform
 * the requested action based on their roles and ownership of resources.
 *
 * Runs AFTER authMiddleware (req.user is guaranteed to exist).
 *
 * Strategy:
 *  - admin: always allowed (full access)
 *  - read-only roles (player, parent, companion): blocked on ALL write ops
 *  - observer: blocked on writes EXCEPT observations endpoints
 *  - organizer: allowed only on resources within their own tournaments
 *  - team roles (coach, president, etc.): allowed on their own teams only
 *  - referee: allowed on match operations within their assigned tournaments
 */

const pool = new Pool({ connectionString: config.db.connectionString });

/** Read-only roles cannot perform write operations (except specific exceptions). */
const READ_ONLY_ROLES = ['player', 'parent', 'companion'];

/** Roles that can manage match events (scoring, sanctions, substitutions). */
const MATCH_MGMT_ROLES = ['admin', 'referee'];

/** Roles that can manage teams/players. */
const TEAM_MGMT_ROLES = ['admin', 'organizer', 'coach', 'assistant', 'delegate', 'fitness_coach', 'coordinator', 'president'];

interface JwtUser {
  sub:   string;
  roles: string[];
}

function getUserFromReq(req: Request): JwtUser | null {
  const user = req.user as unknown as { sub?: string; roles?: string[]; role?: string } | undefined;
  if (!user?.sub) return null;

  let roles: string[] = [];
  if (Array.isArray(user.roles) && user.roles.length > 0) {
    roles = user.roles;
  } else if (user.role) {
    roles = [user.role];
  }

  if (roles.length === 0) return null;
  return { sub: user.sub, roles };
}

function isAdmin(roles: string[]): boolean {
  return roles.includes('admin');
}

function isReadOnly(roles: string[]): boolean {
  return roles.every((r) => READ_ONLY_ROLES.includes(r) || r === 'observer');
}

function hasAnyRole(userRoles: string[], allowed: string[]): boolean {
  return userRoles.some((r) => allowed.includes(r));
}

// ── DB Helpers ──────────────────────────────────────────────────────────────

/**
 * Checks if a user is staff (organizer/referee/observer) in a specific tournament.
 */
async function isStaffOfTournament(userId: string, tournamentId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM tournament_staff WHERE user_id = $1 AND tournament_id = $2 LIMIT 1`,
    [userId, tournamentId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Checks if a user is staff with a specific role in a tournament.
 */
async function isStaffWithRole(userId: string, tournamentId: string, staffRole: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM tournament_staff WHERE user_id = $1 AND tournament_id = $2 AND staff_role = $3 LIMIT 1`,
    [userId, tournamentId, staffRole],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Checks if a user is a member of a specific team.
 */
async function isMemberOfTeam(userId: string, teamId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = $2 AND is_active = true LIMIT 1`,
    [userId, teamId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Gets the tournament_id that owns a team.
 */
async function getTournamentOfTeam(teamId: string): Promise<string | null> {
  const result = await pool.query<{ tournament_id: string }>(
    `SELECT tournament_id FROM teams WHERE id = $1`,
    [teamId],
  );
  return result.rowCount === 0 ? null : result.rows[0].tournament_id;
}

/**
 * Extracts tournament ID from a match ID (match → phase → tournament).
 */
async function getTournamentOfMatch(matchId: string): Promise<string | null> {
  const result = await pool.query<{ tournament_id: string }>(
    `SELECT t.id AS tournament_id
     FROM matches m
     JOIN phases p ON p.id = m.phase_id
     JOIN tournaments t ON t.id = p.tournament_id
     WHERE m.id = $1`,
    [matchId],
  );
  return result.rowCount === 0 ? null : result.rows[0].tournament_id;
}

/**
 * Extracts tournament ID from a URL containing /tournaments/:id.
 */
function extractTournamentIdFromUrl(url: string): string | null {
  const match = url.match(/\/(?:api\/)?tournaments\/([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

/**
 * Extracts match ID from a URL containing /matches/:id.
 */
function extractMatchIdFromUrl(url: string): string | null {
  const match = url.match(/\/(?:api\/)?matches\/([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

/**
 * Gets all tournament IDs where a user is staff of any role.
 */
async function getUserTournamentIds(userId: string): Promise<string[]> {
  const result = await pool.query<{ tournament_id: string }>(
    `SELECT DISTINCT tournament_id FROM tournament_staff WHERE user_id = $1`,
    [userId],
  );
  return result.rows.map((r) => r.tournament_id);
}

/**
 * Gets all team IDs where a user is a member.
 */
async function getUserTeamIds(userId: string): Promise<string[]> {
  const result = await pool.query<{ team_id: string }>(
    `SELECT DISTINCT team_id FROM team_members WHERE user_id = $1 AND is_active = true`,
    [userId],
  );
  return result.rows.map((r) => r.team_id);
}

// ─── Exported middleware ────────────────────────────────────────────────────

/**
 * Blocks write operations for read-only roles.
 * Exception: observer can POST to /observations endpoints.
 */
export function blockReadOnlyWrites(req: Request, _res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const user = getUserFromReq(req);
  if (!user) return next();
  if (isAdmin(user.roles)) return next();

  // Observer exception: can POST observations
  if (user.roles.includes('observer') && req.originalUrl.includes('/observations')) {
    return next();
  }

  if (isReadOnly(user.roles)) {
    return next(new ForbiddenError('Tu perfil no tiene permisos para realizar esta acción'));
  }

  next();
}

/**
 * For tournament write operations: only admin or organizer-of-that-tournament.
 * Organizers can only modify tournaments they are staff of.
 */
export function authorizeTournamentWrite(req: Request, _res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return next();

  const user = getUserFromReq(req);
  if (!user) return next();
  if (isAdmin(user.roles)) return next();

  if (!user.roles.includes('organizer')) {
    return next(new ForbiddenError('Solo organizadores pueden modificar torneos'));
  }

  // Extract tournament ID from URL
  const tournamentId = extractTournamentIdFromUrl(req.originalUrl);

  if (!tournamentId) {
    // POST /tournaments — creating a new tournament: organizers allowed
    // The new tournament will be automatically linked to them as staff
    return next();
  }

  // Verify the organizer is staff of this specific tournament
  isStaffOfTournament(user.sub, tournamentId)
    .then((isStaff) => {
      if (!isStaff) {
        return next(new ForbiddenError('No tienes permisos sobre este torneo'));
      }
      next();
    })
    .catch((err) => {
      logger.error({ err, userId: user.sub, tournamentId }, 'Tournament authorization check failed');
      next(err);
    });
}

/**
 * For team/player write operations: admin, organizer-of-tournament, or team-member.
 */
export function authorizeTeamWrite(req: Request, _res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return next();

  const user = getUserFromReq(req);
  if (!user) return next();
  if (isAdmin(user.roles)) return next();

  if (!hasAnyRole(user.roles, TEAM_MGMT_ROLES)) {
    return next(new ForbiddenError('Tu perfil no puede gestionar equipos'));
  }

  // Extract team ID from URL: /api/teams/:id or /api/teams/:id/players/...
  const teamMatch = req.originalUrl.match(/\/api\/teams\/([0-9a-f-]{36})/i);
  if (!teamMatch) {
    // Creating a new team — organizers can create in their tournaments
    if (user.roles.includes('organizer')) return next();
    return next(new ForbiddenError('Solo organizadores pueden crear equipos'));
  }

  const teamId = teamMatch[1];

  // Verify ownership: user is member of team OR organizer/staff of tournament
  Promise.all([
    isMemberOfTeam(user.sub, teamId),
    getTournamentOfTeam(teamId).then((tid) => tid ? isStaffOfTournament(user.sub, tid) : false),
  ])
    .then(([isMember, isOrgOfTournament]) => {
      if (!isMember && !isOrgOfTournament) {
        return next(new ForbiddenError('No tienes permisos sobre este equipo'));
      }
      next();
    })
    .catch((err) => {
      logger.error({ err, userId: user.sub, teamId }, 'Team authorization check failed');
      next(err);
    });
}

/**
 * For match write operations: admin, referee-of-tournament, or organizer-of-tournament.
 * Referees can only manage matches in tournaments where they are assigned as referee staff.
 */
export function authorizeMatchWrite(req: Request, _res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return next();

  const user = getUserFromReq(req);
  if (!user) return next();
  if (isAdmin(user.roles)) return next();

  if (!hasAnyRole(user.roles, [...MATCH_MGMT_ROLES, 'organizer'])) {
    return next(new ForbiddenError('Tu perfil no puede gestionar partidos'));
  }

  // Extract match ID from URL
  const matchId = extractMatchIdFromUrl(req.originalUrl);

  if (!matchId) {
    // POST /matches — scheduling: organizers can create
    if (user.roles.includes('organizer')) return next();
    return next(new ForbiddenError('Solo organizadores pueden programar partidos'));
  }

  // Verify the user is staff of the tournament that owns this match
  getTournamentOfMatch(matchId)
    .then(async (tournamentId) => {
      if (!tournamentId) {
        return next(new ForbiddenError('Partido no encontrado'));
      }

      // Referees must be assigned as referee staff in this tournament
      if (user.roles.includes('referee') && !user.roles.includes('organizer')) {
        const isRefStaff = await isStaffWithRole(user.sub, tournamentId, 'referee');
        if (!isRefStaff) {
          return next(new ForbiddenError('No estás asignado como árbitro en este torneo'));
        }
        return next();
      }

      // Organizers must be staff of this tournament
      if (user.roles.includes('organizer')) {
        const isStaff = await isStaffOfTournament(user.sub, tournamentId);
        if (!isStaff) {
          return next(new ForbiddenError('No tienes permisos sobre este torneo'));
        }
        return next();
      }

      next();
    })
    .catch((err) => {
      logger.error({ err, userId: user.sub, matchId }, 'Match authorization check failed');
      next(err);
    });
}

/**
 * Middleware that injects user context headers for downstream response filtering.
 * Downstream services can use these headers to filter sensitive data.
 */
export function injectOwnershipContext(req: Request, _res: Response, next: NextFunction): void {
  const user = getUserFromReq(req);
  if (!user) return next();

  // For team-bound roles, load their team IDs and tournament IDs
  // and inject as headers so downstream services can filter responses
  const roles = user.roles;
  const isTeamBound = roles.some((r) =>
    ['coach', 'assistant', 'delegate', 'fitness_coach', 'coordinator', 'president', 'player', 'parent'].includes(r),
  );

  if (isAdmin(roles) || roles.includes('organizer')) {
    // Admin and organizers see everything (organizer filtering is at write-level)
    return next();
  }

  if (isTeamBound) {
    // Load user's team IDs and set header for downstream filtering
    Promise.all([
      getUserTeamIds(user.sub),
      getUserTournamentIds(user.sub),
    ])
      .then(([teamIds, tournamentIds]) => {
        if (teamIds.length > 0) {
          req.headers['x-user-team-ids'] = JSON.stringify(teamIds);
        }
        if (tournamentIds.length > 0) {
          req.headers['x-user-tournament-ids'] = JSON.stringify(tournamentIds);
        }
        next();
      })
      .catch(() => next()); // Non-critical: proceed without filtering
  } else {
    next();
  }
}
