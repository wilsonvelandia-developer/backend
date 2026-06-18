import { z } from 'zod';

// ── Helper: transform empty strings to null ───────────────────────────────────
const optionalStr = (maxLen: number) =>
  z.string().max(maxLen).nullable().transform((v) => (v && v.trim() ? v.trim() : null)).default(null);

const optionalUrl = () =>
  z.string().max(500).nullable().transform((v) => (v && v.trim() ? v.trim() : null)).default(null);

// ── Tournament schemas ────────────────────────────────────────────────────────

const tournamentBaseSchema = z.object({
  sportId: z.string().uuid('sportId must be a valid UUID'),
  name:    z.string().trim().min(2).max(200),
  season:  optionalStr(20),

  maxSubsOverride: z.number().int().min(0).max(50).nullable().default(null),

  // Scheduling & registration
  startDate:            optionalStr(10), // ISO date YYYY-MM-DD
  registrationDeadline: optionalStr(10),
  expectedTeams:        z.number().int().min(2).max(512).nullable().default(null),
  numGroups:            z.number().int().min(1).max(64).nullable().default(null),

  // Category & age restrictions
  category:          optionalStr(100),
  birthYearFrom:     optionalStr(10), // ISO date
  validateBirthFrom: z.boolean().default(false),
  birthYearTo:       optionalStr(10),
  validateBirthTo:   z.boolean().default(false),

  // Contact & location
  contactPhone: optionalStr(30),
  address:      optionalStr(300),
  locationUrl:  optionalUrl(),

  // Media & files
  imageUrl:          optionalUrl(),
  description:       z.string().max(5000).nullable().transform((v) => (v && v.trim() ? v.trim() : null)).default(null),
  entryFee:          optionalStr(100),
  rulesFileUrl:      optionalUrl(),
  invitationFileUrl: optionalUrl(),

  // Social media
  instagramUrl: optionalUrl(),
  facebookUrl:  optionalUrl(),
  tiktokUrl:    optionalUrl(),
  youtubeUrl:   optionalUrl(),

  // Fixture configuration
  matchDurationMinutes: z.number().int().min(30).max(300).default(90),
  matchesPerDay:        z.number().int().min(1).max(20).default(6),
  firstMatchTime:       z.string().max(8).default('08:00'),
  numVenues:            z.number().int().min(1).max(10).default(1),
  venueName:            optionalStr(200),

  // Standings configuration
  pointsConfig:         z.object({ win: z.number().int().min(0), draw: z.number().int().min(0), loss: z.number().int().min(0) }).default({ win: 3, draw: 1, loss: 0 }),
  tiebreakerCriteria:   z.array(z.string().max(50)).default(['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'draw']),
  initialFairPlayScore: z.number().int().default(1000),
  teamsPerGroupQualify: z.number().int().min(1).max(10).default(2),
});

export const createTournamentSchema = tournamentBaseSchema;

export const updateTournamentSchema = tournamentBaseSchema
  .extend({
    status: z.enum(['draft', 'active', 'finished', 'suspended', 'cancelled', 'archived']).optional(),
  })
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' },
  );

// ── Phase schemas ─────────────────────────────────────────────────────────────

const phaseBaseSchema = z.object({
  name:       z.string().trim().min(2).max(100),
  format:     z.enum(['round_robin', 'single_elim', 'double_elim', 'groups']),
  orderIndex: z.number().int().min(1, 'orderIndex must be at least 1'),
});

export const createPhaseSchema = phaseBaseSchema;

export const updatePhaseSchema = phaseBaseSchema
  .extend({ status: z.enum(['pending', 'active', 'finished']).optional() })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

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
  status:  z.enum(['draft', 'active', 'finished', 'suspended', 'cancelled', 'archived']).optional(),
  season:  z.string().max(20).optional(),
});

// ── DTO types ─────────────────────────────────────────────────────────────────

export type CreateTournamentDto  = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentDto  = z.infer<typeof updateTournamentSchema>;
export type CreatePhaseDto       = z.infer<typeof createPhaseSchema>;
export type UpdatePhaseDto       = z.infer<typeof updatePhaseSchema>;
export type ListTournamentsQuery = z.infer<typeof listTournamentsSchema>;
