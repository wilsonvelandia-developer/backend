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
