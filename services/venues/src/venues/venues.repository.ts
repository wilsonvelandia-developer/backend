import { Pool } from 'pg';
import { NotFoundError } from '@tournament/shared';
import { VenueRow, Venue, CreateVenueInput, UpdateVenueInput, mapVenueRow } from './venues.types.js';

/**
 * Venues repository — parameterized queries only.
 */
export class VenuesRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(tournamentId?: string, search?: string): Promise<Venue[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (tournamentId) {
      conditions.push(`tournament_id = $${idx}`);
      values.push(tournamentId);
      idx++;
    }
    if (search) {
      conditions.push(`(name ILIKE $${idx} OR address ILIKE $${idx} OR city ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query<VenueRow>(
      `SELECT * FROM venues ${where} ORDER BY name ASC`,
      values,
    );
    return result.rows.map(mapVenueRow);
  }

  async findById(id: string): Promise<Venue> {
    const result = await this.pool.query<VenueRow>(
      `SELECT * FROM venues WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) throw new NotFoundError('Venue', id);
    return mapVenueRow(result.rows[0]);
  }

  async create(input: CreateVenueInput): Promise<Venue> {
    const result = await this.pool.query<VenueRow>(
      `INSERT INTO venues (tournament_id, name, address, city, location_url, map_url, capacity, surface_type, image_url, phone, email, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        input.tournamentId, input.name, input.address, input.city,
        input.locationUrl, input.mapUrl, input.capacity, input.surfaceType,
        input.imageUrl, input.phone, input.email, input.description,
      ],
    );
    return mapVenueRow(result.rows[0]);
  }

  async update(id: string, input: UpdateVenueInput): Promise<Venue> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      name: 'name', address: 'address', city: 'city',
      locationUrl: 'location_url', mapUrl: 'map_url',
      capacity: 'capacity', surfaceType: 'surface_type',
      imageUrl: 'image_url', phone: 'phone', email: 'email',
      description: 'description', isActive: 'is_active', status: 'status',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if (key in input && (input as Record<string, unknown>)[key] !== undefined) {
        fields.push(`${column} = $${idx}`);
        values.push((input as Record<string, unknown>)[key]);
        idx++;
      }
    }

    if (fields.length === 0) throw new NotFoundError('Venue', id);

    fields.push(`updated_at = NOW()`);
    values.push(id);
    const result = await this.pool.query<VenueRow>(
      `UPDATE venues SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (result.rowCount === 0) throw new NotFoundError('Venue', id);
    return mapVenueRow(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    const result = await this.pool.query(`DELETE FROM venues WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError('Venue', id);
  }
}
