import { Match, MatchStatus, MatchPeriod, Substitution, VolleyballRotationSlot, CourtPosition } from '@tournament/shared';

// ── Match ─────────────────────────────────────────────────────────────────────

export interface MatchRow {
  id:           string;
  phase_id:     string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: Date | null;
  status:       MatchStatus;
  winner_id:    string | null;
  created_at:   Date;
  updated_at:   Date;
}

export function mapMatchRow(row: MatchRow): Match {
  return {
    id:          row.id,
    phaseId:     row.phase_id,
    homeTeamId:  row.home_team_id,
    awayTeamId:  row.away_team_id,
    scheduledAt: row.scheduled_at ? row.scheduled_at.toISOString() : null,
    status:      row.status,
    winnerId:    row.winner_id,
    createdAt:   row.created_at.toISOString(),
    updatedAt:   row.updated_at.toISOString(),
  };
}

// ── Match Period ──────────────────────────────────────────────────────────────

export interface MatchPeriodRow {
  id:            string;
  match_id:      string;
  period_number: number;
  home_score:    number;
  away_score:    number;
  status:        'pending' | 'in_progress' | 'finished';
}

export function mapPeriodRow(row: MatchPeriodRow): MatchPeriod {
  return {
    id:           row.id,
    matchId:      row.match_id,
    periodNumber: row.period_number,
    homeScore:    row.home_score,
    awayScore:    row.away_score,
    status:       row.status,
  };
}

// ── Volleyball Rotation ───────────────────────────────────────────────────────

export interface RotationRow {
  id:             string;
  match_id:       string;
  team_id:        string;
  set_number:     number;
  position:       number;
  player_id:      string;
  rotation_order: number;
}

export function mapRotationRow(row: RotationRow): VolleyballRotationSlot {
  return {
    id:            row.id,
    matchId:       row.match_id,
    teamId:        row.team_id,
    setNumber:     row.set_number,
    position:      row.position as CourtPosition,
    playerId:      row.player_id,
    rotationOrder: row.rotation_order,
  };
}

// ── Substitution ──────────────────────────────────────────────────────────────

export interface SubstitutionRow {
  id:            string;
  match_id:      string;
  team_id:       string;
  period_number: number;
  player_out_id: string;
  player_in_id:  string;
  minute:        number | null;
  created_at:    Date;
}

export function mapSubstitutionRow(row: SubstitutionRow): Substitution {
  return {
    id:           row.id,
    matchId:      row.match_id,
    teamId:       row.team_id,
    periodNumber: row.period_number,
    playerOutId:  row.player_out_id,
    playerInId:   row.player_in_id,
    minute:       row.minute,
    createdAt:    row.created_at.toISOString(),
  };
}

// ── Sport Rules (loaded from DB) ──────────────────────────────────────────────

export interface SportRules {
  sportId:            string;
  sportSlug:          string;
  hasSets:            boolean;
  setsToWin:          number | null;
  pointsPerSet:       number | null;
  decisiveSetPoints:  number | null;
  winMargin:          number;
  periodsPerMatch:    number;
  maxSubstitutions:   number | null;  // null = unlimited
  hasRotation:        boolean;
}

// ── Match detail (match + periods) ────────────────────────────────────────────

export interface MatchDetail {
  match:   Match;
  periods: MatchPeriod[];
}
