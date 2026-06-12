import { Pool } from 'pg';
import { Match, Substitution, VolleyballRotationSlot } from '@tournament/shared';
import { NotFoundError, BusinessRuleError } from '@tournament/shared';
import {
  MatchRow, mapMatchRow,
  MatchPeriodRow, mapPeriodRow,
  RotationRow, mapRotationRow,
  SubstitutionRow, mapSubstitutionRow,
  SportRules, MatchDetail,
} from './matches.types.js';
import { SportRulesEngine } from './sport-rules.engine.js';
import {
  CreateMatchDto, UpdatePeriodScoreDto,
  RegisterLineupDto, RotateTeamDto,
  SubstitutionDto, ListMatchesQuery,
} from './matches.schema.js';

/**
 * Matches repository — all DB access for matches, periods, rotations and substitutions.
 * Uses transactions for multi-step operations (start match, finish match, rotation).
 */
export class MatchesRepository {
  constructor(private readonly pool: Pool) {}

  // ── Sport rules loader ────────────────────────────────────────────────────

  /**
   * Loads sport rules for the tournament that owns the given phase.
   * Used to build a SportRulesEngine for validation.
   */
  async loadSportRules(matchId: string): Promise<SportRules> {
    const result = await this.pool.query<SportRules>(
      `SELECT s.id AS "sportId", s.slug AS "sportSlug",
              s.has_sets AS "hasSets", s.sets_to_win AS "setsToWin",
              s.points_per_set AS "pointsPerSet",
              s.decisive_set_points AS "decisiveSetPoints",
              s.win_margin AS "winMargin",
              s.periods_per_match AS "periodsPerMatch",
              s.max_substitutions AS "maxSubstitutions",
              s.has_rotation AS "hasRotation"
       FROM matches m
       JOIN phases p ON p.id = m.phase_id
       JOIN tournaments t ON t.id = p.tournament_id
       JOIN sports s ON s.id = t.sport_id
       WHERE m.id = $1`,
      [matchId],
    );
    if (result.rowCount === 0) throw new NotFoundError('Match', matchId);
    return result.rows[0];
  }

  // ── Matches CRUD ──────────────────────────────────────────────────────────

