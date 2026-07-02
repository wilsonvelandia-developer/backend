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
  playersPerTeam:     number;
  minPlayersPerTeam:  number | null;  // null = same as playersPerTeam
}

// ── Tournament Substitution Rules (loaded alongside sport rules) ──────────────

export interface TournamentSubRules {
  allowReentry:        boolean;
  enforcePairedSubs:   boolean;
  liberoUnlimitedSubs: boolean;
  maxSubsPerPeriod:    number | null; // overrides sport maxSubstitutions if set
  maxSubsOverride:     number | null; // tournament-level override for maxSubstitutions
}

// ── Match detail (match + periods) ────────────────────────────────────────────

export interface MatchDetail {
  match:   Match;
  periods: MatchPeriod[];
}

// ── Match Sanction ────────────────────────────────────────────────────────────

export interface MatchSanctionRow {
  id:               string;
  match_id:         string;
  sanction_type_id: string;
  team_id:          string;
  player_id:        string | null;
  minute:           number | null;
  period_number:    number | null;
  notes:            string | null;
  created_at:       Date;
  // Joined fields
  sanction_name?:   string;
  sanction_code?:   string;
  sanction_color?:  string;
  sanction_icon?:   string;
  player_name?:     string;
  player_jersey?:   number;
  team_name?:       string;
}

export interface MatchSanction {
  id:             string;
  matchId:        string;
  sanctionTypeId: string;
  teamId:         string;
  playerId:       string | null;
  minute:         number | null;
  periodNumber:   number | null;
  notes:          string | null;
  createdAt:      string;
  sanctionName?:  string;
  sanctionCode?:  string;
  sanctionColor?: string;
  sanctionIcon?:  string;
  playerName?:    string;
  playerJersey?:  number;
  teamName?:      string;
}

export function mapSanctionRow(row: MatchSanctionRow): MatchSanction {
  return {
    id:             row.id,
    matchId:        row.match_id,
    sanctionTypeId: row.sanction_type_id,
    teamId:         row.team_id,
    playerId:       row.player_id,
    minute:         row.minute,
    periodNumber:   row.period_number,
    notes:          row.notes,
    createdAt:      row.created_at.toISOString(),
    sanctionName:   row.sanction_name,
    sanctionCode:   row.sanction_code,
    sanctionColor:  row.sanction_color,
    sanctionIcon:   row.sanction_icon,
    playerName:     row.player_name,
    playerJersey:   row.player_jersey,
    teamName:       row.team_name,
  };
}

// ── Match Event ───────────────────────────────────────────────────────────────

export interface MatchEventRow {
  id:            string;
  match_id:      string;
  event_type:    string;
  team_id:       string | null;
  player_id:     string | null;
  period_number: number;
  match_minute:  number | null;
  payload:       Record<string, unknown>;
  created_at:    Date;
  // Joined fields
  player_name?:  string;
  team_name?:    string;
}

export interface MatchEvent {
  id:           string;
  matchId:      string;
  eventType:    string;
  teamId:       string | null;
  playerId:     string | null;
  periodNumber: number;
  matchMinute:  number | null;
  payload:      Record<string, unknown>;
  createdAt:    string;
  playerName?:  string;
  teamName?:    string;
}

export function mapEventRow(row: MatchEventRow): MatchEvent {
  return {
    id:           row.id,
    matchId:      row.match_id,
    eventType:    row.event_type,
    teamId:       row.team_id,
    playerId:     row.player_id,
    periodNumber: row.period_number,
    matchMinute:  row.match_minute,
    payload:      row.payload,
    createdAt:    row.created_at.toISOString(),
    playerName:   row.player_name,
    teamName:     row.team_name,
  };
}

// ── Match Scorer ──────────────────────────────────────────────────────────────

export interface MatchScorerRow {
  id:            string;
  match_id:      string;
  team_id:       string;
  player_id:     string;
  period_number: number;
  match_minute:  number | null;
  points:        number;
  created_at:    Date;
  // Joined fields
  player_name?:  string;
  player_jersey?: number;
  team_name?:    string;
}

export interface MatchScorer {
  id:           string;
  matchId:      string;
  teamId:       string;
  playerId:     string;
  periodNumber: number;
  matchMinute:  number | null;
  points:       number;
  createdAt:    string;
  playerName?:  string;
  playerJersey?: number;
  teamName?:    string;
}

export function mapScorerRow(row: MatchScorerRow): MatchScorer {
  return {
    id:           row.id,
    matchId:      row.match_id,
    teamId:       row.team_id,
    playerId:     row.player_id,
    periodNumber: row.period_number,
    matchMinute:  row.match_minute,
    points:       row.points,
    createdAt:    row.created_at.toISOString(),
    playerName:   row.player_name,
    playerJersey: row.player_jersey,
    teamName:     row.team_name,
  };
}

// ── Match Lineup ──────────────────────────────────────────────────────────────

export interface MatchLineupRow {
  id:              string;
  match_id:        string;
  team_id:         string;
  player_id:       string;
  is_starter:      boolean;
  is_captain:      boolean;
  is_goalkeeper:   boolean;
  is_libero:       boolean;
  volleyball_zone: number | null;
  period_number:   number;
  created_at:      Date;
  // Joined
  player_name?:    string;
  jersey_number?:  number;
  position?:       string;
}

export interface MatchLineupPlayer {
  id:             string;
  matchId:        string;
  teamId:         string;
  playerId:       string;
  isStarter:      boolean;
  isCaptain:      boolean;
  isGoalkeeper:   boolean;
  isLibero:       boolean;
  volleyballZone: number | null;
  periodNumber:   number;
  createdAt:      string;
  playerName?:    string;
  jerseyNumber?:  number;
  position?:      string;
}

export function mapLineupRow(row: MatchLineupRow): MatchLineupPlayer {
  return {
    id:             row.id,
    matchId:        row.match_id,
    teamId:         row.team_id,
    playerId:       row.player_id,
    isStarter:      row.is_starter,
    isCaptain:      row.is_captain,
    isGoalkeeper:   row.is_goalkeeper,
    isLibero:       row.is_libero,
    volleyballZone: row.volleyball_zone,
    periodNumber:   row.period_number,
    createdAt:      row.created_at.toISOString(),
    playerName:     row.player_name,
    jerseyNumber:   row.jersey_number,
    position:       row.position,
  };
}

// ── Match Setup ───────────────────────────────────────────────────────────────

export interface MatchSetup {
  coinTossWinnerTeamId: string | null;
  fieldSideHome:        string | null;
  fieldSideAway:        string | null;
  firstServeTeamId:     string | null;
  lineups: {
    home: MatchLineupPlayer[];
    away: MatchLineupPlayer[];
  };
}
