import { Pool } from 'pg';
import { NotFoundError } from '@tournament/shared';
import { GalleryPhotoRow, GalleryPhoto, CreateGalleryPhotoInput, mapGalleryPhotoRow } from './gallery.types.js';

/**
 * Gallery repository — parameterized queries only.
 */
export class GalleryRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(tournamentId?: string, matchId?: string, teamId?: string): Promise<GalleryPhoto[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (tournamentId) {
      conditions.push(`tournament_id = $${idx}`);
      values.push(tournamentId);
      idx++;
    }
    if (matchId) {
      conditions.push(`match_id = $${idx}`);
      values.push(matchId);
      idx++;
    }
    if (teamId) {
      conditions.push(`team_id = $${idx}`);
      values.push(teamId);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query<GalleryPhotoRow>(
      `SELECT * FROM gallery_photos ${where} ORDER BY created_at DESC`,
      values,
    );
    return result.rows.map(mapGalleryPhotoRow);
  }

  async findById(id: string): Promise<GalleryPhoto> {
    const result = await this.pool.query<GalleryPhotoRow>(
      `SELECT * FROM gallery_photos WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) throw new NotFoundError('GalleryPhoto', id);
    return mapGalleryPhotoRow(result.rows[0]);
  }

  async create(input: CreateGalleryPhotoInput): Promise<GalleryPhoto> {
    // For album-style creation (title + coverUrl), use coverUrl as url and title as caption
    const url = input.url || input.coverUrl || 'https://img.icons8.com/3d-fluency/256/photo-gallery.png';
    const caption = input.caption || input.title || null;

    const result = await this.pool.query<GalleryPhotoRow>(
      `INSERT INTO gallery_photos (tournament_id, match_id, team_id, uploaded_by, url, thumbnail_url, caption)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [input.tournamentId, input.matchId, input.teamId, input.uploadedBy, url, input.thumbnailUrl, caption],
    );
    return mapGalleryPhotoRow(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    const result = await this.pool.query(`DELETE FROM gallery_photos WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError('GalleryPhoto', id);
  }
}