  async findAll(filters: ListMatchesQuery): Promise<Match[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.phaseId) { conditions.push(`phase_id = $${idx++}`);                                   values.push(filters.phaseId); }
    if (filters.teamId)  { conditions.push(`(home_team_id = $${idx} OR away_team_id = $${idx++})`);  values.push(filters.teamId); }
    if (filters.status)  { conditions.push(`status = $${idx++}`);                                    values.push(filters.status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query<MatchRow>(
      `SELECT * FROM matches ${where} ORDER BY scheduled_at ASC NULLS LAST, created_at ASC`,
      values,
    );
    return result.rows.map(mapMatchRow);
  }

  async findById(id: string): Promise<MatchDetail> {
    const matchResult = await this.pool.query<MatchRow>(`SELECT * FROM matches WHERE id = $1`, [id]);
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', id);

    const periodsResult = await this.pool.query<MatchPeriodRow>(
      `SELECT * FROM match_periods WHERE match_id = $1 ORDER BY period_number ASC`,
      [id],
    );
    return {
      match:   mapMatchRow(matchResult.rows[0]),
      periods: periodsResult.rows.map(mapPeriodRow),
    };
  }

  async create(dto: CreateMatchDto): Promise<Match> {
    // Verify phase exists and belongs to an active tournament
    const phaseCheck = await this.pool.query(
      `SELECT ph.id, t.status AS tournament_status
       FROM phases ph JOIN tournaments t ON t.id = ph.tournament_id
       WHERE ph.id = $1`,
      [dto.phaseId],
    );
    if (phaseCheck.rowCount === 0) throw new NotFoundError('Phase', dto.phaseId);
    if (phaseCheck.rows[0].tournament_status === 'finished') {
      throw new BusinessRuleError('Cannot schedule matches in a finished tournament');
    }

    // Verify both teams belong to the same tournament as the phase
    const teamsCheck = await this.pool.query(
      `SELECT COUNT(*) as count FROM teams t
       JOIN tournaments tr ON tr.id = t.tournament_id
       JOIN phases ph ON ph.tournament_id = tr.id
       WHERE ph.id = $1 AND t.id = ANY($2::uuid[])`,
      [dto.phaseId, [dto.homeTeamId, dto.awayTeamId]],
    );
    if (parseInt((teamsCheck.rows[0] as { count: string }).count, 10) < 2) {
      throw new BusinessRuleError('Both teams must belong to the tournament of the given phase');
    }

    const result = await this.pool.query<MatchRow>(
      `INSERT INTO matches (phase_id, home_team_id, away_team_id, scheduled_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [dto.phaseId, dto.homeTeamId, dto.awayTeamId, dto.scheduledAt],
    );
    return mapMatchRow(result.rows[0]);
  }

  // ── Match lifecycle ───────────────────────────────────────────────────────

  /**
   * Starts a match: sets status to 'in_progress' and creates all period rows.
   * Period count is determined by the sport rules.
   */
  async startMatch(id: string): Promise<MatchDetail> {
    const matchResult = await this.pool.query<MatchRow>(`SELECT * FROM matches WHERE id = $1`, [id]);
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', id);

    const match = matchResult.rows[0];
    if (match.status !== 'scheduled') {
      throw new BusinessRuleError(`Cannot start a match with status '${match.status}'`);
    }

    const rules = await this.loadSportRules(id);
    const engine = new SportRulesEngine(rules);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE matches SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
        [id],
      );

      // Create one period row per max possible period (all start as 'pending')
      const maxP = engine.maxPeriods();
      for (let i = 1; i <= maxP; i++) {
        await client.query(
          `INSERT INTO match_periods (match_id, period_number, status)
           VALUES ($1, $2, $3)
           ON CONFLICT (match_id, period_number) DO NOTHING`,
          [id, i, i === 1 ? 'in_progress' : 'pending'],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.findById(id);
  }

  // ── Score update ──────────────────────────────────────────────────────────

  /**
   * Updates the score of a specific period.
   * Validates score against sport rules.
   * Automatically marks period as 'finished' when a set winner is determined.
   */
  async updatePeriodScore(
    matchId: string,
    periodNumber: number,
    dto: UpdatePeriodScoreDto,
  ): Promise<MatchDetail> {
    const matchResult = await this.pool.query<MatchRow>(`SELECT * FROM matches WHERE id = $1`, [matchId]);
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', matchId);
    if (matchResult.rows[0].status !== 'in_progress') {
      throw new BusinessRuleError('Can only update scores for in_progress matches');
    }

    const periodResult = await this.pool.query<MatchPeriodRow>(
      `SELECT * FROM match_periods WHERE match_id = $1 AND period_number = $2`,
      [matchId, periodNumber],
    );
    if (periodResult.rowCount === 0) throw new NotFoundError('Period', String(periodNumber));
    if (periodResult.rows[0].status === 'finished') {
      throw new BusinessRuleError(`Period ${periodNumber} is already finished`);
    }

    const rules = await this.loadSportRules(matchId);
    const engine = new SportRulesEngine(rules);

    // Validate the score against sport rules
    engine.validatePeriodScore(periodNumber, dto.homeScore, dto.awayScore);

    // Determine if this period is now finished
    const periodWinner = engine.periodWinner(periodNumber, dto.homeScore, dto.awayScore);
    const periodStatus = periodWinner !== null ? 'finished' : 'in_progress';

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE match_periods
         SET home_score = $1, away_score = $2, status = $3
         WHERE match_id = $4 AND period_number = $5`,
        [dto.homeScore, dto.awayScore, periodStatus, matchId, periodNumber],
      );

      // If the set finished, activate the next set
      if (periodStatus === 'finished') {
        await client.query(
          `UPDATE match_periods SET status = 'in_progress'
           WHERE match_id = $1 AND period_number = $2 AND status = 'pending'`,
          [matchId, periodNumber + 1],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.findById(matchId);
  }

  // ── Finish match ──────────────────────────────────────────────────────────

  /**
   * Finishes a match and computes the winner.
   * Notifies the caller so standings can be recalculated.
   */
  async finishMatch(id: string): Promise<MatchDetail> {
    const rules = await this.loadSportRules(id);
    const engine = new SportRulesEngine(rules);

    const { match, periods } = await this.findById(id);
    if (match.status !== 'in_progress') {
      throw new BusinessRuleError(`Cannot finish a match with status '${match.status}'`);
    }

    const rawPeriods = periods.map((p) => ({
      id: p.id, match_id: p.matchId, period_number: p.periodNumber,
      home_score: p.homeScore, away_score: p.awayScore, status: p.status,
    } as MatchPeriodRow));

    const winner = engine.matchWinner(match.homeTeamId, match.awayTeamId, rawPeriods);
    const winnerId = (winner === 'draw' || winner === null) ? null : winner;

    await this.pool.query(
      `UPDATE matches SET status = 'finished', winner_id = $1, updated_at = NOW() WHERE id = $2`,
      [winnerId, id],
    );

    // Mark all pending periods as finished
    await this.pool.query(
      `UPDATE match_periods SET status = 'finished' WHERE match_id = $1 AND status != 'finished'`,
      [id],
    );

    return this.findById(id);
  }

  // ── Volleyball lineup & rotation ──────────────────────────────────────────

  async registerLineup(matchId: string, dto: RegisterLineupDto): Promise<VolleyballRotationSlot[]> {
    const rules = await this.loadSportRules(matchId);
    if (!rules.hasRotation) {
      throw new BusinessRuleError(`Lineup registration only applies to sports with rotation (e.g. volleyball)`);
    }

    // Verify match is in_progress
    const matchResult = await this.pool.query<MatchRow>(`SELECT status FROM matches WHERE id = $1`, [matchId]);
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', matchId);
    if (matchResult.rows[0].status !== 'in_progress') {
      throw new BusinessRuleError('Match must be in_progress to register a lineup');
    }

    // Verify all players belong to the given team
    const playerIds = dto.lineup.map((s) => s.playerId);
    const playerCheck = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM players WHERE id = ANY($1::uuid[]) AND team_id = $2`,
      [playerIds, dto.teamId],
    );
    if (parseInt(playerCheck.rows[0].count, 10) !== 6) {
      throw new BusinessRuleError('All 6 players must belong to the specified team');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing lineup for this team/set if any (allows re-registration)
      await client.query(
        `DELETE FROM volleyball_rotations WHERE match_id = $1 AND team_id = $2 AND set_number = $3`,
        [matchId, dto.teamId, dto.setNumber],
      );

      for (const slot of dto.lineup) {
        await client.query(
          `INSERT INTO volleyball_rotations (match_id, team_id, set_number, position, player_id, rotation_order)
           VALUES ($1, $2, $3, $4, $5, 0)`,
          [matchId, dto.teamId, dto.setNumber, slot.position, slot.playerId],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.getLineup(matchId, dto.teamId, dto.setNumber);
  }

  async rotateTeam(matchId: string, dto: RotateTeamDto): Promise<VolleyballRotationSlot[]> {
    const rules = await this.loadSportRules(matchId);
    const engine = new SportRulesEngine(rules);
    engine.validateRotationAllowed();

    // Load current lineup
    const lineup = await this.pool.query<RotationRow>(
      `SELECT * FROM volleyball_rotations
       WHERE match_id = $1 AND team_id = $2 AND set_number = $3
       ORDER BY position ASC`,
      [matchId, dto.teamId, dto.setNumber],
    );
    if (lineup.rowCount === 0) {
      throw new BusinessRuleError('No lineup registered for this team and set. Register lineup first.');
    }

    const currentRotation = lineup.rows[0].rotation_order;
    const newRotation     = (currentRotation + 1) % 6;

    // Rotate: each player moves one position clockwise
    // Position sequence: 1→2→3→4→5→6→1 (player in pos 1 moves to pos 6 after receiving)
    // Actually: winning team rotates clockwise: pos6→pos1, pos1→pos2, etc.
    const rotationMap: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 1 };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const slot of lineup.rows) {
        const newPosition = rotationMap[slot.position];
        await client.query(
          `UPDATE volleyball_rotations
           SET position = $1, rotation_order = $2
           WHERE id = $3`,
          [newPosition, newRotation, slot.id],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.getLineup(matchId, dto.teamId, dto.setNumber);
  }

  async getLineup(matchId: string, teamId: string, setNumber: number): Promise<VolleyballRotationSlot[]> {
    const result = await this.pool.query<RotationRow>(
      `SELECT * FROM volleyball_rotations
       WHERE match_id = $1 AND team_id = $2 AND set_number = $3
       ORDER BY position ASC`,
      [matchId, teamId, setNumber],
    );
    return result.rows.map(mapRotationRow);
  }

  // ── Substitutions ─────────────────────────────────────────────────────────

  async addSubstitution(matchId: string, dto: SubstitutionDto): Promise<Substitution> {
    const rules = await this.loadSportRules(matchId);
    const engine = new SportRulesEngine(rules);

    // Verify match is in_progress
    const matchResult = await this.pool.query<MatchRow>(`SELECT status FROM matches WHERE id = $1`, [matchId]);
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', matchId);
    if (matchResult.rows[0].status !== 'in_progress') {
      throw new BusinessRuleError('Substitutions can only be made during in_progress matches');
    }

    // Count existing substitutions for this team (per-set for volleyball, per-match for others)
    const countQuery = rules.hasSets
      ? `SELECT COUNT(*) as count FROM substitutions WHERE match_id = $1 AND team_id = $2 AND period_number = $3`
      : `SELECT COUNT(*) as count FROM substitutions WHERE match_id = $1 AND team_id = $2`;

    const countValues: unknown[] = rules.hasSets
      ? [matchId, dto.teamId, dto.periodNumber]
      : [matchId, dto.teamId];

    const countResult = await this.pool.query<{ count: string }>(countQuery, countValues);
    const currentCount = parseInt(countResult.rows[0].count, 10);

    engine.validateSubstitutionAllowed(currentCount);

    // Verify both players belong to the team
    const playerCheck = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM players WHERE id = ANY($1::uuid[]) AND team_id = $2`,
      [[dto.playerOutId, dto.playerInId], dto.teamId],
    );
    if (parseInt(playerCheck.rows[0].count, 10) < 2) {
      throw new BusinessRuleError('Both players must belong to the specified team');
    }

    // For volleyball: update the rotation slot if the sport has rotation
    if (rules.hasRotation) {
      await this.applyVolleyballSubstitution(matchId, dto, engine);
    }

    const result = await this.pool.query<SubstitutionRow>(
      `INSERT INTO substitutions (match_id, team_id, period_number, player_out_id, player_in_id, minute)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [matchId, dto.teamId, dto.periodNumber, dto.playerOutId, dto.playerInId, dto.minute],
    );
    return mapSubstitutionRow(result.rows[0]);
  }

  async getSubstitutions(matchId: string): Promise<Substitution[]> {
    const result = await this.pool.query<SubstitutionRow>(
      `SELECT * FROM substitutions WHERE match_id = $1 ORDER BY period_number, created_at ASC`,
      [matchId],
    );
    return result.rows.map(mapSubstitutionRow);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * For volleyball: replaces the outgoing player in the rotation with the incoming player.
   * The incoming player takes the exact rotation slot of the outgoing player.
   * Validates that the outgoing player is currently on court.
   */
  private async applyVolleyballSubstitution(
    matchId: string,
    dto: SubstitutionDto,
    _engine: SportRulesEngine,
  ): Promise<void> {
    const outgoingSlot = await this.pool.query<RotationRow>(
      `SELECT * FROM volleyball_rotations
       WHERE match_id = $1 AND team_id = $2 AND set_number = $3 AND player_id = $4`,
      [matchId, dto.teamId, dto.periodNumber, dto.playerOutId],
    );

    if (outgoingSlot.rowCount === 0) {
      throw new BusinessRuleError(
        'Player being substituted out is not in the current rotation for this set',
        { playerOutId: dto.playerOutId, setNumber: dto.periodNumber },
      );
    }

    // Check incoming player is not already on court
    const incomingOnCourt = await this.pool.query(
      `SELECT 1 FROM volleyball_rotations
       WHERE match_id = $1 AND team_id = $2 AND set_number = $3 AND player_id = $4`,
      [matchId, dto.teamId, dto.periodNumber, dto.playerInId],
    );
    if ((incomingOnCourt.rowCount ?? 0) > 0) {
      throw new BusinessRuleError(
        'Player being substituted in is already on court',
        { playerInId: dto.playerInId },
      );
    }

    // Replace outgoing player with incoming player in the rotation slot
    await this.pool.query(
      `UPDATE volleyball_rotations SET player_id = $1 WHERE id = $2`,
      [dto.playerInId, outgoingSlot.rows[0].id],
    );
  }

  async delete(id: string): Promise<void> {
    const matchResult = await this.pool.query<MatchRow>(`SELECT status FROM matches WHERE id = $1`, [id]);
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', id);
    if (matchResult.rows[0].status !== 'scheduled') {
      throw new BusinessRuleError('Only scheduled matches can be deleted');
    }
    await this.pool.query(`DELETE FROM matches WHERE id = $1`, [id]);
  }
}
