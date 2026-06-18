import { Tournament, TournamentStatus, Phase, PhaseFormat, PhaseStatus } from '@tournament/shared';

// ── Tournament ────────────────────────────────────────────────────────────────

export interface TournamentRow {
  id:                     string;
  sport_id:               string;
  name:                   string;
  season:                 string | null;
  status:                 TournamentStatus;
  max_subs_override:      number | null;
  start_date:             string | null;
  registration_deadline:  string | null;
  expected_teams:         number | null;
  num_groups:             number | null;
  category:               string | null;
  birth_year_from:        string | null;
  validate_birth_from:    boolean;
  birth_year_to:          string | null;
  validate_birth_to:      boolean;
  contact_phone:          string | null;
  address:                string | null;
  location_url:           string | null;
  image_url:              string | null;
  description:            string | null;
  entry_fee:              string | null;
  rules_file_url:         string | null;
  invitation_file_url:    string | null;
  instagram_url:          string | null;
  facebook_url:           string | null;
  tiktok_url:             string | null;
  youtube_url:            string | null;
  match_duration_minutes: number;
  matches_per_day:        number;
  first_match_time:       string;
  num_venues:             number;
  venue_name:             string | null;
  points_config:          { win: number; draw: number; loss: number };
  tiebreaker_criteria:    string[];
  initial_fair_play_score: number;
  teams_per_group_qualify: number;
  created_at:             Date;
  updated_at:             Date;
}

export function mapTournamentRow(row: TournamentRow): Tournament {
  return {
    id:                    row.id,
    sportId:               row.sport_id,
    name:                  row.name,
    season:                row.season,
    status:                row.status,
    maxSubsOverride:       row.max_subs_override,
    startDate:             row.start_date,
    registrationDeadline:  row.registration_deadline,
    expectedTeams:         row.expected_teams,
    numGroups:             row.num_groups,
    category:              row.category,
    birthYearFrom:         row.birth_year_from,
    validateBirthFrom:     row.validate_birth_from,
    birthYearTo:           row.birth_year_to,
    validateBirthTo:       row.validate_birth_to,
    contactPhone:          row.contact_phone,
    address:               row.address,
    locationUrl:           row.location_url,
    imageUrl:              row.image_url,
    description:           row.description,
    entryFee:              row.entry_fee,
    rulesFileUrl:          row.rules_file_url,
    invitationFileUrl:     row.invitation_file_url,
    instagramUrl:          row.instagram_url,
    facebookUrl:           row.facebook_url,
    tiktokUrl:             row.tiktok_url,
    youtubeUrl:            row.youtube_url,
    matchDurationMinutes:  row.match_duration_minutes,
    matchesPerDay:         row.matches_per_day,
    firstMatchTime:        row.first_match_time,
    numVenues:             row.num_venues,
    venueName:             row.venue_name,
    pointsConfig:          row.points_config,
    tiebreakerCriteria:    row.tiebreaker_criteria,
    initialFairPlayScore:  row.initial_fair_play_score,
    teamsPerGroupQualify:  row.teams_per_group_qualify,
    createdAt:             row.created_at.toISOString(),
    updatedAt:             row.updated_at.toISOString(),
  };
}

export interface CreateTournamentInput {
  sportId:               string;
  name:                  string;
  season:                string | null;
  maxSubsOverride:       number | null;
  startDate:             string | null;
  registrationDeadline:  string | null;
  expectedTeams:         number | null;
  numGroups:             number | null;
  category:              string | null;
  birthYearFrom:         string | null;
  validateBirthFrom:     boolean;
  birthYearTo:           string | null;
  validateBirthTo:       boolean;
  contactPhone:          string | null;
  address:               string | null;
  locationUrl:           string | null;
  imageUrl:              string | null;
  description:           string | null;
  entryFee:              string | null;
  rulesFileUrl:          string | null;
  invitationFileUrl:     string | null;
  instagramUrl:          string | null;
  facebookUrl:           string | null;
  tiktokUrl:             string | null;
  youtubeUrl:            string | null;
  matchDurationMinutes:  number;
  matchesPerDay:         number;
  firstMatchTime:        string;
  numVenues:             number;
  venueName:             string | null;
  pointsConfig?:         { win: number; draw: number; loss: number };
  tiebreakerCriteria?:   string[];
  initialFairPlayScore?: number;
  teamsPerGroupQualify?: number;
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
