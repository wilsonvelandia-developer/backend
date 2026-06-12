import { z } from 'zod';

/**
 * Zod validation schemas for the sports service.
 * All input is validated before reaching the service/repository layer.
 */

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Base object shape — used by both create and update schemas.
 * Kept separate so .partial() can be called before adding cross-field .refine().
 */
const sportBaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),

  slug: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(slugRegex, 'Slug must be lowercase letters, numbers, and hyphens only'),

  playersPerTeam: z
    .number({ required_error: 'playersPerTeam is required' })
    .int()
    .min(1, 'At least 1 player per team required')
    .max(50),

  hasSets: z.boolean(),

  setsToWin: z
    .number().int().min(1).max(10).nullable()
    .default(null),

  pointsPerSet: z
    .number().int().min(1).max(200).nullable()
    .default(null),

  decisiveSetPoints: z
    .number().int().min(1).max(200).nullable()
    .default(null),

  winMargin: z
    .number().int().min(1).max(10)
    .default(2),

  periodsPerMatch: z
    .number().int().min(1).max(10)
    .default(2),

  maxSubstitutions: z
    .number().int().min(0).max(50).nullable()
    .default(null),

  hasRotation: z.boolean().default(false),
});

/** Full create schema — all required fields + cross-field validations. */
export const createSportSchema = sportBaseSchema
  .refine(
    (data) => !data.hasSets || data.setsToWin !== null,
    { message: 'setsToWin is required when hasSets is true', path: ['setsToWin'] },
  )
  .refine(
    (data) => !data.hasSets || data.pointsPerSet !== null,
    { message: 'pointsPerSet is required when hasSets is true', path: ['pointsPerSet'] },
  )
  .refine(
    (data) => !data.hasRotation || data.hasSets,
    { message: 'hasRotation can only be true for set-based sports (hasSets must be true)', path: ['hasRotation'] },
  );

/**
 * Update schema — all fields optional.
 * .partial() must be called on the base ZodObject before .refine(),
 * otherwise ZodEffects does not expose .partial().
 */
export const updateSportSchema = sportBaseSchema
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' },
  )
  .refine(
    (data) => data.hasSets === undefined || !data.hasSets || data.setsToWin !== undefined,
    { message: 'setsToWin is required when setting hasSets to true', path: ['setsToWin'] },
  )
  .refine(
    (data) => data.hasRotation === undefined || !data.hasRotation || data.hasSets !== false,
    { message: 'hasRotation can only be true for set-based sports', path: ['hasRotation'] },
  );

export const sportIdSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export type CreateSportDto = z.infer<typeof createSportSchema>;
export type UpdateSportDto = z.infer<typeof updateSportSchema>;
