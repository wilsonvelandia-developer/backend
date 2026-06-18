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

  // ── Group standings ─────────────────────────────────────────────────────────

  /**
   * Returns standings per group for a tournament.
   * Groups come from team_groups table.
   * Calculates from finished matches in the "Fase de Grupos" phase.
   * If no matches exist, returns teams with all zeros.
   */
  async getByGroups(tournamentId: string): Promise<Array<{
    groupName: string;
    standings: Array<{
      teamId: string; teamName: string; teamShort: string | null;
      played: number; wins: number; draws: number; losses: number;
      points: number; scoreFor: number; scoreAgainst: number;
      scoreDiff: number; setsWon: number; setsLost: number;
      fairPlayScore: number;
    }>;
  }>> {
    // Load tournament config
    const tResult = await this.pool.query<{
      points_config: { win: number; draw: number; loss: number };
      tiebreaker_criteria: string[];
      initial_fair_play_score: number;
    }>(
      `SELECT points_config, tiebreaker_criteria, initial_fair_play_score FROM tournaments WHERE id = $1`,
      [tournamentId],
    );
    if (tResult.rowCount === 0) throw new NotFoundError('Tournament', tournamentId);
    const { points_config, tiebreaker_criteria, initial_fair_play_score } = tResult.rows[0];

    // Load groups with team info
    const groupsResult = await this.pool.query<{
      team_id: string; team_name: string; team_short: string | null; group_name: string;
    }>(
      `SELECT tg.team_id, t.name AS team_name, t.short_name AS team_short, tg.group_name
       FROM team_groups tg
       JOIN teams t ON t.id = tg.team_id
       WHERE tg.tournament_id = $1
       ORDER BY tg.group_name, tg.draw_order`,
      [tournamentId],
    );

    if (groupsResult.rowCount === 0) return [];

    // Load "Fase de Grupos" phase matches
    const phaseResult = await this.pool.query<{ id: string }>(
      `SELECT id FROM phases WHERE tournament_id = $1 AND name = 'Fase de Grupos' LIMIT 1`,
      [tournamentId],
    );

    let finishedMatches: Array<{ home_team_id: string; away_team_id: string; winner_id: string | null;
      home_total: number; away_total: number; home_sets: number; away_sets: number }> = [];

    if (phaseResult.rowCount && phaseResult.rowCount > 0) {
      const matchesResult = await this.pool.query<{
        home_team_id: string; away_team_id: string; winner_id: string | null;
        home_total: number; away_total: number; home_sets: number; away_sets: number;
      }>(
        `SELECT m.home_team_id, m.away_team_id, m.winner_id,
                COALESCE(SUM(mp.home_score), 0)::int AS home_total,
                COALESCE(SUM(mp.away_score), 0)::int AS away_total,
                COALESCE(SUM(CASE WHEN mp.home_score > mp.away_score THEN 1 ELSE 0 END), 0)::int AS home_sets,
                COALESCE(SUM(CASE WHEN mp.away_score > mp.home_score THEN 1 ELSE 0 END), 0)::int AS away_sets
         FROM matches m
         LEFT JOIN match_periods mp ON mp.match_id = m.id AND mp.status = 'finished'
         WHERE m.phase_id = $1 AND m.status = 'finished'
         GROUP BY m.id`,
        [phaseResult.rows[0].id],
      );
      finishedMatches = matchesResult.rows;
    }

    // Load sanctions for fair play
    const sanctionsResult = await this.pool.query<{ team_id: string; total_effect: number }>(
      `SELECT ms.team_id, SUM(st.points_effect)::int AS total_effect
       FROM match_sanctions ms
       JOIN sanction_types st ON st.id = ms.sanction_type_id
       JOIN matches m ON m.id = ms.match_id
       JOIN phases p ON p.id = m.phase_id
       WHERE p.tournament_id = $1
       GROUP BY ms.team_id`,
      [tournamentId],
    );
    const sanctionMap = new Map<string, number>();
    sanctionsResult.rows.forEach((r) => sanctionMap.set(r.team_id, r.total_effect));

    // Build standings per group
    const groupMap = new Map<string, Array<typeof groupsResult.rows[0]>>();
    groupsResult.rows.forEach((r) => {
      if (!groupMap.has(r.group_name)) groupMap.set(r.group_name, []);
      groupMap.get(r.group_name)!.push(r);
    });

    const result: Array<{ groupName: string; standings: Array<Record<string, unknown>> }> = [];

    for (const [groupName, teams] of groupMap) {
      const teamIds = new Set(teams.map((t) => t.team_id));

      // Calculate stats for each team in the group
      const statsMap = new Map<string, {
        played: number; wins: number; draws: number; losses: number; points: number;
        scoreFor: number; scoreAgainst: number; setsWon: number; setsLost: number;
      }>();

      teams.forEach((t) => statsMap.set(t.team_id, {
        played: 0, wins: 0, draws: 0, losses: 0, points: 0,
        scoreFor: 0, scoreAgainst: 0, setsWon: 0, setsLost: 0,
      }));

      // Only count matches between teams in this group
      for (const match of finishedMatches) {
        if (!teamIds.has(match.home_team_id) || !teamIds.has(match.away_team_id)) continue;

        const home = statsMap.get(match.home_team_id)!;
        const away = statsMap.get(match.away_team_id)!;

        home.played++; away.played++;
        home.scoreFor += match.home_total; home.scoreAgainst += match.away_total;
        away.scoreFor += match.away_total; away.scoreAgainst += match.home_total;
        home.setsWon += match.home_sets; home.setsLost += match.away_sets;
        away.setsWon += match.away_sets; away.setsLost += match.home_sets;

        if (match.winner_id === match.home_team_id) {
          home.wins++; home.points += points_config.win;
          away.losses++; away.points += points_config.loss;
        } else if (match.winner_id === match.away_team_id) {
          away.wins++; away.points += points_config.win;
          home.losses++; home.points += points_config.loss;
        } else {
          home.draws++; home.points += points_config.draw;
          away.draws++; away.points += points_config.draw;
        }
      }

      // Build sorted standings using tiebreaker criteria
      const standings = teams.map((t) => {
        const s = statsMap.get(t.team_id)!;
        const fairPlay = initial_fair_play_score + (sanctionMap.get(t.team_id) ?? 0);
        return {
          teamId:         t.team_id,
          teamName:       t.team_name,
          teamShort:      t.team_short,
          played:         s.played,
          wins:           s.wins,
          draws:          s.draws,
          losses:         s.losses,
          points:         s.points,
          scoreFor:       s.scoreFor,
          scoreAgainst:   s.scoreAgainst,
          scoreDiff:      s.scoreFor - s.scoreAgainst,
          setsWon:        s.setsWon,
          setsLost:       s.setsLost,
          fairPlayScore:  fairPlay,
        };
      });

      // Sort by tiebreaker criteria in order
      standings.sort((a, b) => {
        for (const criterion of tiebreaker_criteria) {
          let diff = 0;
          switch (criterion) {
            case 'points':          diff = b.points - a.points; break;
            case 'goal_difference': diff = b.scoreDiff - a.scoreDiff; break;
            case 'goals_for':       diff = b.scoreFor - a.scoreFor; break;
            case 'goals_against':   diff = a.scoreAgainst - b.scoreAgainst; break;
            case 'fair_play':       diff = b.fairPlayScore - a.fairPlayScore; break;
            case 'head_to_head':    diff = 0; break; // TODO: implement
            case 'draw':            diff = 0; break; // random — no auto-sort
          }
          if (diff !== 0) return diff;
        }
        return 0;
      });

      result.push({ groupName, standings: standings as unknown as Array<Record<string, unknown>> });
    }

    return result as unknown as Array<{
      groupName: string;
      standings: Array<{
        teamId: string; teamName: string; teamShort: string | null;
        played: number; wins: number; draws: number; losses: number;
        points: number; scoreFor: number; scoreAgainst: number;
        scoreDiff: number; setsWon: number; setsLost: number;
        fairPlayScore: number;
      }>;
    }>;
  }
}
