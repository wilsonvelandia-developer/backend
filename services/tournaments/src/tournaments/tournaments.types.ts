import { Tournament, TournamentStatus, Phase, PhaseFormat, PhaseStatus } from '@tournament/shared';

// ── Tournament ────────────────────────────────────────────────────────────────

export interface TournamentRow {
  id:                 string;
  sport_id:           string;
  name:               string;
  season:             string | null;
  status:             TournamentStatus;
  max_subs_override:  number | null;
  created_at:         Date;
  updated_at:         Date;
}

export function mapTournamentRow(row: TournamentRow): Tournament {
  return {
    id:               row.id,
    sportId:          row.sport_id,
    name:             row.name,
    season:           row.season,
    status:           row.status,
    maxSubsOverride:  row.max_subs_override,
    createdAt:        row.created_at.toISOString(),
    updatedAt:        row.updated_at.toISOString(),
  };
}

export interface CreateTournamentInput {
  sportId:          string;
  name:             string;
  season:           string | null;
  maxSubsOverride:  number | null;
}

export type UpdateTournamentInput = Partial<CreateTournamentInput> & {
  status?: TournamentStatus;
};

// ── Phase ─────────────────────────────────────────────────────────────────────

export interface PhaseRow {
  id:            string;
  tournament_id: string;
  name:          string;
  format:        PhaseFormat;
  order_index:   number;
  status:        PhaseStatus;
  created_at:    Date;
}

export function mapPhaseRow(row: PhaseRow): Phase {
  return {
    id:           row.id,
    tournamentId: row.tournament_id,
    name:         row.name,
    format:       row.format,
    orderIndex:   row.order_index,
    status:       row.status,
    createdAt:    row.created_at.toISOString(),
  };
}

export interface CreatePhaseInput {
  name:       string;
  format:     PhaseFormat;
  orderIndex: number;
}

export interface UpdatePhaseInput {
  name?:       string;
  format?:     PhaseFormat;
  orderIndex?: number;
  status?:     PhaseStatus;
}
