import { z } from 'zod';

export const createVenueSchema = z.object({
  tournamentId: z.string().uuid().nullable().default(null),
  name:         z.string().trim().min(2).max(200),
  address:      z.string().max(500).nullable().default(null),
  city:         z.string().max(100).nullable().default(null),
  locationUrl:  z.string().max(500).nullable().default(null),
  mapUrl:       z.string().max(500).nullable().default(null),
  capacity:     z.number().int().min(1).nullable().default(null),
  surfaceType:  z.string().max(50).nullable().default(null),
  imageUrl:     z.string().max(1000).nullable().default(null),
  phone:        z.string().max(30).nullable().default(null),
  email:        z.string().max(200).nullable().default(null),
  description:  z.string().max(2000).nullable().default(null),
});

export const updateVenueSchema = z.object({
  name:        z.string().trim().min(2).max(200).optional(),
  address:     z.string().max(500).nullable().optional(),
  city:        z.string().max(100).nullable().optional(),
  locationUrl: z.string().max(500).nullable().optional(),
  mapUrl:      z.string().max(500).nullable().optional(),
  capacity:    z.number().int().min(1).nullable().optional(),
  surfaceType: z.string().max(50).nullable().optional(),
  imageUrl:    z.string().max(1000).nullable().optional(),
  phone:       z.string().max(30).nullable().optional(),
  email:       z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  isActive:    z.boolean().optional(),
  status:      z.enum(['active', 'inactive', 'maintenance']).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });

export const venueIdSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const venueQuerySchema = z.object({
  tournamentId: z.string().uuid().optional(),
  search:       z.string().max(100).optional(),
});

export type CreateVenueDto = z.infer<typeof createVenueSchema>;
export type UpdateVenueDto = z.infer<typeof updateVenueSchema>;
