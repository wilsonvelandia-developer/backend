import { Pool } from 'pg';

/**
 * Scheduling Validator — prevents conflicts when creating or updating matches.
 *
 * Validates:
 *  1. Court conflicts: no two matches on the same court at overlapping times
 *  2. Team rest: a team must wait min_rest_between_matches minutes between games (if enabled)
 *  3. Referee conflicts: a referee cannot be assigned to two simultaneous matches
 */

export interface SchedulingConfig {
  enableRestValidation:     boolean;
  minRestBetweenMatches:    number | null; // minutes
  matchDurationMinutes:     number;
}

export interface MatchTimeSlot {
  matchId?:      string;   // null for new matches
  venueCourtId:  string | null;
  scheduledAt:   string;   // ISO datetime
  homeTeamId:    string;
  awayTeamId:    string;
  durationMin:   number;
}

export class SchedulingValidator {
  constructor(private readonly pool: Pool) {}

  /**
   * Validates that a new match does not conflict with existing matches.
   * Checks court availability and team rest time.
   *
   * @param tournamentId - Tournament for loading config
   * @param match - The proposed match time slot
   * @param excludeMatchId - Exclude this match from checks (for updates)
   * @returns Array of conflict descriptions (empty = no conflicts)
   */
  async validate(
    tournamentId: string,
    match: MatchTimeSlot,
    excludeMatchId?: string,
  ): Promise<string[]> {
    const conflicts: string[] = [];

    if (!match.scheduledAt) return conflicts; // unscheduled matches can't conflict

    // Load tournament config
    const configResult = await this.pool.query<{
      enable_rest_validation: boolean;
      min_rest_between_matches: number | null;
      match_duration_minutes: number;
    }>(
      `SELECT enable_rest_validation, min_rest_between_matches, match_duration_minutes
       FROM tournaments WHERE id = $1`,
      [tournamentId],
    );
    if (configResult.rowCount === 0) return conflicts;
    const cfg = configResult.rows[0];

    const startTime = new Date(match.scheduledAt);
    const endTime = new Date(startTime.getTime() + (match.durationMin || cfg.match_duration_minutes) * 60000);
    const excludeCondition = excludeMatchId ? `AND m.id != '${excludeMatchId}'` : '';

    // 1. Court conflict check
    if (match.venueCourtId) {
      const courtConflict = await this.pool.query<{ id: string; scheduled_at: Date }>(
        `SELECT m.id, m.scheduled_at FROM matches m
         WHERE m.venue_court_id = $1
           AND m.status != 'finished'
           AND m.scheduled_at IS NOT NULL
           AND m.scheduled_at < $3
           AND (m.scheduled_at + ($4 || ' minutes')::interval) > $2
           ${excludeCondition}
         LIMIT 1`,
        [match.venueCourtId, startTime, endTime, cfg.match_duration_minutes],
      );
      if ((courtConflict.rowCount ?? 0) > 0) {
        conflicts.push(
          `Conflicto de cancha: ya hay un partido programado en este espacio en el horario ${startTime.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`,
        );
      }
    }

    // 2. Team rest check (if enabled)
    if (cfg.enable_rest_validation && cfg.min_rest_between_matches && cfg.min_rest_between_matches > 0) {
      const restMs = cfg.min_rest_between_matches * 60000;
      const windowStart = new Date(startTime.getTime() - restMs);
      const windowEnd   = new Date(endTime.getTime() + restMs);

      for (const teamId of [match.homeTeamId, match.awayTeamId]) {
        const teamConflict = await this.pool.query<{ id: string; scheduled_at: Date }>(
          `SELECT m.id, m.scheduled_at FROM matches m
           WHERE (m.home_team_id = $1 OR m.away_team_id = $1)
             AND m.status != 'finished'
             AND m.scheduled_at IS NOT NULL
             AND m.scheduled_at BETWEEN $2 AND $3
             ${excludeCondition}
           LIMIT 1`,
          [teamId, windowStart, windowEnd],
        );
        if ((teamConflict.rowCount ?? 0) > 0) {
          conflicts.push(
            `Descanso insuficiente: el equipo tiene otro partido dentro de los ${cfg.min_rest_between_matches} minutos de descanso mínimo`,
          );
          break; // One conflict is enough
        }
      }
    }

    return conflicts;
  }

  /**
   * Validates referee availability — no concurrent match assignments.
   */
  async validateRefereeAvailability(
    refereeId: string,
    scheduledAt: string,
    durationMinutes: number,
    excludeMatchId?: string,
  ): Promise<string | null> {
    if (!scheduledAt) return null;

    const startTime = new Date(scheduledAt);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    const excludeCondition = excludeMatchId ? `AND m.id != '${excludeMatchId}'` : '';

    const conflict = await this.pool.query<{ id: string }>(
      `SELECT m.id FROM matches m
       JOIN match_referees mr ON mr.match_id = m.id
       WHERE mr.user_id = $1
         AND m.status != 'finished'
         AND m.scheduled_at IS NOT NULL
         AND m.scheduled_at < $3
         AND (m.scheduled_at + ($4 || ' minutes')::interval) > $2
         ${excludeCondition}
       LIMIT 1`,
      [refereeId, startTime, endTime, durationMinutes],
    );

    if ((conflict.rowCount ?? 0) > 0) {
      return 'El árbitro ya tiene otro partido asignado en este horario';
    }
    return null;
  }
}
