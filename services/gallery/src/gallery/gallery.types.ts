/** Row shape returned directly from the database (snake_case). */
export interface GalleryPhotoRow {
  id:            string;
  tournament_id: string | null;
  match_id:      string | null;
  team_id:       string | null;
  uploaded_by:   string | null;
  url:           string;
  thumbnail_url: string | null;
  caption:       string | null;
  title:         string | null;
  description:   string | null;
  cover_url:     string | null;
  parent_id:     string | null;
  created_at:    Date;
}

/** Domain object (camelCase). */
export interface GalleryPhoto {
  id:           string;
  tournamentId: string | null;
  matchId:      string | null;
  teamId:       string | null;
  uploadedBy:   string | null;
  url:          string;
  thumbnailUrl: string | null;
  caption:      string | null;
  title:        string | null;
  description:  string | null;
  coverUrl:     string | null;
  createdAt:    string;
}

/** Maps a DB row to the domain GalleryPhoto object. */
export function mapGalleryPhotoRow(row: GalleryPhotoRow): GalleryPhoto {
  return {
    id:           row.id,
    tournamentId: row.tournament_id,
    matchId:      row.match_id,
    teamId:       row.team_id,
    uploadedBy:   row.uploaded_by,
    url:          row.url,
    thumbnailUrl: row.thumbnail_url,
    caption:      row.caption,
    title:        row.title,
    description:  row.description,
    coverUrl:     row.cover_url,
    createdAt:    row.created_at.toISOString(),
  };
}

export interface CreateGalleryPhotoInput {
  tournamentId: string | null;
  matchId:      string | null;
  teamId:       string | null;
  uploadedBy:   string | null;
  url:          string | null;
  title:        string | null;
  description:  string | null;
  coverUrl:     string | null;
  thumbnailUrl: string | null;
  caption:      string | null;
}
