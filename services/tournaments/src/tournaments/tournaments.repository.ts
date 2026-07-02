import { Pool } from 'pg';
import { Tournament, Phase } from '@tournament/shared';
import { NotFoundError, ConflictError, BusinessRuleError } from '@tournament/shared';
import {
  TournamentRow, mapTournamentRow, CreateTournamentInput, UpdateTournamentInput,
  PhaseRow, mapPhaseRow, CreatePhaseInput, UpdatePhaseInput,
} from './tournaments.types.js';
import { ListTournamentsQuery } from './tournaments.schema.js';

/**
 * Tournaments repository — all DB access for tournaments and phases.
 * Only parameterized queries — no string concatenation for SQL.
 */
export class TournamentsRepository {
  constructor(private readonly pool: Pool) {}

  // ── Tournaments ───────────────────────────────────────────────────────────

  async findAll(filters: ListTournamentsQuery): Promise<Tournament[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.sportId) {
      conditions.push(`sport_id = $${idx++}`);
      values.push(filters.sportId);
    }
    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filters.status);
    }
    if (filters.season) {
      conditions.push(`season = $${idx++}`);
      values.push(filters.season);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query<TournamentRow>(
      `SELECT * FROM tournaments ${where} ORDER BY created_at DESC`,
      values,
    );
    return result.rows.map(mapTournamentRow);
  }

  async findById(id: string): Promise<Tournament> {
    const result = await this.pool.query<TournamentRow>(
      `SELECT * FROM tournaments WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) throw new NotFoundError('Tournament', id);
    return mapTournamentRow(result.rows[0]);
  }

  async create(input: CreateTournamentInput): Promise<Tournament> {
    // Verify the sport exists before creating
    const sportCheck = await this.pool.query(
      `SELECT id FROM sports WHERE id = $1`,
      [input.sportId],
    );
    if (sportCheck.rowCount === 0) {
      throw new NotFoundError('Sport', input.sportId);
    }

    const result = await this.pool.query<TournamentRow>(
      `INSERT INTO tournaments (
        sport_id, name, season, max_subs_override,
        start_date, registration_deadline, expected_teams, num_groups,
        category, birth_year_from, validate_birth_from, birth_year_to, validate_birth_to,
        contact_phone, address, location_url,
        image_url, description, entry_fee, rules_file_url, invitation_file_url,
        instagram_url, facebook_url, tiktok_url, youtube_url,
        match_duration_minutes, matches_per_day, first_match_time, num_venues, venue_name,
        points_config, tiebreaker_criteria, initial_fair_play_score, teams_per_group_qualify
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
      ) RETURNING *`,
      [
        input.sportId, input.name, input.season, input.maxSubsOverride,
        input.startDate, input.registrationDeadline, input.expectedTeams, input.numGroups,
        input.category, input.birthYearFrom, input.validateBirthFrom, input.birthYearTo, input.validateBirthTo,
        input.contactPhone, input.address, input.locationUrl,
        input.imageUrl, input.description, input.entryFee, input.rulesFileUrl, input.invitationFileUrl,
        input.instagramUrl, input.facebookUrl, input.tiktokUrl, input.youtubeUrl,
        input.matchDurationMinutes, input.matchesPerDay, input.firstMatchTime, input.numVenues, input.venueName,
        JSON.stringify(input.pointsConfig ?? { win: 3, draw: 1, loss: 0 }),
        JSON.stringify(input.tiebreakerCriteria ?? ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'draw']),
        input.initialFairPlayScore ?? 1000,
        input.teamsPerGroupQualify ?? 2,
      ],
    );
    return mapTournamentRow(result.rows[0]);
  }

  async update(id: string, input: UpdateTournamentInput): Promise<Tournament> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      sportId:              'sport_id',
      name:                 'name',
      season:               'season',
      maxSubsOverride:      'max_subs_override',
      status:               'status',
      startDate:            'start_date',
      registrationDeadline: 'registration_deadline',
      expectedTeams:        'expected_teams',
      numGroups:            'num_groups',
      category:             'category',
      birthYearFrom:        'birth_year_from',
      validateBirthFrom:    'validate_birth_from',
      birthYearTo:          'birth_year_to',
      validateBirthTo:      'validate_birth_to',
      contactPhone:         'contact_phone',
      address:              'address',
      locationUrl:          'location_url',
      imageUrl:             'image_url',
      description:          'description',
      entryFee:             'entry_fee',
      rulesFileUrl:         'rules_file_url',
      invitationFileUrl:    'invitation_file_url',
      instagramUrl:         'instagram_url',
      facebookUrl:          'facebook_url',
      tiktokUrl:            'tiktok_url',
      youtubeUrl:           'youtube_url',
      matchDurationMinutes: 'match_duration_minutes',
      matchesPerDay:        'matches_per_day',
      firstMatchTime:       'first_match_time',
      numVenues:            'num_venues',
      venueName:            'venue_name',
      pointsConfig:         'points_config',
      tiebreakerCriteria:   'tiebreaker_criteria',
      initialFairPlayScore: 'initial_fair_play_score',
      teamsPerGroupQualify: 'teams_per_group_qualify',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if (key in input && (input as Record<string, unknown>)[key] !== undefined) {
        const value = (input as Record<string, unknown>)[key];
        fields.push(`${column} = $${idx++}`);
        // JSONB fields must be stringified for pg driver
        if (key === 'pointsConfig' || key === 'tiebreakerCriteria') {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    }

    if (fields.length === 0) throw new BusinessRuleError('No fields to update');

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await this.pool.query<TournamentRow>(
      `UPDATE tournaments SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (result.rowCount === 0) throw new NotFoundError('Tournament', id);
    return mapTournamentRow(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    // Prevent deletion if tournament has active matches (checked via phases)
    const activeCheck = await this.pool.query(
      `SELECT 1 FROM phases p
       JOIN matches m ON m.phase_id = p.id
       WHERE p.tournament_id = $1 AND m.status = 'in_progress'
       LIMIT 1`,
      [id],
    );
    if ((activeCheck.rowCount ?? 0) > 0) {
      throw new BusinessRuleError('Cannot delete a tournament with in-progress matches');
    }

    const result = await this.pool.query(
      `DELETE FROM tournaments WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) throw new NotFoundError('Tournament', id);
  }

  // ── Phases ────────────────────────────────────────────────────────────────

  async findPhasesByTournament(tournamentId: string): Promise<Phase[]> {
    const result = await this.pool.query<PhaseRow>(
      `SELECT * FROM phases WHERE tournament_id = $1 ORDER BY order_index ASC`,
      [tournamentId],
    );
    return result.rows.map(mapPhaseRow);
  }

  async findPhaseById(tournamentId: string, phaseId: string): Promise<Phase> {
    const result = await this.pool.query<PhaseRow>(
      `SELECT * FROM phases WHERE id = $1 AND tournament_id = $2`,
      [phaseId, tournamentId],
    );
    if (result.rowCount === 0) throw new NotFoundError('Phase', phaseId);
    return mapPhaseRow(result.rows[0]);
  }

  async createPhase(tournamentId: string, input: CreatePhaseInput): Promise<Phase> {
    // Verify tournament exists and is not finished
    const tournament = await this.pool.query<TournamentRow>(
      `SELECT status FROM tournaments WHERE id = $1`,
      [tournamentId],
    );
    if (tournament.rowCount === 0) throw new NotFoundError('Tournament', tournamentId);
    if (tournament.rows[0].status === 'finished') {
      throw new BusinessRuleError('Cannot add phases to a finished tournament');
    }

    try {
      const result = await this.pool.query<PhaseRow>(
        `INSERT INTO phases (tournament_id, name, format, order_index)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [tournamentId, input.name, input.format, input.orderIndex],
      );
      return mapPhaseRow(result.rows[0]);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === '23505') {
        throw new ConflictError(`A phase with order ${input.orderIndex} already exists in this tournament`);
      }
      throw err;
    }
  }

  async updatePhase(tournamentId: string, phaseId: string, input: UpdatePhaseInput): Promise<Phase> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name        !== undefined) { fields.push(`name = $${idx++}`);        values.push(input.name); }
    if (input.format      !== undefined) { fields.push(`format = $${idx++}`);      values.push(input.format); }
    if (input.orderIndex  !== undefined) { fields.push(`order_index = $${idx++}`); values.push(input.orderIndex); }
    if (input.status      !== undefined) { fields.push(`status = $${idx++}`);      values.push(input.status); }

    if (fields.length === 0) throw new BusinessRuleError('No fields to update');

    values.push(phaseId, tournamentId);

    try {
      const result = await this.pool.query<PhaseRow>(
        `UPDATE phases SET ${fields.join(', ')} WHERE id = $${idx} AND tournament_id = $${idx + 1} RETURNING *`,
        values,
      );
      if (result.rowCount === 0) throw new NotFoundError('Phase', phaseId);
      return mapPhaseRow(result.rows[0]);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === '23505') {
        throw new ConflictError(`A phase with that order index already exists in this tournament`);
      }
      throw err;
    }
  }

  async deletePhase(tournamentId: string, phaseId: string): Promise<void> {
    // Cannot delete a phase that has matches
    const matchCheck = await this.pool.query(
      `SELECT 1 FROM matches WHERE phase_id = $1 LIMIT 1`,
      [phaseId],
    );
    if ((matchCheck.rowCount ?? 0) > 0) {
      throw new BusinessRuleError('Cannot delete a phase that has scheduled matches');
    }

    const result = await this.pool.query(
      `DELETE FROM phases WHERE id = $1 AND tournament_id = $2`,
      [phaseId, tournamentId],
    );
    if (result.rowCount === 0) throw new NotFoundError('Phase', phaseId);
  }

  /**
   * Registers a user as staff for a tournament.
   * ON CONFLICT DO NOTHING — safe to call multiple times.
   */
  async registerStaff(tournamentId: string, userId: string, staffRole: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO tournament_staff (user_id, tournament_id, staff_role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tournament_id, staff_role) DO NOTHING`,
      [userId, tournamentId, staffRole],
    );
  }

  /**
   * Gets all staff for a tournament with user info.
   */
  async getStaff(tournamentId: string, role?: string): Promise<Array<{
    userId: string; userName: string; email: string; staffRole: string; assignedAt: string;
  }>> {
    const conditions = ['ts.tournament_id = $1'];
    const values: unknown[] = [tournamentId];
    if (role) {
      conditions.push('ts.staff_role = $2');
      values.push(role);
    }

    const result = await this.pool.query<{
      user_id: string; name: string; email: string; staff_role: string; assigned_at: Date;
    }>(
      `SELECT ts.user_id, u.name, u.email, ts.staff_role, ts.assigned_at
       FROM tournament_staff ts
       JOIN users u ON u.id = ts.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ts.staff_role, u.name`,
      values,
    );
    return result.rows.map((r) => ({
      userId:     r.user_id,
      userName:   r.name,
      email:      r.email,
      staffRole:  r.staff_role,
      assignedAt: r.assigned_at.toISOString(),
    }));
  }

  /**
   * Removes all staff roles for a user in a tournament.
   */
  async removeStaff(tournamentId: string, userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM tournament_staff WHERE tournament_id = $1 AND user_id = $2`,
      [tournamentId, userId],
    );
  }

  // ── Group Draw ────────────────────────────────────────────────────────────

  async getGroups(tournamentId: string): Promise<Array<{ teamId: string; teamName: string; groupName: string; drawOrder: number }>> {
    const result = await this.pool.query<{ team_id: string; team_name: string; group_name: string; draw_order: number }>(
      `SELECT tg.team_id, t.name AS team_name, tg.group_name, tg.draw_order
       FROM team_groups tg
       JOIN teams t ON t.id = tg.team_id
       WHERE tg.tournament_id = $1
       ORDER BY tg.group_name, tg.draw_order`,
      [tournamentId],
    );
    return result.rows.map((r) => ({
      teamId:    r.team_id,
      teamName:  r.team_name,
      groupName: r.group_name,
      drawOrder: r.draw_order,
    }));
  }

  async saveGroupDraw(tournamentId: string, assignments: Array<{ teamId: string; groupName: string; drawOrder: number }>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM team_groups WHERE tournament_id = $1`, [tournamentId]);
      for (const a of assignments) {
        await client.query(
          `INSERT INTO team_groups (tournament_id, team_id, group_name, draw_order) VALUES ($1, $2, $3, $4)`,
          [tournamentId, a.teamId, a.groupName, a.drawOrder],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Generates round-robin matches for all groups using the circle method.
   * Algorithm:
   *  - For n teams: n-1 rounds, each round has n/2 matches
   *  - If odd number of teams: add BYE (team rests that round)
   *  - Matches are scheduled sequentially based on tournament config
   */
  async generateGroupFixture(
    tournamentId: string,
    config: {
      startDate?: string;
      matchDurationMinutes?: number;
      matchesPerDay?: number;
      firstMatchTime?: string;
      randomOrder?: boolean;
    },
  ): Promise<unknown[]> {
    // Load tournament config
    const tResult = await this.pool.query<TournamentRow>(
      `SELECT * FROM tournaments WHERE id = $1`, [tournamentId],
    );
    if (tResult.rowCount === 0) throw new NotFoundError('Tournament', tournamentId);
    const tournament = tResult.rows[0];

    const startDate       = config.startDate || tournament.start_date || new Date().toISOString().slice(0, 10);
    const durationMin     = config.matchDurationMinutes || tournament.match_duration_minutes;
    const perDay          = config.matchesPerDay || tournament.matches_per_day;
    const firstTime       = config.firstMatchTime || tournament.first_match_time;
    const numVenues       = tournament.num_venues || 1;
    const venueName       = tournament.venue_name || 'Cancha';
    const randomOrder     = config.randomOrder ?? false;

    // Load groups
    const groupsResult = await this.pool.query<{ team_id: string; group_name: string; draw_order: number }>(
      `SELECT team_id, group_name, draw_order FROM team_groups WHERE tournament_id = $1 ORDER BY group_name, draw_order`,
      [tournamentId],
    );
    if (groupsResult.rowCount === 0) throw new BusinessRuleError('No hay sorteo de grupos confirmado. Realiza el sorteo primero.');

    // Group teams by group name
    const groupMap = new Map<string, string[]>();
    for (const row of groupsResult.rows) {
      if (!groupMap.has(row.group_name)) groupMap.set(row.group_name, []);
      groupMap.get(row.group_name)!.push(row.team_id);
    }

    // Generate round-robin matches per group using circle method
    const allMatches: Array<{ homeTeamId: string; awayTeamId: string; groupName: string; roundNum: number }> = [];

    for (const [groupName, teamIds] of groupMap) {
      const matches = this.circleMethodRoundRobin(teamIds);
      if (randomOrder) {
        // Fisher-Yates shuffle
        for (let i = matches.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [matches[i], matches[j]] = [matches[j], matches[i]];
        }
      }
      matches.forEach((m, idx) => allMatches.push({ ...m, groupName, roundNum: idx + 1 }));
    }

    // Create or find "Fase de Grupos" phase
    let phaseResult = await this.pool.query<PhaseRow>(
      `SELECT * FROM phases WHERE tournament_id = $1 AND name = 'Fase de Grupos' LIMIT 1`,
      [tournamentId],
    );
    if (phaseResult.rowCount === 0) {
      phaseResult = await this.pool.query<PhaseRow>(
        `INSERT INTO phases (tournament_id, name, format, order_index, status)
         VALUES ($1, 'Fase de Grupos', 'groups', 1, 'pending') RETURNING *`,
        [tournamentId],
      );
    }
    const phaseId = phaseResult.rows[0].id;

    // Delete existing matches for this phase (allows re-generation)
    await this.pool.query(`DELETE FROM matches WHERE phase_id = $1`, [phaseId]);

    // Schedule matches: assign date/time sequentially across venues
    // With N venues, N matches can happen at the same time slot
    const createdMatches: unknown[] = [];
    let currentDate = startDate;
    let matchSlot   = 0; // slot within the day (0 to perDay-1)
    let venueSlot   = 0; // current venue (0 to numVenues-1)

    for (const match of allMatches) {
      // Calculate time for this slot
      const [h, m] = firstTime.split(':').map(Number);
      const startMinutes = h * 60 + m + (matchSlot * durationMin);
      const hours   = Math.floor(startMinutes / 60);
      const minutes = startMinutes % 60;
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      const scheduledAt = `${currentDate}T${timeStr}`;

      // Venue label: "Cancha 1", "Cancha 2", etc.
      const matchVenue = numVenues > 1
        ? `${venueName} ${venueSlot + 1}`
        : venueName;

      const insertResult = await this.pool.query(
        `INSERT INTO matches (phase_id, home_team_id, away_team_id, scheduled_at, venue)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, phase_id, home_team_id, away_team_id, scheduled_at, status, venue`,
        [phaseId, match.homeTeamId, match.awayTeamId, scheduledAt, matchVenue],
      );
      createdMatches.push({ ...insertResult.rows[0], groupName: match.groupName });

      venueSlot++;
      if (venueSlot >= numVenues) {
        // All venues used for this time slot — advance to next slot
        venueSlot = 0;
        matchSlot++;
        if (matchSlot >= perDay) {
          // Day full — advance to next day
          matchSlot = 0;
          const d = new Date(currentDate);
          d.setDate(d.getDate() + 1);
          currentDate = d.toISOString().slice(0, 10);
        }
      }
    }

    return createdMatches;
  }

  /**
   * Circle method for round-robin scheduling.
   * Returns all unique pairings without repetition.
   * For n teams: (n-1) rounds × (n/2) matches per round.
   * If odd n: adds BYE (one team rests each round).
   */
  private circleMethodRoundRobin(teamIds: string[]): Array<{ homeTeamId: string; awayTeamId: string }> {
    const teams = [...teamIds];
    const hasBye = teams.length % 2 !== 0;
    if (hasBye) teams.push('BYE');

    const n = teams.length;
    const rounds = n - 1;
    const matchesPerRound = n / 2;
    const allMatches: Array<{ homeTeamId: string; awayTeamId: string }> = [];

    const fixed    = teams[0];
    const rotating = teams.slice(1);

    for (let r = 0; r < rounds; r++) {
      const roundTeams = [fixed, ...rotating];

      for (let m = 0; m < matchesPerRound; m++) {
        const home = roundTeams[m];
        const away = roundTeams[n - 1 - m];

        // Skip BYE matches
        if (home === 'BYE' || away === 'BYE') continue;

        allMatches.push({ homeTeamId: home, awayTeamId: away });
      }

      // Rotate: move last element to front
      rotating.unshift(rotating.pop()!);
    }

    return allMatches;
  }

  // ── Cups ──────────────────────────────────────────────────────────────────

  async getCups(tournamentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT id, name, order_index AS "orderIndex",
              group_positions_from AS "groupPositionsFrom",
              group_positions_to AS "groupPositionsTo",
              has_semifinals AS "hasSemifinals",
              has_third_place AS "hasThirdPlace"
       FROM tournament_cups WHERE tournament_id = $1 ORDER BY order_index`,
      [tournamentId],
    );
    return result.rows;
  }

  async saveCups(tournamentId: string, cups: Array<{ name: string; orderIndex: number; groupPositionsFrom: number; groupPositionsTo: number; hasSemifinals: boolean; hasThirdPlace: boolean }>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM tournament_cups WHERE tournament_id = $1`, [tournamentId]);
      for (const cup of cups) {
        await client.query(
          `INSERT INTO tournament_cups (tournament_id, name, order_index, group_positions_from, group_positions_to, has_semifinals, has_third_place)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tournamentId, cup.name, cup.orderIndex, cup.groupPositionsFrom, cup.groupPositionsTo, cup.hasSemifinals, cup.hasThirdPlace],
        );
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  }

  // ── Sanction Types ────────────────────────────────────────────────────────

  async getSanctionTypes(tournamentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT id, name, code, points_effect AS "pointsEffect",
              monetary_value AS "monetaryValue", color, icon
       FROM sanction_types WHERE tournament_id = $1 ORDER BY name`,
      [tournamentId],
    );
    return result.rows;
  }

  async saveSanctionTypes(tournamentId: string, types: Array<{ name: string; code: string; pointsEffect: number; monetaryValue: number; color: string; icon: string }>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM sanction_types WHERE tournament_id = $1`, [tournamentId]);
      for (const t of types) {
        await client.query(
          `INSERT INTO sanction_types (tournament_id, name, code, points_effect, monetary_value, color, icon)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tournamentId, t.name, t.code, t.pointsEffect, t.monetaryValue, t.color, t.icon],
        );
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  }

  // ── Public Enrollment ─────────────────────────────────────────────────────

  /**
   * Self-enrollment: creates team + players + enrollment in a transaction.
   * Team is created with tournament_id set. Enrollment status = 'pending'.
   */
  async enrollTeam(tournamentId: string, data: {
    teamName: string;
    shortName?: string;
    contactName: string;
    contactPhone: string;
    contactEmail?: string;
    players: Array<{ name: string; jerseyNumber: number; position?: string }>;
  }): Promise<{ teamId: string; enrollmentId: string }> {
    // Verify tournament exists and is accepting enrollments
    const tResult = await this.pool.query<TournamentRow>(
      `SELECT id, status FROM tournaments WHERE id = $1`, [tournamentId],
    );
    if (tResult.rowCount === 0) throw new NotFoundError('Tournament', tournamentId);
    if (tResult.rows[0].status === 'finished' || tResult.rows[0].status === 'cancelled') {
      throw new BusinessRuleError('Este torneo no acepta inscripciones');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create team
      const teamResult = await client.query<{ id: string }>(
        `INSERT INTO teams (tournament_id, name, short_name, phone, email, status)
         VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
        [tournamentId, data.teamName, data.shortName || null, data.contactPhone, data.contactEmail || null],
      );
      const teamId = teamResult.rows[0].id;

      // Create players
      for (const player of data.players) {
        await client.query(
          `INSERT INTO players (team_id, name, jersey_number, position)
           VALUES ($1, $2, $3, $4)`,
          [teamId, player.name, player.jerseyNumber, player.position || null],
        );
      }

      // Create enrollment record
      const enrollResult = await client.query<{ id: string }>(
        `INSERT INTO tournament_enrollments (tournament_id, team_id, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [tournamentId, teamId],
      );
      const enrollmentId = enrollResult.rows[0].id;

      await client.query('COMMIT');
      return { teamId, enrollmentId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Venues ─────────────────────────────────────────────────────────────────

  async getVenues(tournamentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT * FROM venues WHERE tournament_id = $1 ORDER BY name`, [tournamentId]);
    return result.rows.map((r: Record<string, unknown>) => ({
      id: r['id'], name: r['name'], address: r['address'],
      locationUrl: r['location_url'], capacity: r['capacity'],
      surfaceType: r['surface_type'], isActive: r['is_active'],
    }));
  }

  async createVenue(tournamentId: string, data: { name: string; address?: string; locationUrl?: string; capacity?: number; surfaceType?: string }): Promise<unknown> {
    const result = await this.pool.query(
      `INSERT INTO venues (tournament_id, name, address, location_url, capacity, surface_type)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tournamentId, data.name, data.address ?? null, data.locationUrl ?? null, data.capacity ?? null, data.surfaceType ?? null]);
    const r = result.rows[0] as Record<string, unknown>;
    return { id: r['id'], name: r['name'], address: r['address'], locationUrl: r['location_url'], capacity: r['capacity'], surfaceType: r['surface_type'] };
  }

  async updateVenue(venueId: string, data: Record<string, unknown>): Promise<unknown> {
    const fields: string[] = []; const values: unknown[] = []; let idx = 1;
    if (data['name'] !== undefined) { fields.push(`name=$${idx++}`); values.push(data['name']); }
    if (data['address'] !== undefined) { fields.push(`address=$${idx++}`); values.push(data['address']); }
    if (data['locationUrl'] !== undefined) { fields.push(`location_url=$${idx++}`); values.push(data['locationUrl']); }
    if (data['capacity'] !== undefined) { fields.push(`capacity=$${idx++}`); values.push(data['capacity']); }
    if (data['surfaceType'] !== undefined) { fields.push(`surface_type=$${idx++}`); values.push(data['surfaceType']); }
    if (data['isActive'] !== undefined) { fields.push(`is_active=$${idx++}`); values.push(data['isActive']); }
    if (fields.length === 0) return {};
    values.push(venueId);
    const result = await this.pool.query(`UPDATE venues SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`, values);
    return result.rows[0] ?? {};
  }

  async deleteVenue(venueId: string): Promise<void> {
    await this.pool.query(`DELETE FROM venues WHERE id=$1`, [venueId]);
  }

  // ── Announcements ─────────────────────────────────────────────────────────

  async getAnnouncements(tournamentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT a.*, u.name AS author_name FROM announcements a
       LEFT JOIN users u ON u.id = a.author_id
       WHERE a.tournament_id = $1 ORDER BY a.is_pinned DESC, a.published_at DESC`, [tournamentId]);
    return result.rows.map((r: Record<string, unknown>) => ({
      id: r['id'], title: r['title'], content: r['content'],
      priority: r['priority'], isPinned: r['is_pinned'],
      authorName: r['author_name'], publishedAt: (r['published_at'] as Date)?.toISOString(),
      expiresAt: r['expires_at'] ? (r['expires_at'] as Date).toISOString() : null,
    }));
  }

  async createAnnouncement(tournamentId: string, authorId: string, data: { title: string; content: string; priority?: string; isPinned?: boolean }): Promise<unknown> {
    const result = await this.pool.query(
      `INSERT INTO announcements (tournament_id, author_id, title, content, priority, is_pinned)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tournamentId, authorId, data.title, data.content, data.priority ?? 'normal', data.isPinned ?? false]);
    const r = result.rows[0] as Record<string, unknown>;
    return { id: r['id'], title: r['title'], content: r['content'], priority: r['priority'], isPinned: r['is_pinned'], publishedAt: (r['published_at'] as Date)?.toISOString() };
  }

  async deleteAnnouncement(annId: string): Promise<void> {
    await this.pool.query(`DELETE FROM announcements WHERE id=$1`, [annId]);
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  async getPayments(tournamentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT p.*, t.name AS team_name, u.name AS recorded_by_name FROM payments p
       JOIN teams t ON t.id = p.team_id
       LEFT JOIN users u ON u.id = p.recorded_by
       WHERE p.tournament_id = $1 ORDER BY p.paid_at DESC`, [tournamentId]);
    return result.rows.map((r: Record<string, unknown>) => ({
      id: r['id'], teamId: r['team_id'], teamName: r['team_name'],
      amount: r['amount'], currency: r['currency'],
      paymentMethod: r['payment_method'], reference: r['reference'],
      notes: r['notes'], status: r['status'],
      recordedByName: r['recorded_by_name'],
      paidAt: (r['paid_at'] as Date)?.toISOString(),
    }));
  }

  async createPayment(tournamentId: string, recordedBy: string, data: { teamId: string; amount: number; paymentMethod?: string; reference?: string; notes?: string }): Promise<unknown> {
    const result = await this.pool.query(
      `INSERT INTO payments (tournament_id, team_id, amount, payment_method, reference, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tournamentId, data.teamId, data.amount, data.paymentMethod ?? null, data.reference ?? null, data.notes ?? null, recordedBy]);
    const r = result.rows[0] as Record<string, unknown>;
    return { id: r['id'], teamId: r['team_id'], amount: r['amount'], status: r['status'], paidAt: (r['paid_at'] as Date)?.toISOString() };
  }

  async updatePaymentStatus(paymentId: string, status: string): Promise<void> {
    await this.pool.query(`UPDATE payments SET status=$1 WHERE id=$2`, [status, paymentId]);
  }

  // ── Gallery ───────────────────────────────────────────────────────────────

  async getGallery(tournamentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT g.*, u.name AS uploaded_by_name FROM gallery_photos g
       LEFT JOIN users u ON u.id = g.uploaded_by
       WHERE g.tournament_id = $1 ORDER BY g.created_at DESC`, [tournamentId]);
    return result.rows.map((r: Record<string, unknown>) => ({
      id: r['id'], url: r['url'], thumbnailUrl: r['thumbnail_url'],
      caption: r['caption'], matchId: r['match_id'], teamId: r['team_id'],
      uploadedByName: r['uploaded_by_name'], createdAt: (r['created_at'] as Date)?.toISOString(),
    }));
  }

  async addPhoto(tournamentId: string, uploadedBy: string, data: { url: string; thumbnailUrl?: string; caption?: string; matchId?: string; teamId?: string }): Promise<unknown> {
    const result = await this.pool.query(
      `INSERT INTO gallery_photos (tournament_id, uploaded_by, url, thumbnail_url, caption, match_id, team_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tournamentId, uploadedBy, data.url, data.thumbnailUrl ?? null, data.caption ?? null, data.matchId ?? null, data.teamId ?? null]);
    const r = result.rows[0] as Record<string, unknown>;
    return { id: r['id'], url: r['url'], caption: r['caption'], createdAt: (r['created_at'] as Date)?.toISOString() };
  }

  async deletePhoto(photoId: string): Promise<void> {
    await this.pool.query(`DELETE FROM gallery_photos WHERE id=$1`, [photoId]);
  }

  // ── Enrollment Management ─────────────────────────────────────────────────

  async getEnrollments(tournamentId: string, status?: string): Promise<Array<{
    id: string; teamId: string; teamName: string; teamShort: string | null;
    phone: string | null; email: string | null;
    status: string; enrolledAt: string; playerCount: number;
  }>> {
    const conditions = ['te.tournament_id = $1'];
    const values: unknown[] = [tournamentId];

    if (status) {
      conditions.push('te.status = $2');
      values.push(status);
    }

    const result = await this.pool.query<{
      id: string; team_id: string; team_name: string; team_short: string | null;
      phone: string | null; email: string | null;
      status: string; enrolled_at: Date; player_count: number;
    }>(
      `SELECT te.id, te.team_id, t.name AS team_name, t.short_name AS team_short,
              t.phone, t.email, te.status, te.enrolled_at,
              (SELECT COUNT(*)::int FROM players p WHERE p.team_id = t.id AND p.is_active = true) AS player_count
       FROM tournament_enrollments te
       JOIN teams t ON t.id = te.team_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY te.enrolled_at DESC`,
      values,
    );

    return result.rows.map((r) => ({
      id:          r.id,
      teamId:      r.team_id,
      teamName:    r.team_name,
      teamShort:   r.team_short,
      phone:       r.phone,
      email:       r.email,
      status:      r.status,
      enrolledAt:  r.enrolled_at.toISOString(),
      playerCount: r.player_count,
    }));
  }

  async updateEnrollmentStatus(tournamentId: string, enrollmentId: string, status: string): Promise<void> {
    await this.pool.query(
      `UPDATE tournament_enrollments SET status = $1 WHERE id = $2 AND tournament_id = $3`,
      [status, enrollmentId, tournamentId],
    );
  }

  async deleteEnrollment(tournamentId: string, enrollmentId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM tournament_enrollments WHERE id = $1 AND tournament_id = $2`,
      [enrollmentId, tournamentId],
    );
  }
}
