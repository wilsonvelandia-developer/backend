import { z } from 'zod';

// ── Tournament schemas ────────────────────────────────────────────────────────

const tournamentBaseSchema = z.object({
  sportId: z.string().uuid('sportId must be a valid UUID'),

  name: z.string().trim().min(2).max(200),

  season: z
    .string()
    .trim()
    .max(20)
    .regex(/^\d{4}(-\d+)?$/, 'season must be in format YYYY or YYYY-N')
    .nullable()
    .default(null),

  maxSubsOverride: z
    .number().int().min(0).max(50).nullable()
    .default(null),
});

export const createTournamentSchema = tournamentBaseSchema;

export const updateTournamentSchema = tournamentBaseSchema
  .extend({
    status: z.enum(['draft', 'active', 'finished']).optional(),
  })
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' },
  );

// ── Phase schemas ─────────────────────────────────────────────────────────────

const phaseBaseSchema = z.object({
  name: z.string().trim().min(2).max(100),

  format: z.enum(['round_robin', 'single_elim', 'double_elim', 'groups']),

  orderIndex: z.number().int().min(1, 'orderIndex must be at least 1'),
});

export const createPhaseSchema = phaseBaseSchema;

export const updatePhaseSchema = phaseBaseSchema
  .extend({
    status: z.enum(['pending', 'active', 'finished']).optional(),
  })
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' },
  );

// ── Param schemas ─────────────────────────────────────────────────────────────

export const tournamentIdSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const phaseParamsSchema = z.object({
  id:      z.string().uuid('tournament id must be a valid UUID'),
  phaseId: z.string().uuid('phaseId must be a valid UUID'),
});

// ── Query schemas ─────────────────────────────────────────────────────────────

export const listTournamentsSchema = z.object({
  sportId: z.string().uuid().optional(),
  status:  z.enum(['draft', 'active', 'finished']).optional(),
  season:  z.string().max(20).optional(),
});

// ── DTO types ─────────────────────────────────────────────────────────────────

export type CreateTournamentDto = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentDto = z.infer<typeof updateTournamentSchema>;
export type CreatePhaseDto      = z.infer<typeof createPhaseSchema>;
export type UpdatePhaseDto      = z.infer<typeof updatePhaseSchema>;
export type ListTournamentsQuery = z.infer<typeof listTournamentsSchema>;
