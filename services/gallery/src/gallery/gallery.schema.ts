import { z } from 'zod';

export const createGalleryPhotoSchema = z.object({
  tournamentId: z.string().uuid().nullable()
    .or(z.literal('').transform(() => null))
    .default(null),
  matchId:      z.string().uuid().nullable()
    .or(z.literal('').transform(() => null))
    .default(null),
  teamId:       z.string().uuid().nullable()
    .or(z.literal('').transform(() => null))
    .default(null),
  // Support both album-style (title+coverUrl) and direct photo (url)
  title:        z.string().trim().min(2).max(200).optional(),
  description:  z.string().max(2000).nullable()
    .or(z.literal('').transform(() => null))
    .optional(),
  coverUrl:     z.string().max(1000).nullable()
    .or(z.literal('').transform(() => null))
    .optional(),
  url:          z.string().max(1000).optional(),
  thumbnailUrl: z.string().max(1000).nullable()
    .or(z.literal('').transform(() => null))
    .default(null),
  caption:      z.string().max(500).nullable()
    .or(z.literal('').transform(() => null))
    .default(null),
});

export const galleryPhotoIdSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const galleryQuerySchema = z.object({
  tournamentId: z.string().uuid().optional(),
  matchId:      z.string().uuid().optional(),
  teamId:       z.string().uuid().optional(),
  page:         z.coerce.number().int().min(1).optional(),
  pageSize:     z.coerce.number().int().min(1).max(100).optional(),
});

export type CreateGalleryPhotoDto = z.infer<typeof createGalleryPhotoSchema>;
