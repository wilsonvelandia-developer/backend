import { z } from 'zod';

export const phaseIdSchema = z.object({
  phaseId: z.string().uuid('phaseId must be a valid UUID'),
});

export const recalculateSchema = z.object({
  phaseId: z.string().uuid('phaseId must be a valid UUID'),
});

export type RecalculateDto = z.infer<typeof recalculateSchema>;
