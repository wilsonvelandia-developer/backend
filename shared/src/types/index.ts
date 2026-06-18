/**
 * Shared TypeScript interfaces for the tournament platform.
 * All services import types from this package to ensure consistency.
 */

// ──────────────────────────────────────────────
// Common
// ──────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  correlationId: string;
  details?: Record<string, unknown>;
}

// ──────────────────────────────────────────────
// Sports
// ──────────────────────────────────────────────

export interface Sport {
  id: string;
  name: string;
  slug: string;
  playersPerTeam: number;
  hasSets: boolean;
  setsToWin: number | null;
  pointsPerSet: number | null;
  decisiveSetPoints: number | null;
  winMargin: number;
  periodsPerMatch: number;
  maxSubstitutions: number | null; // null = unlimited
  hasRotation: boolean;
  iconUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────
// Tournaments
// ──────────────────────────────────────────────

export type TournamentStatus = 'draft' | 'active' | 'finished' | 'suspended' | 'cancelled' | 'archived';
export type PhaseFormat = 'round_robin' | 'single_elim' | 'double_elim' | 'groups';
export type PhaseStatus = 'pending' | 'active' | 'finished';

export interface Tournament {
  id: string;
  sportId: string;
  name: string;
  season: string | null;
  status: TournamentStatus;
  maxSubsOverride: number | null;
  startDate: string | null;
  registrationDeadline: string | null;
  expectedTeams: number | null;
  numGroups: number | null;
  category: string | null;
  birthYearFrom: string | null;
  validateBirthFrom: boolean;
  birthYearTo: string | null;
  validateBirthTo: boolean;
  contactPhone: string | null;
  address: string | null;
  locationUrl: string | null;
  imageUrl: string | null;
  description: string | null;
  entryFee: string | null;
  rulesFileUrl: string | null;
  invitationFileUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  // Fixture configuration
  matchDurationMinutes: number;
  matchesPerDay: number;
  firstMatchTime: string;
  numVenues: number;
  venueName: string | null;
  // Standings configuration
  pointsConfig: { win: number; draw: number; loss: number };
  tiebreakerCriteria: string[];
  initialFairPlayScore: number;
  teamsPerGroupQualify: number;
  createdAt: string;
  updatedAt: string;
}

export interface Phase {
  id: string;
  tournamentId: string;
  name: string;
  format: PhaseFormat;
  orderIndex: number;
  status: PhaseStatus;
  createdAt: string;
}

// ──────────────────────────────────────────────
// Teams & Players
// ──────────────────────────────────────────────

export interface Team {
  id: string;
  tournamentId: string | null;
  name: string;
  shortName: string | null;
  imageUrl: string | null;
  phone: string | null;
  email: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  status: string;
  colorPrimary: string | null;
  colorSecondary: string | null;
  variant: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  jerseyNumber: number;
  position: string | null;
  isActive: boolean;
  createdAt: string;
}

// ──────────────────────────────────────────────
// Matches
// ──────────────────────────────────────────────

export type MatchStatus = 'scheduled' | 'in_progress' | 'finished';

export interface Match {
  id: string;
  phaseId: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: string | null;
  status: MatchStatus;
  winnerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatchPeriod {
  id: string;
  matchId: string;
  periodNumber: number;
  homeScore: number;
  awayScore: number;
  status: 'pending' | 'in_progress' | 'finished';
}

// ──────────────────────────────────────────────
// Volleyball
// ──────────────────────────────────────────────

/** Court position 1–6 */
export type CourtPosition = 1 | 2 | 3 | 4 | 5 | 6;

export interface VolleyballRotationSlot {
  id: string;
  matchId: string;
  teamId: string;
  setNumber: number;
  position: CourtPosition;
  playerId: string;
  rotationOrder: number; // 0–5, tracks how many rotations have occurred
}

// ──────────────────────────────────────────────
// Substitutions
// ──────────────────────────────────────────────

export interface Substitution {
  id: string;
  matchId: string;
  teamId: string;
  periodNumber: number;
  playerOutId: string;
  playerInId: string;
  minute: number | null;
  createdAt: string;
}

// ──────────────────────────────────────────────
// Standings
// ──────────────────────────────────────────────

export interface Standing {
  id: string;
  phaseId: string;
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  setsWon: number;
  setsLost: number;
  scoreFor: number;
  scoreAgainst: number;
  updatedAt: string;
}
