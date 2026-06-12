import { Pool } from 'pg';
import { NotFoundError, ConflictError } from '@tournament/shared';
import {
  SportRow,
  CreateSportInput,
  UpdateSportInput,
  mapSportRow,
} from './sports.types.js';
import { Sport } from '@tournament/shared';

/**
 * Sports repository — all DB access for the sports domain.
 *
 * Rules:
 *  - Only parameterized queries ($1, $2 ...) — never string concatenation.
 *  - Returns domain objects (Sport), never raw rows.
 *  - Throws typed AppError subclasses so the error handler can map to HTTP codes.
 */
export class SportsRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Returns all sports ordered alphabetically by name.
   */
  async findAll(): Promise<Sport[]> {
    const result = await this.pool.query<SportRow>(
      `SELECT * FROM sports ORDER BY name ASC`,
    );
    return result.rows.map(mapSportRow);
  }

  /**
   * Returns a single sport by UUID.
   * Throws NotFoundError if not found.
   */
  async findById(id: string): Promise<Sport> {
    const result = await this.pool.query<SportRow>(
      `SELECT * FROM sports WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Sport', id);
    }
    return mapSportRow(result.rows[0]);
  }

  /**
   * Returns a single sport by slug.
   * Throws NotFoundError if not found.
   */
  async findBySlug(slug: string): Promise<Sport> {
    const result = await this.pool.query<SportRow>(
      `SELECT * FROM sports WHERE slug = $1`,
      [slug],
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Sport', slug);
    }
    return mapSportRow(result.rows[0]);
  }

  /**
   * Creates a new sport.
   * Throws ConflictError if name or slug already exists.
   */
  async create(input: CreateSportInput): Promise<Sport> {
    try {
      const result = await this.pool.query<SportRow>(
        `INSERT INTO sports (
          name, slug, players_per_team, has_sets, sets_to_win,
          points_per_set, decisive_set_points, win_margin,
          periods_per_match, max_substitutions, has_rotation
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *`,
        [
          input.name,
          input.slug,
          input.playersPerTeam,
          input.hasSets,
          input.setsToWin,
          input.pointsPerSet,
          input.decisiveSetPoints,
          input.winMargin,
          input.periodsPerMatch,
          input.maxSubstitutions,
          input.hasRotation,
        ],
      );
      return mapSportRow(result.rows[0]);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === '23505'
      ) {
        throw new ConflictError(`A sport with that name or slug already exists`);
      }
      throw err;
    }
  }

  /**
   * Updates an existing sport.
   * Only updates fields present in the input object.
   * Throws NotFoundError if sport does not exist.
   */
  async update(id: string, input: UpdateSportInput): Promise<Sport> {
    // Build SET clause dynamically from provided fields
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const columnMap: Record<keyof UpdateSportInput, string> = {
      name:               'name',
      slug:               'slug',
      playersPerTeam:     'players_per_team',
      hasSets:            'has_sets',
      setsToWin:          'sets_to_win',
      pointsPerSet:       'points_per_set',
      decisiveSetPoints:  'decisive_set_points',
      winMargin:          'win_margin',
      periodsPerMatch:    'periods_per_match',
      maxSubstitutions:   'max_substitutions',
      hasRotation:        'has_rotation',
    };

    for (const [key, column] of Object.entries(columnMap) as [keyof UpdateSportInput, string][]) {
      if (key in input && input[key] !== undefined) {
        fields.push(`${column} = $${idx}`);
        values.push(input[key]);
        idx++;
      }
    }

    // Always update updated_at
    fields.push(`updated_at = NOW()`);
    values.push(id); // last param for WHERE clause

    const result = await this.pool.query<SportRow>(
      `UPDATE sports SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Sport', id);
    }
    return mapSportRow(result.rows[0]);
  }

  /**
   * Deletes a sport by UUID.
   * Throws NotFoundError if not found.
   */
  async delete(id: string): Promise<void> {
    const result = await this.pool.query(
      `DELETE FROM sports WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Sport', id);
    }
  }
}
