/** Row shape returned directly from the database (snake_case). */
export interface AnnouncementRow {
  id:            string;
  tournament_id: string;
  author_id:     string;
  title:         string;
  content:       string;
  priority:      string;
  is_pinned:     boolean;
  published_at:  Date;
  expires_at:    Date | null;
}

/** Domain object (camelCase). */
export interface Announcement {
  id:           string;
  tournamentId: string;
  authorId:     string;
  title:        string;
  content:      string;
  priority:     string;
  isPinned:     boolean;
  publishedAt:  string;
  expiresAt:    string | null;
}

/** Maps a DB row to the domain Announcement object. */
export function mapAnnouncementRow(row: AnnouncementRow): Announcement {
  return {
    id:           row.id,
    tournamentId: row.tournament_id,
    authorId:     row.author_id,
    title:        row.title,
    content:      row.content,
    priority:     row.priority,
    isPinned:     row.is_pinned,
    publishedAt:  row.published_at.toISOString(),
    expiresAt:    row.expires_at ? row.expires_at.toISOString() : null,
  };
}

export interface CreateAnnouncementInput {
  tournamentId: string | null;
  authorId:     string;
  title:        string;
  content:      string;
  priority:     string;
  isPinned:     boolean;
  imageUrl:     string | null;
  expiresAt:    string | null;
}

export interface UpdateAnnouncementInput {
  tournamentId?: string | null;
  title?:    string;
  content?:  string;
  priority?: string;
  status?:   string;
  isPinned?: boolean;
  imageUrl?:  string | null;
  expiresAt?: string | null;
}
