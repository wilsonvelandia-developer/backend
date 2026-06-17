import { Team, Player } from '@tournament/shared';

// ── Team ──────────────────────────────────────────────────────────────────────

export interface TeamRow {
  id:            string;
  tournament_id: string;
  name:          string;
  short_name:    string | null;
  image_url:     string | null;
  created_at:    Date;
  updated_at:    Date;
}

export function mapTeamRow(row: TeamRow): Team {
  return {
    id:           row.id,
    tournamentId: row.tournament_id,
    name:         row.name,
    shortName:    row.short_name,
    imageUrl:     row.image_url,
    createdAt:    row.created_at.toISOString(),
    updatedAt:    row.updated_at.toISOString(),
  };
}

export interface CreateTeamInput {
  tournamentId: string;
  name:         string;
  shortName:    string | null;
}

export type UpdateTeamInput = Partial<Omit<CreateTeamInput, 'tournamentId'>>;

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
