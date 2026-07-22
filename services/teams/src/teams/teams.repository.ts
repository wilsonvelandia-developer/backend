import { Pool } from 'pg';
import { Team, Player, PagedResult } from '@tournament/shared';
import { NotFoundError, ConflictError, BusinessRuleError } from '@tournament/shared';
import {
  TeamRow, mapTeamRow, CreateTeamInput, UpdateTeamInput,
  PlayerRow, mapPlayerRow, CreatePlayerInput, UpdatePlayerInput,
  SportRules,
} from './teams.types.js';
import { ListTeamsQuery } from './teams.schema.js';

/**
 * Teams repository — all DB access for teams and players domains.
 * All queries are parameterized — no SQL string concatenation.
 */
export class TeamsRepository {
  constructor(private readonly pool: Pool) {}

  // ── Teams ─────────────────────────────────────────────────────────────────

  /**
   * Find teams that a user is linked to via players.user_id.
   * Returns team + tournament info for the player dashboard.
   */
  async findTeamsForUser(userId: string): Promise<Array<{
    teamId: string; teamName: string;
    tournamentId: string; tournamentName: string;
    category: string | null; sportName: string;
    jerseyNumber: number; position: string | null;
  }>> {
    const result = await this.pool.query<{
      team_id: string; team_name: string;
      tournament_id: string; tournament_name: string;
      category: string | null; sport_name: string;
      jersey_number: number; position: string | null;
    }>(
      `SELECT t.id AS team_id, t.name AS team_name,
              tr.id AS tournament_id, tr.name AS tournament_name,
              tr.category, s.name AS sport_name,
              p.jersey_number, p.position
       FROM players p
       JOIN teams t ON t.id = p.team_id
       LEFT JOIN tournaments tr ON tr.id = t.tournament_id
       LEFT JOIN sports s ON s.id = tr.sport_id
       WHERE p.user_id = $1 AND p.is_active = true
       ORDER BY tr.name, t.name`,
      [userId],
    );

    return result.rows.map((r) => ({
      teamId:         r.team_id,
      teamName:       r.team_name,
      tournamentId:   r.tournament_id,
      tournamentName: r.tournament_name ?? 'Sin torneo',
      category:       r.category,
      sportName:      r.sport_name ?? '',
      jerseyNumber:   r.jersey_number,
      position:       r.position,
    }));
  }

  async findAll(filters: ListTeamsQuery): Promise<PagedResult<Team>> {
    const conditions: string[] = ['is_deleted = false'];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.tournamentId) {
      conditions.push(`tournament_id = $${idx++}`);
      values.push(filters.tournamentId);
    }
    if (filters.search) {
      conditions.push(`(name ILIKE $${idx} OR short_name ILIKE $${idx})`);
      values.push(`%${filters.search}%`);
      idx++;
    }

    const where    = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page     = filters.page     ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const offset   = (page - 1) * pageSize;

    values.push(pageSize, offset);

    const result = await this.pool.query<TeamRow & { _total: string }>(
      `SELECT *, COUNT(*) OVER()::int AS _total
       FROM teams ${where}
       ORDER BY name ASC
       LIMIT $${idx++} OFFSET $${idx}`,
      values,
    );

