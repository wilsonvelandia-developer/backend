import { Pool } from 'pg';
import { Standing } from '@tournament/shared';
import { NotFoundError } from '@tournament/shared';
import {
  StandingRow, mapStandingRow,
  FinishedMatchRow,
  DEFAULT_POINTS, SET_BASED_POINTS, PointsSystem,
} from './standings.types.js';

/**
 * Standings repository.
 *
 * The recalculate operation rebuilds standings from scratch by:
 *  1. Loading all finished matches for the phase.
 *  2. For each match, computing wins/draws/losses and score/set differentials.
 *  3. Upserting one standing row per team.
 *
 * This approach is idempotent — calling it multiple times produces the same result.
 * It runs inside a transaction so partial updates are never visible.
 */
export class StandingsRepository {
  constructor(private readonly pool: Pool) {}

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Returns standings for a phase, ordered by points desc, then set/score differential.
   * Includes team name for display purposes.
   */
  async findByPhase(phaseId: string): Promise<(Standing & { teamName?: string; teamShort?: string })[]> {
    // Verify phase exists
    const phaseCheck = await this.pool.query(`SELECT id FROM phases WHERE id = $1`, [phaseId]);
    if (phaseCheck.rowCount === 0) throw new NotFoundError('Phase', phaseId);

    const result = await this.pool.query<StandingRow>(
      `SELECT s.*, t.name AS team_name, t.short_name AS team_short
       FROM standings s
       JOIN teams t ON t.id = s.team_id
       WHERE s.phase_id = $1
       ORDER BY
         s.points DESC,
         (s.sets_won - s.sets_lost) DESC,
         (s.score_for - s.score_against) DESC,
         t.name ASC`,
      [phaseId],
    );
    return result.rows.map(mapStandingRow);
  }

  // ── Recalculate ───────────────────────────────────────────────────────────

  /**
   * Rebuilds all standings for a phase from scratch.
   * Called after any match result changes.
   *
   * Algorithm:
   *  1. Load all teams in the phase's tournament.
   *  2. Load all finished matches for the phase with aggregated scores and sets.
   *  3. Determine points system from the sport's hasSets flag.
   *  4. Calculate standings for each team.
   *  5. Upsert standings in a transaction.
   */
  async recalculate(phaseId: string): Promise<(Standing & { teamName?: string })[]> {
    // Load sport rules for this phase
    const sportResult = await this.pool.query<{
      has_sets: boolean;
      tournament_id: string;
    }>(
      `SELECT s.has_sets, t.id AS tournament_id
       FROM phases ph
       JOIN tournaments t ON t.id = ph.tournament_id
       JOIN sports s ON s.id = t.sport_id
       WHERE ph.id = $1`,
      [phaseId],
    );
    if (sportResult.rowCount === 0) throw new NotFoundError('Phase', phaseId);

    const { has_sets, tournament_id } = sportResult.rows[0];
    const pts: PointsSystem = has_sets ? SET_BASED_POINTS : DEFAULT_POINTS;

    // Load all teams in the tournament
    const teamsResult = await this.pool.query<{ id: string }>(
      `SELECT id FROM teams WHERE tournament_id = $1`,
      [tournament_id],
    );
    const teamIds = teamsResult.rows.map((r) => r.id);
    if (teamIds.length === 0) return [];

    // Load all finished matches with per-team aggregated scores and sets
    const matchesResult = await this.pool.query<FinishedMatchRow>(
      `SELECT
         m.id,
         m.home_team_id,
         m.away_team_id,
         m.winner_id,
         m.phase_id,
         COALESCE(SUM(mp.home_score), 0)::int AS home_total,
         COALESCE(SUM(mp.away_score), 0)::int AS away_total,
         COALESCE(SUM(CASE WHEN mp.home_score > mp.away_score THEN 1 ELSE 0 END), 0)::int AS home_sets,
         COALESCE(SUM(CASE WHEN mp.away_score > mp.home_score THEN 1 ELSE 0 END), 0)::int AS away_sets
       FROM matches m
       LEFT JOIN match_periods mp ON mp.match_id = m.id AND mp.status = 'finished'
       WHERE m.phase_id = $1 AND m.status = 'finished'
       GROUP BY m.id`,
      [phaseId],
    );

    // Build standings map: teamId → accumulated stats
    const statsMap = new Map<string, {
      played: number; wins: number; draws: number; losses: number; points: number;
      setsWon: number; setsLost: number; scoreFor: number; scoreAgainst: number;
    }>();

    for (const tid of teamIds) {
      statsMap.set(tid, {
        played: 0, wins: 0, draws: 0, losses: 0, points: 0,
        setsWon: 0, setsLost: 0, scoreFor: 0, scoreAgainst: 0,
      });
    }

    for (const match of matchesResult.rows) {
      const home = statsMap.get(match.home_team_id);
      const away = statsMap.get(match.away_team_id);
      if (!home || !away) continue;

      home.played++;
      away.played++;
      home.setsWon   += match.home_sets;
      home.setsLost  += match.away_sets;
      away.setsWon   += match.away_sets;
      away.setsLost  += match.home_sets;
      home.scoreFor      += match.home_total;
      home.scoreAgainst  += match.away_total;
      away.scoreFor      += match.away_total;
      away.scoreAgainst  += match.home_total;

      if (match.winner_id === match.home_team_id) {
        home.wins++; home.points += pts.win;
        away.losses++; away.points += pts.loss;
      } else if (match.winner_id === match.away_team_id) {
        away.wins++; away.points += pts.win;
        home.losses++; home.points += pts.loss;
      } else {
        // Draw (winner_id is null)
        home.draws++; home.points += pts.draw;
        away.draws++; away.points += pts.draw;
      }
    }

    // Upsert all standings in a transaction
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const [teamId, stats] of statsMap) {
        await client.query(
          `INSERT INTO standings
             (phase_id, team_id, played, wins, draws, losses, points,
              sets_won, sets_lost, score_for, score_against, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
           ON CONFLICT (phase_id, team_id) DO UPDATE SET
             played        = EXCLUDED.played,
             wins          = EXCLUDED.wins,
             draws         = EXCLUDED.draws,
             losses        = EXCLUDED.losses,
             points        = EXCLUDED.points,
             sets_won      = EXCLUDED.sets_won,
             sets_lost     = EXCLUDED.sets_lost,
             score_for     = EXCLUDED.score_for,
             score_against = EXCLUDED.score_against,
             updated_at    = NOW()`,
          [
            phaseId, teamId,
            stats.played, stats.wins, stats.draws, stats.losses, stats.points,
            stats.setsWon, stats.setsLost, stats.scoreFor, stats.scoreAgainst,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.findByPhase(phaseId);
  }
}
