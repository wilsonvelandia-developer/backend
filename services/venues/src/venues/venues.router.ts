import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError } from '@tournament/shared';
import { VenuesService } from './venues.service.js';
import { createVenueSchema, updateVenueSchema, venueIdSchema, venueQuerySchema } from './venues.schema.js';

export function buildVenuesRouter(service: VenuesService): Router {
  const router = Router();

  function parseZodError(err: ZodError): Record<string, string> {
    return Object.fromEntries(err.errors.map((e) => [e.path.join('.'), e.message]));
  }

  function requireRole(...roles: string[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
      const role = req.headers['x-user-role'] as string | undefined;
      if (!role || !roles.includes(role)) {
        return next(new ValidationError('Insufficient permissions'));
      }
      next();
    };
  }

  // GET /venues
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = venueQuerySchema.parse(req.query);
      const venues = await service.getAll(q.tournamentId, q.search);
      res.json({ data: venues });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid query', parseZodError(err)));
      next(err);
    }
  });

  // GET /venues/:id
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = venueIdSchema.parse(req.params);
      const venue = await service.getById(id);
      res.json({ data: venue });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid id', parseZodError(err)));
      next(err);
    }
  });

  // POST /venues
  router.post('/', requireRole('admin', 'organizer'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = createVenueSchema.parse(req.body);
      const venue = await service.create(dto);
      res.status(201).json({ data: venue });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid venue data', parseZodError(err)));
      next(err);
    }
  });

  // PUT /venues/:id
  router.put('/:id', requireRole('admin', 'organizer'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = venueIdSchema.parse(req.params);
      const dto = updateVenueSchema.parse(req.body);
      const venue = await service.update(id, dto);
      res.json({ data: venue });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid venue data', parseZodError(err)));
      next(err);
    }
  });

  // DELETE /venues/:id
  router.delete('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = venueIdSchema.parse(req.params);
      await service.delete(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid id', parseZodError(err)));
      next(err);
    }
  });

  return router;
}
