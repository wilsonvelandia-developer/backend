import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { ForbiddenError } from '@tournament/shared';
import { config } from '../config.js';

const pool = new Pool({ connectionString: config.db.connectionString });

/**
 * Tournament Lifecycle Rules — enforces restrictions based on tournament status.
 *
 * Rules:
 *  - FINISHED tournaments: ALL writes are blocked (read-only mode)
 *  - ARCHIVED tournaments: not accessible at all (404)
 *  - ACTIVE tournaments: enrollment blocked (unless before deadline)
 *  - Player changes: blocked after deadline date OR after max matchday
 *
 * This middleware extracts the tournament context from the request URL
 * and applies the appropriate restrictions.
 */

interface TournamentRules {
  id: string;
  status: string;
  registration_deadline: string | null;
  enrollment_closed_at: string | null;
  player_change_deadline: string | null;
  player_change_max_matchday: number | null;
  archive_after_days: number | null;
  updated_at: string;
}

/**
 * Extracts tournament ID from various URL patterns.
 */
function extractTournamentId(url: string): string | null {
  // /api/tournaments/:id/...
  const tournMatch = url.match(/\/(?:api|public)\/tournaments\/([0-9a-f-]{36})/i);
  if (tournMatch) return tournMatch[1];
  return null;
}

/**
 * Extracts team ID from URL to resolve tournament.
 */
function extractTeamId(url: string): string | null {
  const teamMatch = url.match(/\/(?:api|public)\/teams\/([0-9a-f-]{36})/i);
  if (teamMatch) return teamMatch[1];
  return null;
}

/**
 * Checks if an action is a team enrollment (creating a new team in a tournament).
 */
function isTeamEnrollment(method: string, url: string): boolean {
  return method === 'POST' && (url.includes('/api/teams') || url.includes('/enroll'));
}

/**
 * Checks if an action is a player modification (add/update/delete player).
 */
function isPlayerAction(method: string, url: string): boolean {
  return (method === 'POST' || method === 'PUT' || method === 'DELETE') && url.includes('/players');
}

/**
 * Tournament lifecycle middleware.
 * Only applies to write operations (GET/HEAD pass through).
 */
export async function tournamentLifecycleMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  // Admin bypasses all lifecycle rules
  const roles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];
  if (roles.includes('admin')) return next();

  try {
    // Resolve tournament from URL
    let tournamentId = extractTournamentId(req.originalUrl);

    // If acting on a team, resolve its tournament
    if (!tournamentId) {
      const teamId = extractTeamId(req.originalUrl);
      if (teamId) {
        const teamResult = await pool.query<{ tournament_id: string }>(
          `SELECT tournament_id FROM teams WHERE id = $1`,
          [teamId],
        );
        if (teamResult.rowCount && teamResult.rowCount > 0) {
          tournamentId = teamResult.rows[0].tournament_id;
        }
      }
    }

    if (!tournamentId) return next(); // Can't determine tournament — allow

    // Load tournament rules
    const result = await pool.query<TournamentRules>(
      `SELECT id, status, registration_deadline, enrollment_closed_at,
              player_change_deadline, player_change_max_matchday,
              archive_after_days, updated_at
       FROM tournaments WHERE id = $1`,
      [tournamentId],
    );

    if (result.rowCount === 0) return next();
    const tournament = result.rows[0];

    // ── Rule 1: FINISHED/ARCHIVED tournaments are READ-ONLY ──────────────
    if (tournament.status === 'finished' || tournament.status === 'archived') {
      return next(new ForbiddenError(
        'Este torneo está finalizado. No se permiten modificaciones.',
      ));
    }

    if (tournament.status === 'cancelled') {
      return next(new ForbiddenError(
        'Este torneo fue cancelado. No se permiten modificaciones.',
      ));
    }

    // ── Rule 2: ACTIVE tournament — enrollment closed ────────────────────
    if (tournament.status === 'active' && isTeamEnrollment(method, req.originalUrl)) {
      // Check if enrollment is explicitly closed
      if (tournament.enrollment_closed_at) {
        return next(new ForbiddenError(
          'La inscripción de equipos está cerrada para este torneo.',
        ));
      }
      // Check if past registration deadline
      if (tournament.registration_deadline && new Date(tournament.registration_deadline) < new Date()) {
        return next(new ForbiddenError(
          'El plazo de inscripción de equipos ya venció.',
        ));
      }
    }

    // ── Rule 3: Player changes — check deadline and matchday ─────────────
    if (tournament.status === 'active' && isPlayerAction(method, req.originalUrl)) {
      // Check absolute deadline
      if (tournament.player_change_deadline && new Date(tournament.player_change_deadline) < new Date()) {
        return next(new ForbiddenError(
          'El plazo para agregar o cambiar jugadores ya venció.',
        ));
      }

      // Check matchday limit
      if (tournament.player_change_max_matchday) {
        const matchdayResult = await pool.query<{ max_matchday: string }>(
          `SELECT COUNT(DISTINCT m.scheduled_at::date)::int AS max_matchday
           FROM matches m
           JOIN phases p ON p.id = m.phase_id
           WHERE p.tournament_id = $1 AND m.status = 'finished'`,
          [tournamentId],
        );
        const playedDays = parseInt(matchdayResult.rows[0]?.max_matchday ?? '0', 10);
        if (playedDays >= tournament.player_change_max_matchday) {
          return next(new ForbiddenError(
            `Ya se jugaron ${playedDays} jornadas. El límite para cambios de jugadores es de ${tournament.player_change_max_matchday} jornadas.`,
          ));
        }
      }
    }

    next();
  } catch {
    // Non-critical: if lifecycle check fails, allow the request
    next();
  }
}
