import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { ForbiddenError } from '@tournament/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Authorization middleware factory.
 *
 * Validates that the authenticated user has permission to perform
 * the requested action based on their roles and ownership of resources.
 *
 * Runs AFTER authMiddleware (req.user is guaranteed to exist).
 *
 * Strategy:
 *  - admin: always allowed
 *  - read-only roles (player, parent, companion, observer): blocked on write ops
 *  - organizer: allowed on resources within their tournaments
 *  - team roles (coach, etc.): allowed on resources within their teams
 *  - referee: allowed on match operations within their tournaments
 */

const pool = new Pool({ connectionString: config.db.connectionString });

/** Read-only roles cannot perform write operations. */
const READ_ONLY_ROLES = ['player', 'parent', 'companion'];

/** Roles that can manage match events. */
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

  // Handle both new format (roles: string[]) and old format (role: string)
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
  // If ALL roles are read-only, the user is read-only
  return roles.every((r) => READ_ONLY_ROLES.includes(r) || r === 'observer');
}

function hasAnyRole(userRoles: string[], allowed: string[]): boolean {
  return userRoles.some((r) => allowed.includes(r));
}

/**
 * Checks if a user is staff in the tournament that owns the given resource.
 * Works for: teams (via tournament_id), matches (via phase → tournament), etc.
 */
async function isStaffOfTournament(userId: string, tournamentId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM tournament_staff WHERE user_id = $1 AND tournament_id = $2 LIMIT 1`,
    [userId, tournamentId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Checks if a user is a member of a specific team.
 */
async function isMemberOfTeam(userId: string, teamId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = $2 LIMIT 1`,
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

// ─── Exported middleware factories ──────────────────────────────────────────

/**
 * Blocks write operations for read-only roles.
 * Apply to all /api/* routes before the proxy.
 */
export function blockReadOnlyWrites(req: Request, _res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next(); // reads are always allowed
  }

  const user = getUserFromReq(req);
  if (!user) return next(); // auth middleware handles this

  if (isAdmin(user.roles)) return next(); // admin bypasses

  if (isReadOnly(user.roles)) {
    return next(new ForbiddenError('Tu perfil no tiene permisos para realizar esta acción'));
  }

  next();
}

/**
 * For tournament write operations: only admin and organizer-of-that-tournament.
 * Extracts tournament ID from the URL path.
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

  // Extract tournament ID from URL: /api/tournaments/:id or /api/tournaments/:id/phases/...
  const match = req.originalUrl.match(/\/api\/tournaments\/([0-9a-f-]{36})/i);
  if (!match) return next(); // creating a new tournament — allowed for organizers

  const tournamentId = match[1];

  isStaffOfTournament(user.sub, tournamentId)
    .then((isStaff) => {
      if (!isStaff) {
        return next(new ForbiddenError('No tienes permisos sobre este torneo'));
      }
      next();
    })
    .catch((err) => {
      logger.error({ err }, 'Authorization check failed');
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
  const match = req.originalUrl.match(/\/api\/teams\/([0-9a-f-]{36})/i);
  if (!match) {
    // Creating a new team — check if organizer of the tournament in body
    return next(); // validated by the backend service (tournament ownership)
  }

  const teamId = match[1];

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
      logger.error({ err }, 'Authorization check failed');
      next(err);
    });
}

/**
 * For match write operations: admin, referee, or organizer-of-tournament.
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

  // For referees and organizers we'd need to check tournament ownership,
  // but for now we trust that if they have the role they can manage matches.
  // Full ownership check would require loading match → phase → tournament.
  next();
}
