import { z } from 'zod';

// ── Team schemas ──────────────────────────────────────────────────────────────

const optionalUrl = () =>
  z.string().max(500).nullable().transform((v) => (v && v.trim() ? v.trim() : null)).default(null);

const teamBaseSchema = z.object({
  tournamentId:   z.string().uuid('tournamentId must be a valid UUID').nullable().default(null),
  name:           z.string().trim().min(2).max(200),
  shortName:      z.string().trim().min(1).max(10).nullable().default(null),
  imageUrl:       optionalUrl(),
  phone:          z.string().trim().max(30).nullable().default(null),
  email:          z.string().max(255).nullable().default(null),
  instagramUrl:   optionalUrl(),
  facebookUrl:    optionalUrl(),
  tiktokUrl:      optionalUrl(),
  youtubeUrl:     optionalUrl(),
  colorPrimary:   z.string().max(7).nullable().default(null),
  colorSecondary: z.string().max(7).nullable().default(null),
  variant:        z.string().trim().max(50).nullable().default(null),
});

export const createTeamSchema = teamBaseSchema;

export const updateTeamSchema = teamBaseSchema
  .omit({ tournamentId: true })
  .extend({ status: z.enum(['active', 'inactive', 'suspended']).optional() })
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' },
  );

// ── Player schemas ────────────────────────────────────────────────────────────

const VALID_POSITIONS: Record<string, string[]> = {
  volleyball: ['setter', 'outside_hitter', 'opposite', 'middle_blocker', 'libero', 'defensive_specialist'],
  football:   ['goalkeeper', 'defender', 'midfielder', 'forward'],
  basketball: ['point_guard', 'shooting_guard', 'small_forward', 'power_forward', 'center'],
  tennis:     ['singles', 'doubles'],
};
// Generic positions accepted when sport is unknown or not listed above
export const ALL_POSITIONS = Object.values(VALID_POSITIONS).flat();

const playerBaseSchema = z.object({
  name: z.string().trim().min(2).max(200),

  jerseyNumber: z
    .number({ required_error: 'jerseyNumber is required' })
    .int()
    .min(0)
    .max(999),

  position: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .default(null),
});

export const createPlayerSchema = playerBaseSchema.extend({
  // New fields for player-user linking
  documentType:   z.string().max(20).nullable().default(null),
  documentNumber: z.string().max(30).nullable().default(null),
  userId:         z.string().uuid().nullable().default(null),
  email:          z.string().email().nullable().default(null),
  phone:          z.string().max(30).nullable().default(null),
  birthDate:      z.string().nullable().default(null),
});

export const updatePlayerSchema = playerBaseSchema
  .extend({ isActive: z.boolean().optional() })
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' },
  );

// ── Param schemas ─────────────────────────────────────────────────────────────

export const teamIdSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const playerParamsSchema = z.object({
  id:       z.string().uuid('team id must be a valid UUID'),
  playerId: z.string().uuid('playerId must be a valid UUID'),
});

export const listTeamsSchema = z.object({
  tournamentId: z.string().uuid().optional(),
});

// ── DTO types ─────────────────────────────────────────────────────────────────

export type CreateTeamDto   = z.infer<typeof createTeamSchema>;
export type UpdateTeamDto   = z.infer<typeof updateTeamSchema>;
export type CreatePlayerDto = z.infer<typeof createPlayerSchema>;
export type UpdatePlayerDto = z.infer<typeof updatePlayerSchema>;
export type ListTeamsQuery  = z.infer<typeof listTeamsSchema>;
