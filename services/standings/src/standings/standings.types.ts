import { Standing } from '@tournament/shared';

export interface StandingRow {
  id:            string;
  phase_id:      string;
  team_id:       string;
  played:        number;
  wins:          number;
  draws:         number;
  losses:        number;
  points:        number;
  sets_won:      number;
  sets_lost:     number;
  score_for:     number;
  score_against: number;
  updated_at:    Date;
  // Joined fields (optional — present when fetching with team name)
  team_name?:    string;
  team_short?:   string;
}

export function mapStandingRow(row: StandingRow): Standing & { teamName?: string; teamShort?: string } {
  return {
    id:           row.id,
    phaseId:      row.phase_id,
    teamId:       row.team_id,
    played:       row.played,
    wins:         row.wins,
    draws:        row.draws,
    losses:       row.losses,
    points:       row.points,
    setsWon:      row.sets_won,
    setsLost:     row.sets_lost,
    scoreFor:     row.score_for,
    scoreAgainst: row.score_against,
    updatedAt:    row.updated_at.toISOString(),
    ...(row.team_name  && { teamName:  row.team_name }),
    ...(row.team_short && { teamShort: row.team_short }),
  };
}

// ── Match result data used for standings calculation ──────────────────────────

export interface FinishedMatchRow {
  id:           string;
  home_team_id: string;
  away_team_id: string;
  winner_id:    string | null;
  phase_id:     string;
  // Aggregated period data
  home_total:   number;
  away_total:   number;
  home_sets:    number;
  away_sets:    number;
}

// ── Points system config ──────────────────────────────────────────────────────

export interface PointsSystem {
  win:  number;
  draw: number;
  loss: number;
}

/** Default points system (configurable per sport in future). */
export const DEFAULT_POINTS: PointsSystem = { win: 3, draw: 1, loss: 0 };

/** Volleyball / Tennis don't have draws — draws give 0 points each. */
export const SET_BASED_POINTS: PointsSystem = { win: 3, draw: 0, loss: 0 };
