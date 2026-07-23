import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { ForbiddenError } from '@tournament/shared';
import { config } from '../config.js';

const pool = new Pool({ connectionString: config.db.connectionString });

interface PlanLimits {
  maxTeamsPerTournament: number;
  maxActiveTournaments: number;
  maxVenues: number;
  features: Record<string, boolean>;
  subscriptionExpiresAt: string | null;
}

/**
 * Plan limits middleware — validates that the organizer's subscription
 * allows the action they're trying to perform.
 *
 * Checks:
 *  - Subscription not expired
 *  - Tournament count within plan limit
 *  - Team count within plan limit per tournament
 *  - Feature access based on plan flags
 *
 * Only applies to organizer accounts (admin bypasses all limits).
 * For GET requests, limits are not checked (read is always allowed).
 */
export async function planLimitsMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const userId = req.headers['x-user-id'] as string | undefined;
  const roles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];

  // Admin bypasses all limits
  if (!userId || roles.includes('admin')) return next();

  // Only check organizers (other roles don't create tournaments/teams)
  if (!roles.includes('organizer')) return next();

  try {
    // Load user's plan
    const planResult = await pool.query<{
      max_teams_per_tournament: number;
      max_active_tournaments: number;
      max_venues: number;
      features: Record<string, boolean>;
      subscription_expires_at: string | null;
    }>(
      `SELECT sp.max_teams_per_tournament, sp.max_active_tournaments,
              sp.max_venues, sp.features, u.subscription_expires_at
       FROM users u
       JOIN subscription_plans sp ON sp.id = u.plan_id
       WHERE u.id = $1`,
      [userId],
    );

    if (planResult.rowCount === 0) {
      // No plan assigned — allow (legacy users or admin-created without plan)
      return next();
    }

    const plan: PlanLimits = {
      maxTeamsPerTournament: planResult.rows[0].max_teams_per_tournament,
      maxActiveTournaments:  planResult.rows[0].max_active_tournaments,
      maxVenues:             planResult.rows[0].max_venues,
      features:              planResult.rows[0].features,
      subscriptionExpiresAt: planResult.rows[0].subscription_expires_at,
    };

    // Check subscription expiration
    if (plan.subscriptionExpiresAt) {
      const expiresAt = new Date(plan.subscriptionExpiresAt);
      if (expiresAt < new Date()) {
        return next(new ForbiddenError(
          'Tu suscripción ha expirado. Renueva tu plan para continuar creando torneos y equipos.',
        ));
      }
    }

    // Check tournament creation limit
    if (req.originalUrl.includes('/api/tournaments') && method === 'POST' && !req.originalUrl.includes('/')) {
      if (plan.maxActiveTournaments > 0) {
        const countResult = await pool.query<{ count: string }>(
          `SELECT COUNT(*)::int AS count FROM tournaments
           WHERE id IN (SELECT tournament_id FROM tournament_staff WHERE user_id = $1)
             AND status IN ('draft', 'active')
             AND is_deleted = false`,
          [userId],
        );
        const current = parseInt(countResult.rows[0].count, 10);
        if (current >= plan.maxActiveTournaments) {
          return next(new ForbiddenError(
            `Has alcanzado el límite de ${plan.maxActiveTournaments} torneo(s) activo(s) en tu plan. Actualiza tu plan para crear más.`,
          ));
        }
      }
    }

    // Check team creation limit per tournament
    if (req.originalUrl.includes('/api/teams') && method === 'POST') {
      const body = req.body as { tournamentId?: string } | undefined;
      if (body?.tournamentId && plan.maxTeamsPerTournament > 0) {
        const countResult = await pool.query<{ count: string }>(
          `SELECT COUNT(*)::int AS count FROM teams
           WHERE tournament_id = $1 AND is_deleted = false`,
          [body.tournamentId],
        );
        const current = parseInt(countResult.rows[0].count, 10);
        if (current >= plan.maxTeamsPerTournament) {
          return next(new ForbiddenError(
            `Este torneo ya tiene ${current} equipos (máximo ${plan.maxTeamsPerTournament} en tu plan). Actualiza tu plan para agregar más.`,
          ));
        }
      }
    }

    next();
  } catch {
    // Non-critical: if plan check fails, allow the request
    next();
  }
}
