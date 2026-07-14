import { Pool } from 'pg';

/**
 * Notifications helper — inserts notifications for tournament subscribers.
 * Subscribers are users enrolled as staff, team delegates, or players in the tournament.
 */
export class NotificationsHelper {
  constructor(private readonly pool: Pool) {}

  /**
   * Sends a notification to all users linked to a tournament.
   * Linked users: tournament staff, team delegates (via players linked to users).
   */
  async notifyTournamentUsers(
    tournamentId: string,
    type: string,
    title: string,
    body: string,
    referenceType: string,
    referenceId: string,
  ): Promise<void> {
    try {
      // Get all user IDs associated with the tournament:
      // 1. Tournament staff (organizers, referees, etc.)
      // 2. Players linked to user accounts
      const usersResult = await this.pool.query<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM (
          SELECT user_id FROM tournament_staff WHERE tournament_id = $1
          UNION
          SELECT p.user_id FROM players p
          JOIN teams t ON t.id = p.team_id
          WHERE t.tournament_id = $1 AND p.user_id IS NOT NULL
        ) AS subscribers`,
        [tournamentId],
      );

      if (usersResult.rowCount === 0) return;

      // Batch insert notifications
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const row of usersResult.rows) {
        placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        values.push(row.user_id, type, title, body, referenceType, referenceId);
      }

      await this.pool.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    } catch {
      // Non-critical — notifications failing should not break match operations
    }
  }

  /**
   * Sends a notification about a match event (score, sanction, substitution).
   */
  async notifyMatchEvent(
    matchId: string,
    eventType: string,
    description: string,
  ): Promise<void> {
    try {
      // Get tournament ID from match
      const tournamentResult = await this.pool.query<{ tournament_id: string; tournament_name: string }>(
        `SELECT t.id AS tournament_id, t.name AS tournament_name
         FROM matches m
         JOIN phases p ON p.id = m.phase_id
         JOIN tournaments t ON t.id = p.tournament_id
         WHERE m.id = $1`,
        [matchId],
      );
      if (tournamentResult.rowCount === 0) return;

      const { tournament_id, tournament_name } = tournamentResult.rows[0];

      await this.notifyTournamentUsers(
        tournament_id,
        'match_event',
        `${tournament_name} — ${eventType}`,
        description,
        'match',
        matchId,
      );
    } catch {
      // Non-critical
    }
  }
}
