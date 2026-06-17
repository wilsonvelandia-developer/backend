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
        instagram_url, facebook_url, tiktok_url, youtube_url
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
      ) RETURNING *`,
      [
        input.sportId, input.name, input.season, input.maxSubsOverride,
        input.startDate, input.registrationDeadline, input.expectedTeams, input.numGroups,
        input.category, input.birthYearFrom, input.validateBirthFrom, input.birthYearTo, input.validateBirthTo,
        input.contactPhone, input.address, input.locationUrl,
        input.imageUrl, input.description, input.entryFee, input.rulesFileUrl, input.invitationFileUrl,
        input.instagramUrl, input.facebookUrl, input.tiktokUrl, input.youtubeUrl,
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
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if (key in input && (input as Record<string, unknown>)[key] !== undefined) {
        fields.push(`${column} = $${idx++}`);
        values.push((input as Record<string, unknown>)[key]);
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

      // Delete existing draw for this tournament
      await client.query(`DELETE FROM team_groups WHERE tournament_id = $1`, [tournamentId]);

      // Insert new assignments
      for (const a of assignments) {
        await client.query(
          `INSERT INTO team_groups (tournament_id, team_id, group_name, draw_order)
           VALUES ($1, $2, $3, $4)`,
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
}
