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

    // Only show top-level entries (albums), not child photos
    conditions.push('parent_id IS NULL');

    const where = `WHERE ${conditions.join(' AND ')}`;
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
    const url = input.url || input.coverUrl || 'https://img.icons8.com/3d-fluency/256/photo-gallery.png';
    const caption = input.caption || null;

    const result = await this.pool.query<GalleryPhotoRow>(
      `INSERT INTO gallery_photos (tournament_id, match_id, team_id, uploaded_by, url, thumbnail_url, caption, title, description, cover_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.tournamentId, input.matchId, input.teamId, input.uploadedBy,
        url, input.thumbnailUrl, caption,
        input.title || null, input.description || null, input.coverUrl || null,
      ],
    );
    return mapGalleryPhotoRow(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    const result = await this.pool.query(`DELETE FROM gallery_photos WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError('GalleryPhoto', id);
  }

  // ── Album Photos ────────────────────────────────────────────────────────

  /**
   * Returns all photos belonging to an album (parent_id = albumId).
   */
  async getAlbumPhotos(albumId: string): Promise<Array<{ id: string; imageUrl: string; createdAt: string }>> {
    const result = await this.pool.query<{ id: string; url: string; created_at: Date }>(
      `SELECT id, url, created_at FROM gallery_photos WHERE parent_id = $1 ORDER BY created_at ASC`,
      [albumId],
    );
    return result.rows.map((r) => ({
      id: r.id,
      imageUrl: r.url,
      createdAt: r.created_at.toISOString(),
    }));
  }

  /**
   * Adds a photo to an album.
   */
  async addPhotoToAlbum(albumId: string, imageUrl: string, uploadedBy: string | null): Promise<{ id: string; imageUrl: string }> {
    // Get album's tournament_id to inherit
    const album = await this.pool.query<{ tournament_id: string | null }>(
      `SELECT tournament_id FROM gallery_photos WHERE id = $1`,
      [albumId],
    );
    const tournamentId = album.rows[0]?.tournament_id ?? null;

    const result = await this.pool.query<{ id: string; url: string }>(
      `INSERT INTO gallery_photos (parent_id, tournament_id, uploaded_by, url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, url`,
      [albumId, tournamentId, uploadedBy, imageUrl],
    );
    return { id: result.rows[0].id, imageUrl: result.rows[0].url };
  }

  /**
   * Removes a photo from an album by URL.
   */
  async removePhotoFromAlbum(albumId: string, imageUrl: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM gallery_photos WHERE parent_id = $1 AND url = $2`,
      [albumId, imageUrl],
    );
  }
}
