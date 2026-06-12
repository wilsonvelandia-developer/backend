import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError } from '@tournament/shared';
import { SportsService } from './sports.service.js';
import {
  createSportSchema,
  updateSportSchema,
  sportIdSchema,
} from './sports.schema.js';

/**
 * Sports router — REST endpoints for the sports domain.
 *
 * Routes:
 *   GET    /sports          → list all sports
 *   GET    /sports/:id      → get one sport by UUID
 *   POST   /sports          → create a sport
 *   PUT    /sports/:id      → update a sport (partial)
 *   DELETE /sports/:id      → delete a sport
 *
 * All inputs are validated with Zod before reaching the service layer.
 * Zod errors are converted to ValidationError (422) with field-level details.
 *
 * Note: Authorization (admin-only for write ops) is enforced via the
 * X-User-Role header injected by the gateway's auth middleware.
 */
export function buildSportsRouter(service: SportsService): Router {
  const router = Router();

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Parses Zod errors into a flat details object for the error response. */
  function parseZodError(err: ZodError): Record<string, string> {
    return Object.fromEntries(
      err.errors.map((e) => [e.path.join('.'), e.message]),
    );
  }

  /** Verifies the caller has one of the allowed roles (set by the gateway). */
  function requireRole(...roles: string[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
      const role = req.headers['x-user-role'] as string | undefined;
      if (!role || !roles.includes(role)) {
        return next(
          new ValidationError('Insufficient permissions for this operation'),
        );
      }
      next();
    };
  }

  // ── GET /sports ───────────────────────────────────────────────────────────
  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sports = await service.getAll();
      res.json({ data: sports });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /sports/:id ───────────────────────────────────────────────────────
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = sportIdSchema.parse(req.params);
      const sport = await service.getById(id);
      res.json({ data: sport });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid sport id', parseZodError(err)));
      next(err);
    }
  });

  // ── POST /sports ──────────────────────────────────────────────────────────
  router.post(
    '/',
    requireRole('admin'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const dto = createSportSchema.parse(req.body);
        const sport = await service.create(dto);
        res.status(201).json({ data: sport });
      } catch (err) {
        if (err instanceof ZodError) return next(new ValidationError('Invalid sport data', parseZodError(err)));
        next(err);
      }
    },
  );

  // ── PUT /sports/:id ───────────────────────────────────────────────────────
  router.put(
    '/:id',
    requireRole('admin'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = sportIdSchema.parse(req.params);
        const dto = updateSportSchema.parse(req.body);
        const sport = await service.update(id, dto);
        res.json({ data: sport });
      } catch (err) {
        if (err instanceof ZodError) return next(new ValidationError('Invalid sport data', parseZodError(err)));
        next(err);
      }
    },
  );

  // ── DELETE /sports/:id ────────────────────────────────────────────────────
  router.delete(
    '/:id',
    requireRole('admin'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = sportIdSchema.parse(req.params);
        await service.delete(id);
        res.status(204).send();
      } catch (err) {
        if (err instanceof ZodError) return next(new ValidationError('Invalid sport id', parseZodError(err)));
        next(err);
      }
    },
  );

  return router;
}
