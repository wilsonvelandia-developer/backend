import { Pool } from 'pg';
import { NotFoundError } from '@tournament/shared';
import { AnnouncementRow, Announcement, CreateAnnouncementInput, UpdateAnnouncementInput, mapAnnouncementRow } from './announcements.types.js';

/**
 * Announcements repository — parameterized queries only.
 */
export class AnnouncementsRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(tournamentId?: string, priority?: string): Promise<Announcement[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (tournamentId) {
      conditions.push(`tournament_id = $${idx}`);
      values.push(tournamentId);
      idx++;
    }
    if (priority) {
      conditions.push(`priority = $${idx}`);
      values.push(priority);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query<AnnouncementRow>(
      `SELECT * FROM announcements ${where} ORDER BY is_pinned DESC, published_at DESC`,
      values,
    );
    return result.rows.map(mapAnnouncementRow);
  }

  async findById(id: string): Promise<Announcement> {
    const result = await this.pool.query<AnnouncementRow>(
      `SELECT * FROM announcements WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) throw new NotFoundError('Announcement', id);
    return mapAnnouncementRow(result.rows[0]);
  }

  async create(input: CreateAnnouncementInput): Promise<Announcement> {
    const result = await this.pool.query<AnnouncementRow>(
      `INSERT INTO announcements (tournament_id, author_id, title, content, priority, is_pinned, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [input.tournamentId, input.authorId, input.title, input.content, input.priority, input.isPinned, input.expiresAt],
    );
    return mapAnnouncementRow(result.rows[0]);
  }

  async update(id: string, input: UpdateAnnouncementInput): Promise<Announcement> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      title: 'title', content: 'content', priority: 'priority',
      isPinned: 'is_pinned', expiresAt: 'expires_at',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if (key in input && (input as Record<string, unknown>)[key] !== undefined) {
        fields.push(`${column} = $${idx}`);
        values.push((input as Record<string, unknown>)[key]);
        idx++;
      }
    }

    values.push(id);
    const result = await this.pool.query<AnnouncementRow>(
      `UPDATE announcements SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (result.rowCount === 0) throw new NotFoundError('Announcement', id);
    return mapAnnouncementRow(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    const result = await this.pool.query(`DELETE FROM announcements WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError('Announcement', id);
  }
}
