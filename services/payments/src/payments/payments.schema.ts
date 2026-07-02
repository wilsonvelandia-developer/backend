import { z } from 'zod';

export const createPaymentSchema = z.object({
  tournamentId:  z.string().uuid(),
  teamId:        z.string().uuid(),
  amount:        z.union([
    z.number().positive(),
    z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format').transform(Number),
  ]),
  currency:      z.string().min(1).max(3).default('COP'),
  method:        z.enum(['cash', 'transfer', 'card', 'other']).default('cash'),
  paymentMethod: z.string().max(50).nullable().optional(),
  reference:     z.string().max(200).nullable()
    .or(z.literal('').transform(() => null))
    .default(null),
  notes:         z.string().max(5000).nullable()
    .or(z.literal('').transform(() => null))
    .default(null),
  status:        z.enum(['pending', 'confirmed', 'rejected', 'refunded']).default('confirmed'),
  paidAt:        z.string().datetime().nullable().default(null),
});

export const updatePaymentSchema = z.object({
  amount:        z.union([
    z.number().positive(),
    z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number),
  ]).optional(),
  currency:      z.string().min(1).max(3).optional(),
  method:        z.enum(['cash', 'transfer', 'card', 'other']).optional(),
  paymentMethod: z.string().max(50).nullable().optional(),
  reference:     z.string().max(200).nullable()
    .or(z.literal('').transform(() => null))
    .optional(),
  notes:         z.string().max(5000).nullable()
    .or(z.literal('').transform(() => null))
    .optional(),
  status:        z.enum(['pending', 'confirmed', 'rejected', 'refunded']).optional(),
  paidAt:        z.string().datetime().nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });

export const paymentIdSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const paymentQuerySchema = z.object({
  tournamentId: z.string().uuid().optional(),
  teamId:       z.string().uuid().optional(),
  status:       z.enum(['pending', 'confirmed', 'rejected', 'refunded']).optional(),
  pageSize:     z.coerce.number().int().min(1).max(100).optional(),
});

export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentDto = z.infer<typeof updatePaymentSchema>;
