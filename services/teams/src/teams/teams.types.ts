import { Team, Player } from '@tournament/shared';

// ── Team ──────────────────────────────────────────────────────────────────────

export interface TeamRow {
  id:              string;
  tournament_id:   string | null;
  name:            string;
  short_name:      string | null;
  image_url:       string | null;
  phone:           string | null;
  email:           string | null;
  instagram_url:   string | null;
  facebook_url:    string | null;
  tiktok_url:      string | null;
  youtube_url:     string | null;
  status:          string;
  color_primary:   string | null;
  color_secondary: string | null;
  variant:         string | null;
  created_at:      Date;
  updated_at:      Date;
}

export function mapTeamRow(row: TeamRow): Team {
  return {
    id:             row.id,
    tournamentId:   row.tournament_id,
    name:           row.name,
    shortName:      row.short_name,
    imageUrl:       row.image_url,
    phone:          row.phone,
    email:          row.email,
    instagramUrl:   row.instagram_url,
    facebookUrl:    row.facebook_url,
    tiktokUrl:      row.tiktok_url,
    youtubeUrl:     row.youtube_url,
    status:         row.status,
    colorPrimary:   row.color_primary,
    colorSecondary: row.color_secondary,
    variant:        row.variant,
    createdAt:      row.created_at.toISOString(),
    updatedAt:      row.updated_at.toISOString(),
  };
}

export interface CreateTeamInput {
  tournamentId: string | null;
  name:         string;
  shortName:    string | null;
  imageUrl?:    string | null;
  phone?:       string | null;
  email?:       string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?:   string | null;
  youtubeUrl?:  string | null;
  colorPrimary?: string | null;
  colorSecondary?: string | null;
  variant?:     string | null;
}

export interface UpdateTeamInput {
  name?:           string;
  shortName?:      string | null;
  imageUrl?:       string | null;
  phone?:          string | null;
  email?:          string | null;
  instagramUrl?:   string | null;
  facebookUrl?:    string | null;
  tiktokUrl?:      string | null;
  youtubeUrl?:     string | null;
  status?:         string;
  colorPrimary?:   string | null;
  colorSecondary?: string | null;
  variant?:        string | null;
}

// ── Player ────────────────────────────────────────────────────────────────────

export interface PlayerRow {
  id:            string;
  team_id:       string;
  name:          string;
  jersey_number: number;
  position:      string | null;
  is_active:     boolean;
  created_at:    Date;
}

export function mapPlayerRow(row: PlayerRow): Player {
  return {
    id:           row.id,
    teamId:       row.team_id,
    name:         row.name,
    jerseyNumber: row.jersey_number,
    position:     row.position,
    isActive:     row.is_active,
    createdAt:    row.created_at.toISOString(),
  };
}

export interface CreatePlayerInput {
  teamId:       string;
  name:         string;
  jerseyNumber: number;
  position:     string | null;
}

export interface UpdatePlayerInput {
  name?:         string;
  jerseyNumber?: number;
  position?:     string | null;
  isActive?:     boolean;
}

/** Sport rule config needed to validate player roster limits. */
export interface SportRules {
  playersPerTeam: number;
  hasRotation:    boolean;
}
