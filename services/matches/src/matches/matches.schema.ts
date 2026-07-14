import { z } from 'zod';

// ── Match schemas ─────────────────────────────────────────────────────────────

export const createMatchSchema = z.object({
  phaseId:     z.string().uuid('phaseId must be a valid UUID'),
  homeTeamId:  z.string().uuid('homeTeamId must be a valid UUID'),
  awayTeamId:  z.string().uuid('awayTeamId must be a valid UUID'),
  scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
}).refine(
  (d) => d.homeTeamId !== d.awayTeamId,
  { message: 'homeTeamId and awayTeamId must be different teams', path: ['awayTeamId'] },
);

export const matchIdSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const listMatchesSchema = z.object({
  phaseId:    z.string().uuid().optional(),
  teamId:     z.string().uuid().optional(),
  status:     z.enum(['scheduled', 'in_progress', 'finished']).optional(),
  page:       z.coerce.number().int().min(1).optional(),
  pageSize:   z.coerce.number().int().min(1).max(500).optional(),
});

// ── Score update schema ───────────────────────────────────────────────────────

export const updatePeriodScoreSchema = z.object({
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
});

export const periodParamsSchema = z.object({
  id:           z.string().uuid(),
  periodNumber: z.coerce.number().int().min(1),
});

// ── Volleyball lineup schema ──────────────────────────────────────────────────

const lineupSlotSchema = z.object({
  position: z.number().int().min(1).max(6) as z.ZodType<1|2|3|4|5|6>,
  playerId: z.string().uuid(),
});

export const registerLineupSchema = z.object({
  teamId:    z.string().uuid(),
  setNumber: z.number().int().min(1),
  lineup:    z.array(lineupSlotSchema)
    .length(6, 'Volleyball lineup must have exactly 6 players'),
}).refine(
  (d) => new Set(d.lineup.map((s) => s.position)).size === 6,
  { message: 'Each court position (1-6) must appear exactly once', path: ['lineup'] },
).refine(
  (d) => new Set(d.lineup.map((s) => s.playerId)).size === 6,
  { message: 'All 6 players must be different', path: ['lineup'] },
);

// ── Rotation schema ───────────────────────────────────────────────────────────

export const rotateTeamSchema = z.object({
  teamId:    z.string().uuid(),
  setNumber: z.number().int().min(1),
});

// ── Substitution schema ───────────────────────────────────────────────────────

export const substitutionSchema = z.object({
  teamId:       z.string().uuid(),
  periodNumber: z.number().int().min(1),
  playerOutId:  z.string().uuid(),
  playerInId:   z.string().uuid(),
  minute:       z.number().int().min(0).nullable().default(null),
}).refine(
  (d) => d.playerOutId !== d.playerInId,
  { message: 'playerOutId and playerInId must be different', path: ['playerInId'] },
);

// ── DTO types ─────────────────────────────────────────────────────────────────

export type CreateMatchDto       = z.infer<typeof createMatchSchema>;
export type UpdatePeriodScoreDto = z.infer<typeof updatePeriodScoreSchema>;
export type RegisterLineupDto    = z.infer<typeof registerLineupSchema>;
export type RotateTeamDto        = z.infer<typeof rotateTeamSchema>;
export type SubstitutionDto      = z.infer<typeof substitutionSchema>;
export type ListMatchesQuery     = z.infer<typeof listMatchesSchema>;

// ── Sanction schema ───────────────────────────────────────────────────────────

export const createSanctionSchema = z.object({
  sanctionTypeId: z.string().uuid('sanctionTypeId must be a valid UUID'),
  teamId:         z.string().uuid('teamId must be a valid UUID'),
  playerId:       z.string().uuid('playerId must be a valid UUID').nullable().default(null),
  periodNumber:   z.number().int().min(1),
  minute:         z.number().int().min(0).nullable().default(null),
  notes:          z.string().max(500).nullable().default(null),
});

export type CreateSanctionDto = z.infer<typeof createSanctionSchema>;

// ── Match Event schema ────────────────────────────────────────────────────────

export const createMatchEventSchema = z.object({
  eventType: z.enum([
    'score', 'substitution', 'sanction', 'rotation',
    'period_start', 'period_end', 'timeout', 'match_start', 'match_end', 'set_end',
  ]),
  teamId:       z.string().uuid().nullable().default(null),
  playerId:     z.string().uuid().nullable().default(null),
  periodNumber: z.number().int().min(1),
  matchMinute:  z.number().int().min(0).nullable().default(null),
  payload:      z.record(z.unknown()).default({}),
  partialScore: z.object({
    home: z.number().int().min(0),
    away: z.number().int().min(0),
    homeSets: z.number().int().min(0).default(0),
    awaySets: z.number().int().min(0).default(0),
  }).nullable().default(null),
});

export type CreateMatchEventDto = z.infer<typeof createMatchEventSchema>;

// ── Match Scorer schema ───────────────────────────────────────────────────────

export const createScorerSchema = z.object({
  teamId:       z.string().uuid('teamId must be a valid UUID'),
  playerId:     z.string().uuid('playerId must be a valid UUID'),
  periodNumber: z.number().int().min(1),
  matchMinute:  z.number().int().min(0).nullable().default(null),
  points:       z.number().int().min(1).default(1),
});

export type CreateScorerDto = z.infer<typeof createScorerSchema>;

// ── Match Setup schema ────────────────────────────────────────────────────────

export const matchSetupSchema = z.object({
  coinTossWinnerTeamId: z.string().uuid().nullable().default(null),
  fieldSideHome:        z.enum(['A', 'B']).nullable().default(null),
  fieldSideAway:        z.enum(['A', 'B']).nullable().default(null),
  firstServeTeamId:     z.string().uuid().nullable().default(null),
});

export type MatchSetupDto = z.infer<typeof matchSetupSchema>;

// ── Match Lineup schema ───────────────────────────────────────────────────────

const lineupPlayerSchema = z.object({
  playerId:       z.string().uuid(),
  isStarter:      z.boolean(),
  isCaptain:      z.boolean().default(false),
  isGoalkeeper:   z.boolean().default(false),
  isLibero:       z.boolean().default(false),
  volleyballZone: z.number().int().min(1).max(6).nullable().default(null),
});

export const saveLineupSchema = z.object({
  teamId:       z.string().uuid(),
  periodNumber: z.number().int().min(1).default(1),
  players:      z.array(lineupPlayerSchema).min(1),
});

export type SaveLineupDto = z.infer<typeof saveLineupSchema>;
