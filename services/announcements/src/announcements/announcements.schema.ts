import { z } from 'zod';

export const createAnnouncementSchema = z.object({
  tournamentId: z.string().uuid().nullable()
    .or(z.literal('').transform(() => null))
    .default(null),
  title:        z.string().trim().min(2).max(200),
  content:      z.string().trim().min(1).max(10000),
  priority:     z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  status:       z.enum(['draft', 'published', 'archived']).default('draft'),
  isPinned:     z.boolean().default(false),
  imageUrl:     z.string().max(1000).nullable()
    .or(z.literal('').transform(() => null))
    .default(null),
  expiresAt:    z.string().datetime().nullable().default(null),
});

export const updateAnnouncementSchema = z.object({
  tournamentId: z.string().uuid().nullable()
    .or(z.literal('').transform(() => null))
    .optional(),
  title:    z.string().trim().min(2).max(200).optional(),
  content:  z.string().trim().min(1).max(10000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status:   z.enum(['draft', 'published', 'archived']).optional(),
  isPinned: z.boolean().optional(),
  imageUrl: z.string().max(1000).nullable()
    .or(z.literal('').transform(() => null))
    .optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });

export const announcementIdSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const announcementQuerySchema = z.object({
  tournamentId: z.string().uuid().optional(),
  priority:     z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

export type CreateAnnouncementDto = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementDto = z.infer<typeof updateAnnouncementSchema>;
