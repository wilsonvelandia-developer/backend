import { Pool } from 'pg';
import { Tournament, Phase, PagedResult } from '@tournament/shared';
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

  async findAll(filters: ListTournamentsQuery): Promise<PagedResult<Tournament>> {
    const conditions: string[] = ['is_deleted = false'];
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
    const page     = filters.page     ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset   = (page - 1) * pageSize;

    values.push(pageSize, offset);

    // COUNT(*) OVER() gives total matching rows in one query (no separate COUNT needed)
    const result = await this.pool.query<TournamentRow & { _total: string }>(
      `SELECT *, COUNT(*) OVER()::int AS _total
       FROM tournaments ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      values,
    );

    const total = result.rows[0] ? parseInt(result.rows[0]._total, 10) : 0;
    return {
      data:     result.rows.map(mapTournamentRow),
      total,
      page,
      pageSize,
    };
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

  async delete(id: string, deletedBy?: string): Promise<void> {
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

    // Soft-delete: mark as deleted instead of physical removal
    const result = await this.pool.query(
      `UPDATE tournaments SET is_deleted = true, deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1 AND is_deleted = false`,
      [id, deletedBy ?? null],
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
    // Cannot delete a phase that has active or finished matches
    const activeMatchCheck = await this.pool.query(
      `SELECT 1 FROM matches WHERE phase_id = $1 AND status IN ('in_progress', 'finished') LIMIT 1`,
      [phaseId],
    );
    if ((activeMatchCheck.rowCount ?? 0) > 0) {
      throw new BusinessRuleError(
        'No se puede eliminar una fase que tiene partidos en curso o finalizados. Elimina o revierte los partidos primero.',
      );
    }

    // Delete any scheduled (unplayed) matches first — safe to remove
    await this.pool.query(
      `DELETE FROM matches WHERE phase_id = $1 AND status = 'scheduled'`,
      [phaseId],
    );

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
   * Automatic group draw — distributes teams across groups based on the chosen mode.
   * Saves the result using saveGroupDraw (same table), so it can be adjusted manually after.
   */
  async autoDrawGroups(
    tournamentId: string,
    options: { mode: 'random' | 'serpentine' | 'seeded'; numGroups?: number },
  ): Promise<{ groups: unknown[]; warnings: string[] }> {
    // Load tournament to get num_groups config and club separation setting
    const tResult = await this.pool.query<{ num_groups: number | null; expected_teams: number | null; enforce_club_separation: boolean }>(
      `SELECT num_groups, expected_teams, enforce_club_separation FROM tournaments WHERE id = $1`,
      [tournamentId],
    );
    if (tResult.rowCount === 0) throw new NotFoundError('Tournament', tournamentId);

    const numGroups = options.numGroups ?? tResult.rows[0].num_groups ?? 2;
    const enforceClubSeparation = tResult.rows[0].enforce_club_separation;

    // Load all teams registered for this tournament
    const teamsResult = await this.pool.query<{ id: string; name: string; club_name: string | null }>(
      `SELECT id, name, club_name FROM teams WHERE tournament_id = $1 AND is_deleted = false ORDER BY name`,
      [tournamentId],
    );
    if (teamsResult.rowCount === 0) {
      throw new BusinessRuleError('No hay equipos registrados en este torneo para realizar el sorteo.');
    }

    const teams = teamsResult.rows;
    if (teams.length < numGroups * 2) {
      throw new BusinessRuleError(`Se necesitan al menos ${numGroups * 2} equipos para ${numGroups} grupos.`);
    }

    // Generate group labels: A, B, C, D, ...
    const groupLabels = Array.from({ length: numGroups }, (_, i) => String.fromCharCode(65 + i));

    // If club separation is enabled, use constraint-aware distribution
    let assignments: Array<{ teamId: string; groupName: string; drawOrder: number }>;
    const warnings: string[] = [];

    if (enforceClubSeparation) {
      assignments = this.distributeWithClubSeparation(teams, groupLabels, options.mode, warnings);
    } else {
      assignments = this.distributeSimple(teams, groupLabels, options.mode);
    }

    // Save using the same method as manual draw
    await this.saveGroupDraw(tournamentId, assignments);

    // Return the grouped result for the frontend
    const grouped = new Map<string, Array<{ teamId: string; teamName: string; clubName: string | null; drawOrder: number }>>();
    for (const a of assignments) {
      if (!grouped.has(a.groupName)) grouped.set(a.groupName, []);
      const team = teams.find((t) => t.id === a.teamId);
      grouped.get(a.groupName)!.push({
        teamId: a.teamId,
        teamName: team?.name ?? '',
        clubName: team?.club_name ?? null,
        drawOrder: a.drawOrder,
      });
    }

    const groups = [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([groupName, groupTeams]) => ({
        groupName,
        teams: groupTeams.sort((a, b) => a.drawOrder - b.drawOrder),
      }));

    return { groups, warnings };
  }

  /**
   * Distributes teams across groups ensuring teams from the same club
   * are in different groups when possible. Uses best-effort approach:
   * - If a club has fewer teams than groups: full separation guaranteed
   * - If a club has more teams than groups: distributes as evenly as possible and returns warnings
   */
  private distributeWithClubSeparation(
    teams: Array<{ id: string; name: string; club_name: string | null }>,
    groupLabels: string[],
    mode: 'random' | 'serpentine' | 'seeded',
    warnings: string[] = [],
  ): Array<{ teamId: string; groupName: string; drawOrder: number }> {
    const numGroups = groupLabels.length;

    // Separate teams into clubs and individuals
    const clubMap = new Map<string, Array<{ id: string; name: string }>>();
    const individuals: Array<{ id: string; name: string }> = [];

    for (const team of teams) {
      if (team.club_name) {
        if (!clubMap.has(team.club_name)) clubMap.set(team.club_name, []);
        clubMap.get(team.club_name)!.push(team);
      } else {
        individuals.push(team);
      }
    }

    // Warn (not block) if a club has more teams than groups
    for (const [clubName, clubTeams] of clubMap) {
      if (clubTeams.length > numGroups) {
        warnings.push(
          `El club "${clubName}" tiene ${clubTeams.length} equipos y solo hay ${numGroups} grupos. ` +
          `Se distribuirán lo más equitativamente posible, pero al menos ${clubTeams.length - numGroups} equipos del mismo club quedarán en el mismo grupo.`,
        );
      }
    }

    // Track group sizes for balance
    const groupSizes = new Map<string, number>();
    for (const label of groupLabels) groupSizes.set(label, 0);
    const maxPerGroup = Math.ceil(teams.length / numGroups);

    const assignments: Array<{ teamId: string; groupName: string; drawOrder: number }> = [];

    // Track which clubs are already in which groups (for best-effort separation)
    const clubInGroup = new Map<string, Set<string>>(); // clubName → Set of groupNames

    // Phase 1: Place club teams — spread them as much as possible
    // Sort clubs by size (largest first — hardest constraint first)
    const sortedClubs = [...clubMap.entries()].sort((a, b) => b[1].length - a[1].length);

    for (const [clubName, clubTeams] of sortedClubs) {
      // Shuffle within club if random mode
      if (mode === 'random') {
        for (let i = clubTeams.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [clubTeams[i], clubTeams[j]] = [clubTeams[j], clubTeams[i]];
        }
      }

      if (!clubInGroup.has(clubName)) clubInGroup.set(clubName, new Set());

      for (const team of clubTeams) {
        const usedGroups = clubInGroup.get(clubName)!;

        // Prefer groups that don't already have a team from this club
        const preferredGroups = groupLabels
          .filter((g) => !usedGroups.has(g) && (groupSizes.get(g) ?? 0) < maxPerGroup)
          .sort((a, b) => (groupSizes.get(a) ?? 0) - (groupSizes.get(b) ?? 0));

        // If no preferred groups (all have this club already), use least-filled group
        const fallbackGroups = groupLabels
          .filter((g) => (groupSizes.get(g) ?? 0) < maxPerGroup)
          .sort((a, b) => (groupSizes.get(a) ?? 0) - (groupSizes.get(b) ?? 0));

        const targetGroup = preferredGroups.length > 0
          ? preferredGroups[0]
          : (fallbackGroups[0] ?? groupLabels[0]);

        const order = (groupSizes.get(targetGroup) ?? 0) + 1;
        groupSizes.set(targetGroup, order);
        usedGroups.add(targetGroup);
        assignments.push({ teamId: team.id, groupName: targetGroup, drawOrder: order });
      }
    }

    // Phase 2: Place individual teams (no club) in remaining spots
    if (mode === 'random') {
      for (let i = individuals.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [individuals[i], individuals[j]] = [individuals[j], individuals[i]];
      }
    }

    for (const team of individuals) {
      const leastFilled = groupLabels
        .filter((g) => (groupSizes.get(g) ?? 0) < maxPerGroup)
        .sort((a, b) => (groupSizes.get(a) ?? 0) - (groupSizes.get(b) ?? 0))[0]
        ?? groupLabels[0];

      const order = (groupSizes.get(leastFilled) ?? 0) + 1;
      groupSizes.set(leastFilled, order);
      assignments.push({ teamId: team.id, groupName: leastFilled, drawOrder: order });
    }

    return assignments;
  }

  /**
   * Simple distribution without club constraints (original logic).
   */
  private distributeSimple(
    teams: Array<{ id: string; name: string; club_name: string | null }>,
    groupLabels: string[],
    mode: 'random' | 'serpentine' | 'seeded',
  ): Array<{ teamId: string; groupName: string; drawOrder: number }> {
    const numGroups = groupLabels.length;
    let orderedTeams = [...teams];

    if (mode === 'random') {
      for (let i = orderedTeams.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [orderedTeams[i], orderedTeams[j]] = [orderedTeams[j], orderedTeams[i]];
      }
    }

    const assignments: Array<{ teamId: string; groupName: string; drawOrder: number }> = [];
    const groupCounters = new Map<string, number>();
    for (const label of groupLabels) groupCounters.set(label, 0);

    if (mode === 'serpentine' || mode === 'seeded') {
      let groupIdx = 0;
      let direction = 1;

      for (const team of orderedTeams) {
        const groupName = groupLabels[groupIdx];
        const order = (groupCounters.get(groupName) ?? 0) + 1;
        groupCounters.set(groupName, order);
        assignments.push({ teamId: team.id, groupName, drawOrder: order });

        groupIdx += direction;
        if (groupIdx >= numGroups) { groupIdx = numGroups - 1; direction = -1; }
        else if (groupIdx < 0) { groupIdx = 0; direction = 1; }
      }
    } else {
      for (let i = 0; i < orderedTeams.length; i++) {
        const groupName = groupLabels[i % numGroups];
        const order = (groupCounters.get(groupName) ?? 0) + 1;
        groupCounters.set(groupName, order);
        assignments.push({ teamId: orderedTeams[i].id, groupName, drawOrder: order });
      }
    }

    return assignments;
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
      doubleRoundRobin?: boolean;
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
      let matches = this.circleMethodRoundRobin(teamIds);

      // Double round-robin: add return matches with home/away swapped
      if (config.doubleRoundRobin) {
        const returnMatches = matches.map((m) => ({ homeTeamId: m.awayTeamId, awayTeamId: m.homeTeamId }));
        matches = [...matches, ...returnMatches];
      }

      if (randomOrder) {
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

    // Track home counts per team for balancing
    const homeCounts = new Map<string, number>();
    for (const t of teams) homeCounts.set(t, 0);

    const fixed    = teams[0];
    const rotating = teams.slice(1);

    for (let r = 0; r < rounds; r++) {
      const roundTeams = [fixed, ...rotating];

      for (let m = 0; m < matchesPerRound; m++) {
        let home = roundTeams[m];
        let away = roundTeams[n - 1 - m];

        // Skip BYE matches
        if (home === 'BYE' || away === 'BYE') continue;

        // Balance home/away: swap if 'away' has fewer home games than 'home'
        const homeCount = homeCounts.get(home) ?? 0;
        const awayCount = homeCounts.get(away) ?? 0;
        if (awayCount < homeCount) {
          [home, away] = [away, home];
        }

        homeCounts.set(home, (homeCounts.get(home) ?? 0) + 1);
        allMatches.push({ homeTeamId: home, awayTeamId: away });
      }

      // Rotate: move last element to front
      rotating.unshift(rotating.pop()!);
    }

    return allMatches;
  }

  /**
   * Generates knockout (elimination) phase matches from group standings.
   * Takes the top N teams per group and creates single-elimination bracket matches.
   */
  async generateKnockoutFromStandings(
    tournamentId: string,
    config: {
      teamsPerGroup?: number;
      startDate?: string;
      matchDurationMinutes?: number;
      includeThirdPlace?: boolean;
    },
  ): Promise<unknown[]> {
    const teamsPerGroup = config.teamsPerGroup ?? 2;

    // Load tournament
    const tResult = await this.pool.query<TournamentRow>(
      `SELECT * FROM tournaments WHERE id = $1`, [tournamentId],
    );
    if (tResult.rowCount === 0) throw new NotFoundError('Tournament', tournamentId);
    const tournament = tResult.rows[0];

    // Load standings for the group phase
    const standingsResult = await this.pool.query<{
      team_id: string; group_name: string; points: number;
      score_for: number; score_against: number;
    }>(
      `SELECT s.team_id, tg.group_name, s.points, s.score_for, s.score_against
       FROM standings s
       JOIN phases p ON p.id = s.phase_id
       JOIN team_groups tg ON tg.team_id = s.team_id AND tg.tournament_id = p.tournament_id
       WHERE p.tournament_id = $1 AND p.name = 'Fase de Grupos'
       ORDER BY tg.group_name, s.points DESC, (s.score_for - s.score_against) DESC, s.score_for DESC`,
      [tournamentId],
    );

    if (standingsResult.rowCount === 0) {
      throw new BusinessRuleError('No hay posiciones calculadas. Finaliza los partidos de grupo primero.');
    }

    // Get top N per group
    const groupMap = new Map<string, string[]>();
    for (const row of standingsResult.rows) {
      if (!groupMap.has(row.group_name)) groupMap.set(row.group_name, []);
      const g = groupMap.get(row.group_name)!;
      if (g.length < teamsPerGroup) g.push(row.team_id);
    }

    // Flatten qualified teams in seeded order (1st of A, 1st of B, 2nd of A, 2nd of B...)
    const groups = [...groupMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const qualifiedTeams: string[] = [];
    for (let pos = 0; pos < teamsPerGroup; pos++) {
      for (const [, teams] of groups) {
        if (teams[pos]) qualifiedTeams.push(teams[pos]);
      }
    }

    if (qualifiedTeams.length < 2) {
      throw new BusinessRuleError('Se necesitan al menos 2 equipos clasificados para generar eliminatoria.');
    }

    // Create or find "Fase Eliminatoria" phase
    let phaseResult = await this.pool.query<PhaseRow>(
      `SELECT * FROM phases WHERE tournament_id = $1 AND format = 'single_elim' LIMIT 1`,
      [tournamentId],
    );
    if (phaseResult.rowCount === 0) {
      const maxOrder = await this.pool.query<{ max: number }>(
        `SELECT COALESCE(MAX(order_index), 0) + 1 AS max FROM phases WHERE tournament_id = $1`,
        [tournamentId],
      );
      phaseResult = await this.pool.query<PhaseRow>(
        `INSERT INTO phases (tournament_id, name, format, order_index, status)
         VALUES ($1, 'Fase Eliminatoria', 'single_elim', $2, 'pending') RETURNING *`,
        [tournamentId, maxOrder.rows[0].max],
      );
    }
    const phaseId = phaseResult.rows[0].id;

    // Delete existing knockout matches (allows re-generation)
    await this.pool.query(`DELETE FROM matches WHERE phase_id = $1`, [phaseId]);

    // Generate bracket: pair 1st of group A vs last qualified of group B, etc.
    // Standard seeding: 1A vs 2B, 1B vs 2A (for 2 groups)
    // For 4+ teams: standard bracket seeding
    const n = qualifiedTeams.length;
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
    const seeds = this.generateBracketSeeds(bracketSize);

    // Map seeds to actual teams (BYE for empty slots)
    const bracketTeams: (string | null)[] = seeds.map((s) =>
      s <= n ? qualifiedTeams[s - 1] : null,
    );

    // Create round 1 matches
    const startDate = config.startDate || tournament.start_date || new Date().toISOString().slice(0, 10);
    const durationMin = config.matchDurationMinutes || tournament.match_duration_minutes || 90;
    const createdMatches: unknown[] = [];
    const roundNames = this.getRoundNames(bracketSize / 2);
    let currentDate = startDate;
    let matchIdx = 0;

    for (let i = 0; i < bracketTeams.length; i += 2) {
      const home = bracketTeams[i];
      const away = bracketTeams[i + 1];

      // Skip BYE matches (auto-advance)
      if (!home || !away) continue;

      const [h, m] = (tournament.first_match_time || '08:00').split(':').map(Number);
      const startMinutes = h * 60 + m + (matchIdx * durationMin);
      const hours = Math.floor(startMinutes / 60);
      const minutes = startMinutes % 60;
      const scheduledAt = `${currentDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      const roundLabel = roundNames[0] || 'Ronda 1';

      const result = await this.pool.query(
        `INSERT INTO matches (phase_id, home_team_id, away_team_id, scheduled_at, venue, round)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [phaseId, home, away, scheduledAt, tournament.venue_name || 'Cancha 1', roundLabel],
      );
      createdMatches.push(result.rows[0]);
      matchIdx++;
    }

    return createdMatches;
  }

  /** Generates standard bracket seeding order for N slots. */
  private generateBracketSeeds(n: number): number[] {
    if (n === 1) return [1];
    const prev = this.generateBracketSeeds(n / 2);
    return prev.flatMap((seed) => [seed, n + 1 - seed]);
  }

  /** Maps bracket size to round labels. */
  private getRoundNames(matchCount: number): string[] {
    if (matchCount >= 8) return ['Octavos de final', 'Cuartos de final', 'Semifinal', 'Final'];
    if (matchCount >= 4) return ['Cuartos de final', 'Semifinal', 'Final'];
    if (matchCount >= 2) return ['Semifinal', 'Final'];
    return ['Final'];
  }

  // ── Auto-advance knockout ─────────────────────────────────────────────────

  /**
   * Advances a knockout phase: takes winners from finished matches in the current round
   * and generates matches for the next round (e.g., semifinal → final).
   * Optionally creates a 3rd-place match from the losers of the last round.
   *
   * @param phaseId - The knockout phase to advance
   * @param options.includeThirdPlace - Whether to create a 3rd-place match from losers
   * @param options.scheduledAt - Optional date for the next round matches
   */
  async advanceKnockout(
    phaseId: string,
    options: { includeThirdPlace?: boolean; scheduledAt?: string } = {},
  ): Promise<{ nextRoundMatches: unknown[]; thirdPlaceMatch: unknown | null }> {
    // Load all matches in this phase ordered by round then scheduled_at
    const matchesResult = await this.pool.query<{
      id: string; home_team_id: string; away_team_id: string;
      winner_id: string | null; status: string; round: string | null;
    }>(
      `SELECT id, home_team_id, away_team_id, winner_id, status, round
       FROM matches WHERE phase_id = $1
       ORDER BY round ASC NULLS LAST, scheduled_at ASC, created_at ASC`,
      [phaseId],
    );

    if (matchesResult.rowCount === 0) {
      throw new BusinessRuleError('No hay partidos en esta fase.');
    }

    // Group matches by round
    const roundMap = new Map<string, Array<{ id: string; winnerId: string | null; loserId: string | null; status: string }>>();
    for (const m of matchesResult.rows) {
      const round = m.round ?? 'Ronda';
      if (!roundMap.has(round)) roundMap.set(round, []);
      const loserId = m.winner_id
        ? (m.winner_id === m.home_team_id ? m.away_team_id : m.home_team_id)
        : null;
      roundMap.get(round)!.push({ id: m.id, winnerId: m.winner_id, loserId, status: m.status });
    }

    // Find the latest round that has all matches finished
    const rounds = [...roundMap.entries()];
    let latestFinishedRound: string | null = null;
    let latestFinishedMatches: Array<{ id: string; winnerId: string | null; loserId: string | null }> = [];

    for (const [roundName, matches] of rounds) {
      const allFinished = matches.every((m) => m.status === 'finished');
      if (allFinished && matches.length > 0) {
        latestFinishedRound = roundName;
        latestFinishedMatches = matches;
      }
    }

    if (!latestFinishedRound || latestFinishedMatches.length === 0) {
      throw new BusinessRuleError('No hay ronda completa (todos los partidos finalizados) para avanzar.');
    }

    // Check all matches have a winner
    const winners = latestFinishedMatches.map((m) => m.winnerId).filter(Boolean) as string[];
    const losers  = latestFinishedMatches.map((m) => m.loserId).filter(Boolean) as string[];

    if (winners.length < 2) {
      throw new BusinessRuleError('Se necesitan al menos 2 ganadores para generar la siguiente ronda.');
    }

    // Determine next round name
    const roundNames = this.getRoundNames(winners.length);
    const nextRoundLabel = roundNames.length > 0 ? roundNames[0] : 'Final';

    // Check if next round matches already exist
    const existingNext = await this.pool.query(
      `SELECT 1 FROM matches WHERE phase_id = $1 AND round = $2 LIMIT 1`,
      [phaseId, nextRoundLabel],
    );
    if ((existingNext.rowCount ?? 0) > 0) {
      throw new BusinessRuleError(`La ronda "${nextRoundLabel}" ya tiene partidos creados.`);
    }

    // Generate next round matches (winners paired in order)
    const nextMatches: unknown[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      if (i + 1 >= winners.length) break; // odd number — BYE
      const result = await this.pool.query(
        `INSERT INTO matches (phase_id, home_team_id, away_team_id, scheduled_at, round)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [phaseId, winners[i], winners[i + 1], options.scheduledAt ?? null, nextRoundLabel],
      );
      nextMatches.push(result.rows[0]);
    }

    // Generate 3rd place match from losers if requested
    let thirdPlaceMatch: unknown | null = null;
    if (options.includeThirdPlace && losers.length >= 2) {
      const result = await this.pool.query(
        `INSERT INTO matches (phase_id, home_team_id, away_team_id, scheduled_at, round)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [phaseId, losers[0], losers[1], options.scheduledAt ?? null, 'Tercer puesto'],
      );
      thirdPlaceMatch = result.rows[0];
    }

    return { nextRoundMatches: nextMatches, thirdPlaceMatch };
  }

  // ── Generate knockout by cup position ranges ──────────────────────────────

  /**
   * Generates a knockout phase for a specific cup, using teams from specific
   * group positions (e.g., Copa Oro: positions 1-2, Copa Plata: positions 3-4).
   *
   * @param tournamentId - Tournament ID
   * @param cupId - Cup ID (from tournament_cups table)
   * @param options.startDate - Optional start date for matches
   * @param options.scheduledAt - Optional specific datetime for all matches
   */
  async generateKnockoutByCup(
    tournamentId: string,
    cupId: string,
    options: { startDate?: string; scheduledAt?: string } = {},
  ): Promise<unknown[]> {
    // Load the cup config
    const cupResult = await this.pool.query<{
      id: string; name: string;
      group_positions_from: number; group_positions_to: number;
      has_semifinals: boolean; has_third_place: boolean;
    }>(
      `SELECT id, name, group_positions_from, group_positions_to, has_semifinals, has_third_place
       FROM tournament_cups WHERE id = $1 AND tournament_id = $2`,
      [cupId, tournamentId],
    );
    if (cupResult.rowCount === 0) throw new NotFoundError('Cup', cupId);
    const cup = cupResult.rows[0];

    // Load standings from group phase
    const standingsResult = await this.pool.query<{
      team_id: string; group_name: string; position: number;
    }>(
      `SELECT s.team_id, tg.group_name,
              ROW_NUMBER() OVER (PARTITION BY tg.group_name ORDER BY s.points DESC, (s.score_for - s.score_against) DESC, s.score_for DESC)::int AS position
       FROM standings s
       JOIN phases p ON p.id = s.phase_id
       JOIN team_groups tg ON tg.team_id = s.team_id AND tg.tournament_id = p.tournament_id
       WHERE p.tournament_id = $1 AND p.name = 'Fase de Grupos'`,
      [tournamentId],
    );

    if (standingsResult.rowCount === 0) {
      throw new BusinessRuleError('No hay posiciones calculadas. Finaliza los partidos de grupo primero.');
    }

    // Filter teams by position range for this cup
    const qualifiedTeams: Array<{ teamId: string; groupName: string; position: number }> = [];
    for (const row of standingsResult.rows) {
      if (row.position >= cup.group_positions_from && row.position <= cup.group_positions_to) {
        qualifiedTeams.push({ teamId: row.team_id, groupName: row.group_name, position: row.position });
      }
    }

    if (qualifiedTeams.length < 2) {
      throw new BusinessRuleError(`La ${cup.name} necesita al menos 2 equipos clasificados en posiciones ${cup.group_positions_from}-${cup.group_positions_to}.`);
    }

    // Sort groups alphabetically
    const groups = [...new Set(qualifiedTeams.map((t) => t.groupName))].sort();

    // Standard cross-group seeding for 2 groups:
    // Position X from group A vs Position Y from group B (X cross Y)
    // e.g., 1A vs 2B, 1B vs 2A for Copa Oro; 3A vs 4B, 3B vs 4A for Copa Plata
    const teamsByGroup = new Map<string, Array<{ teamId: string; position: number }>>();
    for (const t of qualifiedTeams) {
      if (!teamsByGroup.has(t.groupName)) teamsByGroup.set(t.groupName, []);
      teamsByGroup.get(t.groupName)!.push({ teamId: t.teamId, position: t.position });
    }

    // Sort each group by position
    for (const [, teams] of teamsByGroup) {
      teams.sort((a, b) => a.position - b.position);
    }

    // Generate cross-group pairings
    const pairings: Array<{ home: string; away: string }> = [];
    if (groups.length === 2) {
      const [groupA, groupB] = groups;
      const teamsA = teamsByGroup.get(groupA) ?? [];
      const teamsB = teamsByGroup.get(groupB) ?? [];
      // Cross: 1st of A vs last of B, 2nd of A vs second-to-last of B, etc.
      for (let i = 0; i < Math.min(teamsA.length, teamsB.length); i++) {
        pairings.push({ home: teamsA[i].teamId, away: teamsB[teamsB.length - 1 - i].teamId });
      }
    } else {
      // For 3+ groups: standard bracket seeding
      const allTeams = qualifiedTeams.sort((a, b) => a.position - b.position || a.groupName.localeCompare(b.groupName));
      for (let i = 0; i < allTeams.length; i += 2) {
        if (i + 1 < allTeams.length) {
          pairings.push({ home: allTeams[i].teamId, away: allTeams[i + 1].teamId });
        }
      }
    }

    // Create or find phase for this cup
    const phaseName = cup.name;
    let phaseResult = await this.pool.query<PhaseRow>(
      `SELECT * FROM phases WHERE tournament_id = $1 AND name = $2 LIMIT 1`,
      [tournamentId, phaseName],
    );
    if (phaseResult.rowCount === 0) {
      const maxOrder = await this.pool.query<{ max: number }>(
        `SELECT COALESCE(MAX(order_index), 0) + 1 AS max FROM phases WHERE tournament_id = $1`,
        [tournamentId],
      );
      phaseResult = await this.pool.query<PhaseRow>(
        `INSERT INTO phases (tournament_id, name, format, order_index, status)
         VALUES ($1, $2, 'single_elim', $3, 'pending') RETURNING *`,
        [tournamentId, phaseName, maxOrder.rows[0].max],
      );
    }
    const phaseId = phaseResult.rows[0].id;

    // Delete existing matches for this phase (re-generation)
    await this.pool.query(`DELETE FROM matches WHERE phase_id = $1 AND status = 'scheduled'`, [phaseId]);

    // Determine round label
    const roundLabel = pairings.length >= 4 ? 'Cuartos de final'
      : pairings.length >= 2 ? 'Semifinal'
      : 'Final';

    // Create matches
    const createdMatches: unknown[] = [];
    for (const pair of pairings) {
      const result = await this.pool.query(
        `INSERT INTO matches (phase_id, home_team_id, away_team_id, scheduled_at, round)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [phaseId, pair.home, pair.away, options.scheduledAt ?? null, roundLabel],
      );
      createdMatches.push(result.rows[0]);
    }

    return createdMatches;
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
    clubName?: string;
    imageUrl?: string;
    colorPrimary?: string;
    colorSecondary?: string;
    instagramUrl?: string;
    facebookUrl?: string;
    tiktokUrl?: string;
    youtubeUrl?: string;
    contactName: string;
    contactPhone: string;
    contactEmail?: string;
    players: Array<{ name: string; jerseyNumber: number; position?: string;
      documentType?: string; documentNumber?: string; email?: string; phone?: string;
      birthDate?: string; photoUrl?: string; documentFrontUrl?: string;
      documentBackUrl?: string; epsFileUrl?: string;
    }>;
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

      // Create team with all enrollment fields
      const teamResult = await client.query<{ id: string }>(
        `INSERT INTO teams (tournament_id, name, short_name, club_name, image_url,
                            color_primary, color_secondary,
                            instagram_url, facebook_url, tiktok_url, youtube_url,
                            phone, email, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active') RETURNING id`,
        [
          tournamentId, data.teamName, data.shortName || null, data.clubName || null,
          data.imageUrl || null, data.colorPrimary || null, data.colorSecondary || null,
          data.instagramUrl || null, data.facebookUrl || null,
          data.tiktokUrl || null, data.youtubeUrl || null,
          data.contactPhone, data.contactEmail || null,
        ],
      );
      const teamId = teamResult.rows[0].id;

      // Create players: personal data → users table only, team link → players table
      const bcrypt = await import('bcrypt');

      for (const player of data.players) {
        let userId: string | null = null;

        // Auto-create user account if document number is provided
        if (player.documentNumber) {
          // Check if user already exists by document
          const existingUser = await client.query<{ id: string }>(
            `SELECT id FROM users WHERE document_number = $1 LIMIT 1`,
            [player.documentNumber],
          );

          if (existingUser.rowCount && existingUser.rowCount > 0) {
            userId = existingUser.rows[0].id;
            // Update user with any new info provided (fill gaps)
            await client.query(
              `UPDATE users SET
                name = COALESCE(NULLIF($2, ''), name),
                phone = COALESCE(NULLIF($3, ''), phone),
                birth_date = COALESCE($4::date, birth_date),
                photo_url = COALESCE(NULLIF($5, ''), photo_url),
                document_front_url = COALESCE(NULLIF($6, ''), document_front_url),
                document_back_url = COALESCE(NULLIF($7, ''), document_back_url),
                eps_file_url = COALESCE(NULLIF($8, ''), eps_file_url),
                updated_at = NOW()
               WHERE id = $1`,
              [
                userId, player.name, player.phone || null,
                player.birthDate || null, player.photoUrl || null,
                player.documentFrontUrl || null, player.documentBackUrl || null,
                player.epsFileUrl || null,
              ],
            );
          } else {
            // Create new user — password = document number (must change on first login)
            const passwordHash = await bcrypt.hash(player.documentNumber, 10);
            const userEmail = player.email || `${player.documentNumber}@player.olimpicapp.local`;

            const newUser = await client.query<{ id: string }>(
              `INSERT INTO users (name, email, document_type, document_number, phone, birth_date,
                                  photo_url, document_front_url, document_back_url, eps_file_url,
                                  password_hash, must_change_password, is_active)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, true)
               RETURNING id`,
              [
                player.name, userEmail,
                player.documentType || 'CC', player.documentNumber,
                player.phone || null, player.birthDate || null,
                player.photoUrl || null, player.documentFrontUrl || null,
                player.documentBackUrl || null, player.epsFileUrl || null,
                passwordHash,
              ],
            );
            userId = newUser.rows[0].id;

            // Assign 'player' role
            await client.query(
              `INSERT INTO user_roles (user_id, role_id) VALUES ($1, 'player') ON CONFLICT DO NOTHING`,
              [userId],
            );
          }
        }

        // Player record: ONLY team-specific fields + link to user (no personal data duplication)
        await client.query(
          `INSERT INTO players (team_id, user_id, name, jersey_number, position)
           VALUES ($1, $2, $3, $4, $5)`,
          [teamId, userId, player.name, player.jerseyNumber, player.position || null],
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

  // ── Venue Courts ──────────────────────────────────────────────────────────

  async getVenueCourts(tournamentId: string, venueId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT id, venue_id AS "venueId", name, court_number AS "courtNumber", is_active AS "isActive"
       FROM venue_courts
       WHERE tournament_id = $1 AND venue_id = $2
       ORDER BY court_number`,
      [tournamentId, venueId],
    );
    return result.rows;
  }

  async saveVenueCourts(
    tournamentId: string,
    venueId: string,
    courts: Array<{ name: string; courtNumber: number }>,
  ): Promise<unknown[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Remove existing courts for this venue+tournament (allows re-configuration)
      await client.query(
        `DELETE FROM venue_courts WHERE tournament_id = $1 AND venue_id = $2`,
        [tournamentId, venueId],
      );
      for (const court of courts) {
        await client.query(
          `INSERT INTO venue_courts (tournament_id, venue_id, name, court_number)
           VALUES ($1, $2, $3, $4)`,
          [tournamentId, venueId, court.name, court.courtNumber],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.getVenueCourts(tournamentId, venueId);
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

  // ── Observations (Veedor / Observer) ──────────────────────────────────────

  /**
   * Returns observations for a tournament.
   * If userId is provided, only returns observations from that user.
   */
  async getObservations(tournamentId: string, userId?: string): Promise<unknown[]> {
    const conditions = ['o.tournament_id = $1'];
    const values: unknown[] = [tournamentId];

    if (userId) {
      conditions.push('o.user_id = $2');
      values.push(userId);
    }

    const result = await this.pool.query(
      `SELECT o.id, o.subject, o.body, o.status, o.match_id AS "matchId",
              o.created_at AS "createdAt",
              u.name AS "observerName"
       FROM observations o
       JOIN users u ON u.id = o.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY o.created_at DESC`,
      values,
    );
    return result.rows;
  }

  /**
   * Creates an observation for a tournament.
   */
  async createObservation(
    tournamentId: string,
    userId: string,
    subject: string,
    body: string,
    matchId?: string,
  ): Promise<unknown> {
    const result = await this.pool.query(
      `INSERT INTO observations (tournament_id, user_id, subject, body, match_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, subject, body, status, match_id AS "matchId", created_at AS "createdAt"`,
      [tournamentId, userId, subject, body, matchId ?? null],
    );
    return result.rows[0];
  }
}
