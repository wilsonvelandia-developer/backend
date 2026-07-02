import { Pool } from 'pg';
import { Match, Substitution, VolleyballRotationSlot } from '@tournament/shared';
import { NotFoundError, BusinessRuleError } from '@tournament/shared';
import {
  MatchRow, mapMatchRow,
  MatchPeriodRow, mapPeriodRow,
  RotationRow, mapRotationRow,
  SubstitutionRow, mapSubstitutionRow,
  MatchSanctionRow, mapSanctionRow,
  MatchEventRow, mapEventRow,
  MatchScorerRow, mapScorerRow,
  MatchLineupRow, mapLineupRow,
  SportRules, TournamentSubRules, MatchDetail,
  MatchSanction, MatchEvent, MatchScorer,
  MatchLineupPlayer, MatchSetup,
} from './matches.types.js';
import { SportRulesEngine } from './sport-rules.engine.js';
import {
  CreateMatchDto, UpdatePeriodScoreDto,
  RegisterLineupDto, RotateTeamDto,
  SubstitutionDto, ListMatchesQuery,
  CreateSanctionDto, CreateMatchEventDto, CreateScorerDto,
  MatchSetupDto, SaveLineupDto,
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
              COALESCE(t.has_sets_override, s.has_sets) AS "hasSets",
              COALESCE(t.sets_to_win_override, s.sets_to_win) AS "setsToWin",
              COALESCE(t.points_per_set_override, s.points_per_set) AS "pointsPerSet",
              COALESCE(t.decisive_set_points_override, s.decisive_set_points) AS "decisiveSetPoints",
              COALESCE(t.win_margin_override, s.win_margin) AS "winMargin",
              COALESCE(t.periods_per_match_override, s.periods_per_match) AS "periodsPerMatch",
              CASE
                WHEN t.max_substitutions_override = -1 THEN NULL
                ELSE COALESCE(t.max_substitutions_override, t.max_subs_override, s.max_substitutions)
              END AS "maxSubstitutions",
              COALESCE(t.has_rotation_override, s.has_rotation) AS "hasRotation",
              COALESCE(t.players_per_team_override, s.players_per_team) AS "playersPerTeam",
              t.min_players_per_team AS "minPlayersPerTeam"
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

  /**
   * Loads tournament-level substitution rules for the match.
   */
  async loadTournamentSubRules(matchId: string): Promise<TournamentSubRules> {
    const result = await this.pool.query<TournamentSubRules>(
      `SELECT
         t.allow_reentry AS "allowReentry",
         t.enforce_paired_subs AS "enforcePairedSubs",
         t.libero_unlimited_subs AS "liberoUnlimitedSubs",
         t.max_subs_per_period AS "maxSubsPerPeriod",
         t.max_subs_override AS "maxSubsOverride"
       FROM matches m
       JOIN phases p ON p.id = m.phase_id
       JOIN tournaments t ON t.id = p.tournament_id
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
    const tournamentRules = await this.loadTournamentSubRules(matchId);
    const engine = new SportRulesEngine(rules);

    // Verify match is in_progress
    const matchResult = await this.pool.query<MatchRow>(`SELECT status FROM matches WHERE id = $1`, [matchId]);
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', matchId);
    if (matchResult.rows[0].status !== 'in_progress') {
      throw new BusinessRuleError('Substitutions can only be made during in_progress matches');
    }

    // Determine effective max subs (tournament override > sport default)
    const effectiveMaxSubs = tournamentRules.maxSubsPerPeriod
      ?? tournamentRules.maxSubsOverride
      ?? rules.maxSubstitutions;

    // Count existing substitutions for this team (per-set for volleyball, per-match for others)
    const countQuery = rules.hasSets
      ? `SELECT COUNT(*) as count FROM substitutions WHERE match_id = $1 AND team_id = $2 AND period_number = $3`
      : `SELECT COUNT(*) as count FROM substitutions WHERE match_id = $1 AND team_id = $2`;

    const countValues: unknown[] = rules.hasSets
      ? [matchId, dto.teamId, dto.periodNumber]
      : [matchId, dto.teamId];

    const countResult = await this.pool.query<{ count: string }>(countQuery, countValues);
    const currentCount = parseInt(countResult.rows[0].count, 10);

    // Check if this is a libero substitution (skip count for libero)
    const isLiberoSub = await this.isLiberoSubstitution(matchId, dto);
    if (!(isLiberoSub && tournamentRules.liberoUnlimitedSubs)) {
      // Validate max substitutions allowed
      if (effectiveMaxSubs !== null && currentCount >= effectiveMaxSubs) {
        throw new BusinessRuleError(
          `Maximum substitutions reached (${effectiveMaxSubs}) for this ${rules.hasSets ? 'set' : 'match'}`,
          { current: currentCount, max: effectiveMaxSubs },
        );
      }
    }

    // Verify both players belong to the team
    const playerCheck = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM players WHERE id = ANY($1::uuid[]) AND team_id = $2`,
      [[dto.playerOutId, dto.playerInId], dto.teamId],
    );
    if (parseInt(playerCheck.rows[0].count, 10) < 2) {
      throw new BusinessRuleError('Both players must belong to the specified team');
    }

    // ── Re-entry validation (football) ──────────────────────────────────────
    if (!tournamentRules.allowReentry && !rules.hasSets) {
      // Check if playerIn was previously substituted OUT in this match
      const prevSubOut = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM substitutions
         WHERE match_id = $1 AND team_id = $2 AND player_out_id = $3`,
        [matchId, dto.teamId, dto.playerInId],
      );
      if (parseInt(prevSubOut.rows[0].count, 10) > 0) {
        throw new BusinessRuleError(
          'This player was already substituted out and re-entry is not allowed in this tournament',
          { playerId: dto.playerInId },
        );
      }
    }

    // ── Paired substitution validation (volleyball) ─────────────────────────
    if (tournamentRules.enforcePairedSubs && rules.hasSets && !isLiberoSub) {
      // In volleyball with paired subs: player A can only be replaced by player B,
      // and player B can only re-enter for player A.
      const previousSubs = await this.pool.query<SubstitutionRow>(
        `SELECT * FROM substitutions
         WHERE match_id = $1 AND team_id = $2 AND period_number = $3
         ORDER BY created_at ASC`,
        [matchId, dto.teamId, dto.periodNumber],
      );

      // Check if playerIn was previously subbed out — if so, they can only enter for who replaced them
      for (const sub of previousSubs.rows) {
        if (sub.player_out_id === dto.playerInId) {
          // playerIn was subbed out before; they can only re-enter for the player who replaced them
          if (dto.playerOutId !== sub.player_in_id) {
            throw new BusinessRuleError(
              `Paired substitution rule: player can only re-enter for the player who replaced them`,
              { playerInId: dto.playerInId, mustReplaceOnly: sub.player_in_id },
            );
          }
        }
      }
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

  /**
   * Checks if the substitution involves the libero (either going in or out).
   */
  private async isLiberoSubstitution(matchId: string, dto: SubstitutionDto): Promise<boolean> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM match_lineups
       WHERE match_id = $1 AND team_id = $2 AND is_libero = true
       AND player_id = ANY($3::uuid[])`,
      [matchId, dto.teamId, [dto.playerOutId, dto.playerInId]],
    );
    return parseInt(result.rows[0].count, 10) > 0;
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

  // ── Sanctions ─────────────────────────────────────────────────────────────

  /**
   * Records a sanction (card/foul) for a player or team during a match.
   * Validates that the match is in_progress and that the sanction type belongs to the tournament.
   */
  async addSanction(matchId: string, dto: CreateSanctionDto): Promise<MatchSanction> {
    // Verify match exists and is in_progress
    const matchResult = await this.pool.query<MatchRow>(`SELECT * FROM matches WHERE id = $1`, [matchId]);
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', matchId);
    if (matchResult.rows[0].status !== 'in_progress') {
      throw new BusinessRuleError('Sanctions can only be given during in_progress matches');
    }

    // Verify sanction type exists and load its config
    const sanctionTypeResult = await this.pool.query<{
      id: string; code: string; name: string;
      accumulation_limit: number | null;
      expulsion_sanction_id: string | null;
    }>(
      `SELECT st.id, st.code, st.name,
              st.accumulation_limit,
              st2.id AS expulsion_sanction_id
       FROM sanction_types st
       JOIN tournaments t ON t.id = st.tournament_id
       JOIN phases p ON p.tournament_id = t.id
       JOIN matches m ON m.phase_id = p.id
       LEFT JOIN sanction_types st2
         ON st2.tournament_id = st.tournament_id AND st2.code = 'RED'
       WHERE m.id = $1 AND st.id = $2`,
      [matchId, dto.sanctionTypeId],
    );
    if (sanctionTypeResult.rowCount === 0) {
      throw new BusinessRuleError('Sanction type not found or does not belong to this tournament');
    }

    const sanctionType = sanctionTypeResult.rows[0];

    // Insert the sanction
    const result = await this.pool.query<MatchSanctionRow>(
      `INSERT INTO match_sanctions (match_id, sanction_type_id, team_id, player_id, period_number, minute, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [matchId, dto.sanctionTypeId, dto.teamId, dto.playerId, dto.periodNumber, dto.minute, dto.notes],
    );

    const sanction = mapSanctionRow(result.rows[0]);

    // ── Accumulation check: auto-expulsion ──────────────────────────────────
    // If this sanction type has an accumulation limit (e.g. 2 yellows = red),
    // check if the player has reached it and auto-apply expulsion.
    if (dto.playerId && sanctionType.accumulation_limit) {
      const countResult = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM match_sanctions
         WHERE match_id = $1 AND player_id = $2 AND sanction_type_id = $3`,
        [matchId, dto.playerId, dto.sanctionTypeId],
      );
      const totalSanctions = parseInt(countResult.rows[0].count, 10);

      if (totalSanctions >= sanctionType.accumulation_limit && sanctionType.expulsion_sanction_id) {
        // Auto-apply expulsion (RED card)
        await this.pool.query(
          `INSERT INTO match_sanctions (match_id, sanction_type_id, team_id, player_id, period_number, minute, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            matchId, sanctionType.expulsion_sanction_id, dto.teamId, dto.playerId,
            dto.periodNumber, dto.minute,
            `Expulsión automática por acumulación de ${sanctionType.accumulation_limit} ${sanctionType.name}`,
          ],
        );

        // Also register an event for the timeline
        await this.pool.query(
          `INSERT INTO match_events (match_id, event_type, team_id, player_id, period_number, match_minute, payload)
           VALUES ($1, 'sanction', $2, $3, $4, $5, $6)`,
          [
            matchId, dto.teamId, dto.playerId, dto.periodNumber, dto.minute,
            JSON.stringify({ autoExpulsion: true, reason: `${sanctionType.accumulation_limit}x ${sanctionType.code}` }),
          ],
        );
      }
    }

    return sanction;
  }

  /**
   * Returns all sanctions for a match, enriched with sanction type and player info.
   */
  async getSanctions(matchId: string): Promise<MatchSanction[]> {
    const result = await this.pool.query<MatchSanctionRow>(
      `SELECT ms.*,
              st.name AS sanction_name, st.code AS sanction_code,
              st.color AS sanction_color, st.icon AS sanction_icon,
              p.name AS player_name, p.jersey_number AS player_jersey,
              t.name AS team_name
       FROM match_sanctions ms
       JOIN sanction_types st ON st.id = ms.sanction_type_id
       LEFT JOIN players p ON p.id = ms.player_id
       JOIN teams t ON t.id = ms.team_id
       WHERE ms.match_id = $1
       ORDER BY ms.created_at ASC`,
      [matchId],
    );
    return result.rows.map(mapSanctionRow);
  }

  /**
   * Returns sanctions grouped by player for a given team in a match.
   * Useful for showing accumulation warnings.
   */
  async getSanctionsByPlayer(matchId: string, teamId: string): Promise<Array<{
    playerId: string;
    playerName: string;
    jerseyNumber: number;
    sanctions: MatchSanction[];
    totalYellows: number;
    hasRed: boolean;
  }>> {
    const result = await this.pool.query<MatchSanctionRow & { sanction_code: string }>(
      `SELECT ms.*,
              st.name AS sanction_name, st.code AS sanction_code,
              st.color AS sanction_color, st.icon AS sanction_icon,
              p.name AS player_name, p.jersey_number AS player_jersey,
              t.name AS team_name
       FROM match_sanctions ms
       JOIN sanction_types st ON st.id = ms.sanction_type_id
       LEFT JOIN players p ON p.id = ms.player_id
       JOIN teams t ON t.id = ms.team_id
       WHERE ms.match_id = $1 AND ms.team_id = $2 AND ms.player_id IS NOT NULL
       ORDER BY ms.created_at ASC`,
      [matchId, teamId],
    );

    // Group by player
    const grouped = new Map<string, {
      playerId: string;
      playerName: string;
      jerseyNumber: number;
      sanctions: MatchSanction[];
      totalYellows: number;
      hasRed: boolean;
    }>();

    for (const row of result.rows) {
      if (!row.player_id) continue;
      if (!grouped.has(row.player_id)) {
        grouped.set(row.player_id, {
          playerId: row.player_id,
          playerName: row.player_name ?? '',
          jerseyNumber: row.player_jersey ?? 0,
          sanctions: [],
          totalYellows: 0,
          hasRed: false,
        });
      }
      const entry = grouped.get(row.player_id)!;
      entry.sanctions.push(mapSanctionRow(row));
      if (row.sanction_code === 'YELLOW') entry.totalYellows++;
      if (row.sanction_code === 'RED') entry.hasRed = true;
    }

    return Array.from(grouped.values());
  }

  // ── Match Events ──────────────────────────────────────────────────────────

  /**
   * Records a generic event in the match timeline.
   */
  async addEvent(matchId: string, dto: CreateMatchEventDto): Promise<MatchEvent> {
    // Verify match exists
    const matchResult = await this.pool.query<MatchRow>(`SELECT status FROM matches WHERE id = $1`, [matchId]);
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', matchId);

    const result = await this.pool.query<MatchEventRow>(
      `INSERT INTO match_events (match_id, event_type, team_id, player_id, period_number, match_minute, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [matchId, dto.eventType, dto.teamId, dto.playerId, dto.periodNumber, dto.matchMinute, JSON.stringify(dto.payload)],
    );

    return mapEventRow(result.rows[0]);
  }

  /**
   * Returns all events for a match, ordered chronologically.
   */
  async getEvents(matchId: string): Promise<MatchEvent[]> {
    const result = await this.pool.query<MatchEventRow>(
      `SELECT me.*,
              p.name AS player_name,
              t.name AS team_name
       FROM match_events me
       LEFT JOIN players p ON p.id = me.player_id
       LEFT JOIN teams t ON t.id = me.team_id
       WHERE me.match_id = $1
       ORDER BY me.created_at ASC`,
      [matchId],
    );
    return result.rows.map(mapEventRow);
  }

  // ── Match Scorers ─────────────────────────────────────────────────────────

  /**
   * Records who scored a point/goal.
   */
  async addScorer(matchId: string, dto: CreateScorerDto): Promise<MatchScorer> {
    // Verify match is in_progress
    const matchResult = await this.pool.query<MatchRow>(`SELECT status FROM matches WHERE id = $1`, [matchId]);
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', matchId);
    if (matchResult.rows[0].status !== 'in_progress') {
      throw new BusinessRuleError('Scorers can only be registered during in_progress matches');
    }

    // Verify player belongs to the team
    const playerCheck = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM players WHERE id = $1 AND team_id = $2`,
      [dto.playerId, dto.teamId],
    );
    if (parseInt(playerCheck.rows[0].count, 10) === 0) {
      throw new BusinessRuleError('Player does not belong to the specified team');
    }

    const result = await this.pool.query<MatchScorerRow>(
      `INSERT INTO match_scorers (match_id, team_id, player_id, period_number, match_minute, points)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [matchId, dto.teamId, dto.playerId, dto.periodNumber, dto.matchMinute, dto.points],
    );

    return mapScorerRow(result.rows[0]);
  }

  /**
   * Returns all scorers for a match, enriched with player info.
   */
  async getScorers(matchId: string): Promise<MatchScorer[]> {
    const result = await this.pool.query<MatchScorerRow>(
      `SELECT ms.*,
              p.name AS player_name, p.jersey_number AS player_jersey,
              t.name AS team_name
       FROM match_scorers ms
       JOIN players p ON p.id = ms.player_id
       JOIN teams t ON t.id = ms.team_id
       WHERE ms.match_id = $1
       ORDER BY ms.created_at ASC`,
      [matchId],
    );
    return result.rows.map(mapScorerRow);
  }

  /** Delete the most recent scorer entry for a match. */
  async deleteLastScorer(matchId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM match_scorers WHERE id = (
         SELECT id FROM match_scorers WHERE match_id = $1 ORDER BY created_at DESC LIMIT 1
       )`,
      [matchId],
    );
  }

  /** Delete the most recent event entry for a match. */
  async deleteLastEvent(matchId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM match_events WHERE id = (
         SELECT id FROM match_events WHERE match_id = $1 ORDER BY created_at DESC LIMIT 1
       )`,
      [matchId],
    );
  }

  // ── Match Referees ──────────────────────────────────────────────────────────

  /**
   * Find matches from tournaments where the user is assigned as referee staff.
   * Optionally filter by match status.
   */
  async findMatchesForReferee(userId: string, status?: string): Promise<Match[]> {
    const conditions = [
      `ts.user_id = $1`,
      `ts.staff_role = 'referee'`,
    ];
    const values: unknown[] = [userId];
    let idx = 2;

    if (status) {
      conditions.push(`m.status = $${idx++}`);
      values.push(status);
    }

    const result = await this.pool.query<MatchRow & {
      tournament_name: string; sport_name: string; category: string | null;
    }>(
      `SELECT DISTINCT m.*,
              t.name AS tournament_name,
              s.name AS sport_name,
              t.category
       FROM matches m
       JOIN phases p ON p.id = m.phase_id
       JOIN tournaments t ON t.id = p.tournament_id
       JOIN sports s ON s.id = t.sport_id
       JOIN tournament_staff ts ON ts.tournament_id = p.tournament_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.scheduled_at ASC NULLS LAST, m.created_at ASC`,
      values,
    );
    return result.rows.map((row) => ({
      ...mapMatchRow(row),
      tournamentName: row.tournament_name,
      sportName: row.sport_name,
      category: row.category,
    }));
  }

  /**
   * Get referees assigned to a specific match with user info.
   */
  async getMatchReferees(matchId: string): Promise<Array<{
    userId: string; userName: string; email: string; refereeRole: string; assignedAt: string;
  }>> {
    const result = await this.pool.query<{
      user_id: string; name: string; email: string; referee_role: string; assigned_at: Date;
    }>(
      `SELECT mr.user_id, u.name, u.email, mr.referee_role, mr.assigned_at
       FROM match_referees mr
       JOIN users u ON u.id = mr.user_id
       WHERE mr.match_id = $1
       ORDER BY mr.referee_role ASC, mr.assigned_at ASC`,
      [matchId],
    );
    return result.rows.map((r) => ({
      userId:      r.user_id,
      userName:    r.name,
      email:       r.email,
      refereeRole: r.referee_role,
      assignedAt:  r.assigned_at.toISOString(),
    }));
  }

  /**
   * Assign a referee to a match.
   * Validates the user is staff with role 'referee' in the match's tournament.
   */
  async assignReferee(matchId: string, userId: string, refereeRole: string): Promise<{
    matchId: string; userId: string; refereeRole: string;
  }> {
    // Verify user is referee staff of this match's tournament
    const staffCheck = await this.pool.query<{ id: string }>(
      `SELECT ts.id
       FROM tournament_staff ts
       JOIN phases p ON p.tournament_id = ts.tournament_id
       JOIN matches m ON m.phase_id = p.id
       WHERE m.id = $1 AND ts.user_id = $2 AND ts.staff_role = 'referee'`,
      [matchId, userId],
    );
    if (staffCheck.rowCount === 0) {
      throw new BusinessRuleError(
        'El usuario no está registrado como árbitro en el torneo de este partido',
      );
    }

    await this.pool.query(
      `INSERT INTO match_referees (match_id, user_id, referee_role)
       VALUES ($1, $2, $3)
       ON CONFLICT (match_id, user_id) DO UPDATE SET referee_role = $3`,
      [matchId, userId, refereeRole],
    );

    return { matchId, userId, refereeRole };
  }

  /**
   * Remove a referee assignment from a match.
   */
  async removeReferee(matchId: string, userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM match_referees WHERE match_id = $1 AND user_id = $2`,
      [matchId, userId],
    );
  }

  // ── Match Setup ───────────────────────────────────────────────────────────

  /**
   * Saves match setup info (coin toss, field sides, first serve).
   */
  async saveSetup(matchId: string, dto: MatchSetupDto): Promise<void> {
    const matchResult = await this.pool.query<MatchRow>(`SELECT status FROM matches WHERE id = $1`, [matchId]);
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', matchId);

    await this.pool.query(
      `UPDATE matches SET
         coin_toss_winner_team_id = $1,
         field_side_home = $2,
         field_side_away = $3,
         first_serve_team_id = $4,
         updated_at = NOW()
       WHERE id = $5`,
      [dto.coinTossWinnerTeamId, dto.fieldSideHome, dto.fieldSideAway, dto.firstServeTeamId, matchId],
    );
  }

  /**
   * Gets the full match setup including lineups for both teams.
   */
  async getSetup(matchId: string): Promise<MatchSetup> {
    const matchResult = await this.pool.query<{
      coin_toss_winner_team_id: string | null;
      field_side_home: string | null;
      field_side_away: string | null;
      first_serve_team_id: string | null;
      home_team_id: string;
      away_team_id: string;
    }>(
      `SELECT coin_toss_winner_team_id, field_side_home, field_side_away,
              first_serve_team_id, home_team_id, away_team_id
       FROM matches WHERE id = $1`,
      [matchId],
    );
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', matchId);

    const match = matchResult.rows[0];

    const homeLineup = await this.getMatchLineup(matchId, match.home_team_id);
    const awayLineup = await this.getMatchLineup(matchId, match.away_team_id);

    return {
      coinTossWinnerTeamId: match.coin_toss_winner_team_id,
      fieldSideHome:        match.field_side_home,
      fieldSideAway:        match.field_side_away,
      firstServeTeamId:     match.first_serve_team_id,
      lineups: { home: homeLineup, away: awayLineup },
    };
  }

  // ── Match Lineups ─────────────────────────────────────────────────────────

  /**
   * Saves the starting lineup for a team in a match.
   * Replaces existing lineup for that team/period.
   */
  async saveMatchLineup(matchId: string, dto: SaveLineupDto): Promise<MatchLineupPlayer[]> {
    const matchResult = await this.pool.query<MatchRow>(`SELECT status FROM matches WHERE id = $1`, [matchId]);
    if (matchResult.rowCount === 0) throw new NotFoundError('Match', matchId);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing lineup for this team/period
      await client.query(
        `DELETE FROM match_lineups WHERE match_id = $1 AND team_id = $2 AND period_number = $3`,
        [matchId, dto.teamId, dto.periodNumber],
      );

      for (const player of dto.players) {
        await client.query(
          `INSERT INTO match_lineups
             (match_id, team_id, player_id, is_starter, is_captain, is_goalkeeper, is_libero, volleyball_zone, period_number)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            matchId, dto.teamId, player.playerId,
            player.isStarter, player.isCaptain, player.isGoalkeeper,
            player.isLibero, player.volleyballZone, dto.periodNumber,
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

    return this.getMatchLineup(matchId, dto.teamId, dto.periodNumber);
  }

  /**
   * Gets lineup for a team in a match, enriched with player info.
   */
  async getMatchLineup(matchId: string, teamId: string, periodNumber?: number): Promise<MatchLineupPlayer[]> {
    const period = periodNumber ?? 1;
    const result = await this.pool.query<MatchLineupRow>(
      `SELECT ml.*,
              p.name AS player_name, p.jersey_number, p.position
       FROM match_lineups ml
       JOIN players p ON p.id = ml.player_id
       WHERE ml.match_id = $1 AND ml.team_id = $2 AND ml.period_number = $3
       ORDER BY ml.is_starter DESC, ml.volleyball_zone ASC NULLS LAST, p.jersey_number ASC`,
      [matchId, teamId, period],
    );
    return result.rows.map(mapLineupRow);
  }
}