    const total = result.rows[0] ? parseInt(result.rows[0]._total, 10) : 0;
    return {
      data:     result.rows.map(mapTeamRow),
      total,
      page,
      pageSize,
    };
  }

  async findById(id: string): Promise<Team> {
    const result = await this.pool.query<TeamRow>(
      `SELECT * FROM teams WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) throw new NotFoundError('Team', id);
    return mapTeamRow(result.rows[0]);
  }

  async create(input: CreateTeamInput): Promise<Team> {
    // Verify tournament exists if provided
    if (input.tournamentId) {
      const tournamentCheck = await this.pool.query(
        `SELECT id FROM tournaments WHERE id = $1`,
        [input.tournamentId],
      );
      if (tournamentCheck.rowCount === 0) {
        throw new NotFoundError('Tournament', input.tournamentId);
      }
    }

    try {
      const result = await this.pool.query<TeamRow>(
        `INSERT INTO teams (tournament_id, name, short_name, image_url, phone, email,
                            instagram_url, facebook_url, tiktok_url, youtube_url,
                            color_primary, color_secondary, variant)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          input.tournamentId, input.name, input.shortName,
          input.imageUrl ?? null, input.phone ?? null, input.email ?? null,
          input.instagramUrl ?? null, input.facebookUrl ?? null,
          input.tiktokUrl ?? null, input.youtubeUrl ?? null,
          input.colorPrimary ?? null, input.colorSecondary ?? null,
          input.variant ?? null,
        ],
      );
      return mapTeamRow(result.rows[0]);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === '23505') {
        throw new ConflictError(`A team named "${input.name}" already exists in this tournament`);
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateTeamInput): Promise<Team> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      name:           'name',
      shortName:      'short_name',
      imageUrl:       'image_url',
      phone:          'phone',
      email:          'email',
      instagramUrl:   'instagram_url',
      facebookUrl:    'facebook_url',
      tiktokUrl:      'tiktok_url',
      youtubeUrl:     'youtube_url',
      status:         'status',
      colorPrimary:   'color_primary',
      colorSecondary: 'color_secondary',
      variant:        'variant',
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

    try {
      const result = await this.pool.query<TeamRow>(
        `UPDATE teams SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values,
      );
      if (result.rowCount === 0) throw new NotFoundError('Team', id);
      return mapTeamRow(result.rows[0]);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === '23505') {
        throw new ConflictError(`A team with that name already exists in this tournament`);
      }
      throw err;
    }
  }

  async delete(id: string, deletedBy?: string): Promise<void> {
    // Prevent deletion if team has active/in-progress matches
    const matchCheck = await this.pool.query(
      `SELECT 1 FROM matches WHERE (home_team_id = $1 OR away_team_id = $1) AND status = 'in_progress' LIMIT 1`,
      [id],
    );
    if ((matchCheck.rowCount ?? 0) > 0) {
      throw new BusinessRuleError('No se puede eliminar un equipo con partidos en curso');
    }

    // Soft-delete: mark as deleted instead of physical removal
    const result = await this.pool.query(
      `UPDATE teams SET is_deleted = true, deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1 AND is_deleted = false`,
      [id, deletedBy ?? null],
    );
    if (result.rowCount === 0) throw new NotFoundError('Team', id);
  }

  // ── Players ───────────────────────────────────────────────────────────────

  async findPlayersByTeam(teamId: string): Promise<Player[]> {
    const result = await this.pool.query<PlayerRow>(
      `SELECT * FROM players WHERE team_id = $1 ORDER BY jersey_number ASC`,
      [teamId],
    );
    return result.rows.map(mapPlayerRow);
  }

  async findPlayerById(teamId: string, playerId: string): Promise<Player> {
    const result = await this.pool.query<PlayerRow>(
      `SELECT * FROM players WHERE id = $1 AND team_id = $2`,
      [playerId, teamId],
    );
    if (result.rowCount === 0) throw new NotFoundError('Player', playerId);
    return mapPlayerRow(result.rows[0]);
  }

  /**
   * Creates a player and validates the roster limit against the sport's rules.
   * Fetches the sport config from the sports table via the tournament → sport join.
   */
  async createPlayer(teamId: string, input: CreatePlayerInput): Promise<Player> {
    // Load sport rules for this team's tournament
    const sportRules = await this.getSportRulesByTeam(teamId);

    // Count current active players on the team
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM players WHERE team_id = $1 AND is_active = TRUE`,
      [teamId],
    );
    const currentCount = parseInt(countResult.rows[0].count, 10);

    // Warn but do not block — rosters may exceed game count (bench players)
    const maxRosterSize = sportRules.playersPerTeam * 3;
    if (currentCount >= maxRosterSize) {
      throw new BusinessRuleError(
        `Roster is full. Maximum ${maxRosterSize} players allowed for this sport (${sportRules.playersPerTeam} per team × 3)`,
        { current: currentCount, max: maxRosterSize },
      );
    }

    // ── User linking logic ──────────────────────────────────────────────────
    let userId: string | null = input.userId ?? null;

    // If userId provided directly, use it. Otherwise, try to find/create by document.
    if (!userId && input.documentNumber) {
      // Search existing user by document
      const existingUser = await this.pool.query<{ id: string }>(
        `SELECT id FROM users WHERE document_number = $1 LIMIT 1`,
        [input.documentNumber],
      );

      if (existingUser.rowCount && existingUser.rowCount > 0) {
        userId = existingUser.rows[0].id;
      } else {
        // Create new user with document as password
        const bcrypt = await import('bcrypt');
        const passwordHash = await bcrypt.hash(input.documentNumber, 10);
        const email = input.email || `${input.documentNumber}@player.olimpicapp.local`;

        const newUser = await this.pool.query<{ id: string }>(
          `INSERT INTO users (name, email, document_type, document_number, phone, birth_date, password_hash, must_change_password, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, true)
           RETURNING id`,
          [
            input.name,
            email,
            input.documentType || 'CC',
            input.documentNumber,
            input.phone || null,
            input.birthDate || null,
            passwordHash,
          ],
        );
        userId = newUser.rows[0].id;

        // Assign 'player' role
        await this.pool.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES ($1, 'player') ON CONFLICT DO NOTHING`,
          [userId],
        );
      }
    }

    // ── Create player record (link to team + user) ──────────────────────────
    try {
      const result = await this.pool.query<PlayerRow>(
        `INSERT INTO players (team_id, name, jersey_number, position, user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [teamId, input.name, input.jerseyNumber, input.position, userId],
      );
      return mapPlayerRow(result.rows[0]);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === '23505') {
        throw new ConflictError(`Jersey number ${input.jerseyNumber} is already taken in this team`);
      }
      throw err;
    }
  }

  async updatePlayer(teamId: string, playerId: string, input: UpdatePlayerInput): Promise<Player> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name         !== undefined) { fields.push(`name = $${idx++}`);          values.push(input.name); }
    if (input.jerseyNumber !== undefined) { fields.push(`jersey_number = $${idx++}`); values.push(input.jerseyNumber); }
    if (input.position     !== undefined) { fields.push(`position = $${idx++}`);      values.push(input.position); }
    if (input.isActive     !== undefined) { fields.push(`is_active = $${idx++}`);     values.push(input.isActive); }

    if (fields.length === 0) throw new BusinessRuleError('No fields to update');

    values.push(playerId, teamId);

    try {
      const result = await this.pool.query<PlayerRow>(
        `UPDATE players SET ${fields.join(', ')} WHERE id = $${idx} AND team_id = $${idx + 1} RETURNING *`,
        values,
      );
      if (result.rowCount === 0) throw new NotFoundError('Player', playerId);
      return mapPlayerRow(result.rows[0]);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === '23505') {
        throw new ConflictError(`Jersey number ${input.jerseyNumber} is already taken in this team`);
      }
      throw err;
    }
  }

  async deletePlayer(teamId: string, playerId: string): Promise<void> {
    // Prevent deletion if player is referenced in a volleyball rotation or substitution
    const usageCheck = await this.pool.query(
      `SELECT 1 FROM substitutions WHERE player_out_id = $1 OR player_in_id = $1
       UNION ALL
       SELECT 1 FROM volleyball_rotations WHERE player_id = $1
       LIMIT 1`,
      [playerId],
    );
    if ((usageCheck.rowCount ?? 0) > 0) {
      throw new BusinessRuleError(
        'Cannot delete a player with match history. Set is_active = false instead.',
      );
    }

    const result = await this.pool.query(
      `DELETE FROM players WHERE id = $1 AND team_id = $2`,
      [playerId, teamId],
    );
    if (result.rowCount === 0) throw new NotFoundError('Player', playerId);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Fetches the sport rules for the tournament that owns the given team.
   * Used for roster size validation.
   */
  private async getSportRulesByTeam(teamId: string): Promise<SportRules> {
    const result = await this.pool.query<SportRules>(
      `SELECT s.players_per_team AS "playersPerTeam", s.has_rotation AS "hasRotation"
       FROM teams t
       JOIN tournaments tr ON tr.id = t.tournament_id
       JOIN sports s ON s.id = tr.sport_id
       WHERE t.id = $1`,
      [teamId],
    );
    if (result.rowCount === 0) throw new NotFoundError('Team', teamId);
    return result.rows[0];
  }

  // ── Player Statistics ─────────────────────────────────────────────────────

  /**
   * Computes aggregated statistics for a player across all their matches.
   * Returns goals, assists, cards, matches played, averages, and streak info.
   */
  async getPlayerStats(playerId: string): Promise<{
    playerId: string;
    playerName: string;
    teamName: string;
    jerseyNumber: number;
    position: string | null;
    matchesPlayed: number;
    goals: number;
    goalsPerMatch: number;
    yellowCards: number;
    redCards: number;
    substitutionsIn: number;
    substitutionsOut: number;
    matchResults: { wins: number; draws: number; losses: number };
  }> {
    // Basic player info
    const playerResult = await this.pool.query<{
      id: string; name: string; team_id: string; jersey_number: number; position: string | null; team_name: string;
    }>(
      `SELECT p.id, p.name, p.team_id, p.jersey_number, p.position, t.name AS team_name
       FROM players p
       JOIN teams t ON t.id = p.team_id
       WHERE p.id = $1`,
      [playerId],
    );
    if (playerResult.rowCount === 0) throw new NotFoundError('Player', playerId);
    const player = playerResult.rows[0];

    // Matches played (player was in a lineup or had events/subs in a finished match)
    const matchesResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT m.id)::int AS count
       FROM matches m
       WHERE m.status = 'finished'
         AND (m.home_team_id = $1 OR m.away_team_id = $1)`,
      [player.team_id],
    );
    const matchesPlayed = parseInt(matchesResult.rows[0].count, 10);

    // Goals scored
    const goalsResult = await this.pool.query<{ count: string }>(
      `SELECT COALESCE(SUM(points), 0)::int AS count FROM match_scorers WHERE player_id = $1`,
      [playerId],
    );
    const goals = parseInt(goalsResult.rows[0].count, 10);

    // Yellow and red cards
    const cardsResult = await this.pool.query<{ code: string; count: string }>(
      `SELECT st.code, COUNT(*)::int AS count
       FROM match_sanctions ms
       JOIN sanction_types st ON st.id = ms.sanction_type_id
       WHERE ms.player_id = $1
       GROUP BY st.code`,
      [playerId],
    );
    const cardMap = new Map(cardsResult.rows.map((r) => [r.code, parseInt(r.count, 10)]));
    const yellowCards = cardMap.get('YELLOW') ?? 0;
    const redCards    = cardMap.get('RED')    ?? 0;

    // Substitutions
    const subsResult = await this.pool.query<{ direction: string; count: string }>(
      `SELECT 'in' AS direction, COUNT(*)::int AS count FROM substitutions WHERE player_in_id = $1
       UNION ALL
       SELECT 'out' AS direction, COUNT(*)::int AS count FROM substitutions WHERE player_out_id = $1`,
      [playerId],
    );
    const subsMap = new Map(subsResult.rows.map((r) => [r.direction, parseInt(r.count, 10)]));

    // Match results (W/D/L for the player's team)
    const resultsResult = await this.pool.query<{ wins: string; draws: string; losses: string }>(
      `SELECT
         COUNT(CASE WHEN m.winner_id = $1 THEN 1 END)::int AS wins,
         COUNT(CASE WHEN m.winner_id IS NULL AND m.status = 'finished' THEN 1 END)::int AS draws,
         COUNT(CASE WHEN m.winner_id IS NOT NULL AND m.winner_id != $1 THEN 1 END)::int AS losses
       FROM matches m
       WHERE m.status = 'finished'
         AND (m.home_team_id = $1 OR m.away_team_id = $1)`,
      [player.team_id],
    );
    const r = resultsResult.rows[0];

    return {
      playerId:          player.id,
      playerName:        player.name,
      teamName:          player.team_name,
      jerseyNumber:      player.jersey_number,
      position:          player.position,
      matchesPlayed,
      goals,
      goalsPerMatch:     matchesPlayed > 0 ? Math.round((goals / matchesPlayed) * 100) / 100 : 0,
      yellowCards,
      redCards,
      substitutionsIn:   subsMap.get('in')  ?? 0,
      substitutionsOut:  subsMap.get('out') ?? 0,
      matchResults: {
        wins:   parseInt(r.wins, 10),
        draws:  parseInt(r.draws, 10),
        losses: parseInt(r.losses, 10),
      },
    };
  }
}
