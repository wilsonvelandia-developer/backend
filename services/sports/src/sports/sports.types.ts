import { Sport } from '@tournament/shared';

/** Row shape returned directly from the database (snake_case). */
export interface SportRow {
  id:                   string;
  name:                 string;
  slug:                 string;
  players_per_team:     number;
  has_sets:             boolean;
  sets_to_win:          number | null;
  points_per_set:       number | null;
  decisive_set_points:  number | null;
  win_margin:           number;
  periods_per_match:    number;
  max_substitutions:    number | null;
  has_rotation:         boolean;
  icon_url:             string | null;
  created_at:           Date;
  updated_at:           Date;
}

/** Maps a DB row to the shared Sport interface (camelCase). */
export function mapSportRow(row: SportRow): Sport {
  return {
    id:                 row.id,
    name:               row.name,
    slug:               row.slug,
    playersPerTeam:     row.players_per_team,
    hasSets:            row.has_sets,
    setsToWin:          row.sets_to_win,
    pointsPerSet:       row.points_per_set,
    decisiveSetPoints:  row.decisive_set_points,
    winMargin:          row.win_margin,
    periodsPerMatch:    row.periods_per_match,
    maxSubstitutions:   row.max_substitutions,
    hasRotation:        row.has_rotation,
    iconUrl:            row.icon_url,
    createdAt:          row.created_at.toISOString(),
    updatedAt:          row.updated_at.toISOString(),
  };
}

/** Input for creating a new sport. */
export interface CreateSportInput {
  name:               string;
  slug:               string;
  playersPerTeam:     number;
  hasSets:            boolean;
  setsToWin:          number | null;
  pointsPerSet:       number | null;
  decisiveSetPoints:  number | null;
  winMargin:          number;
  periodsPerMatch:    number;
  maxSubstitutions:   number | null;
  hasRotation:        boolean;
  iconUrl:            string | null;
}

/** Input for updating an existing sport (all fields optional). */
export type UpdateSportInput = Partial<CreateSportInput>;
