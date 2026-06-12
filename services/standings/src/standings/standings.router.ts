import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError } from '@tournament/shared';
import { StandingsService } from './standings.service.js';
import { phaseIdSchema, recalculateSchema } from './standings.schema.js';

/**
 * Standings router.
 *
 * Public read:
 *   GET  /standings/:phaseId           → current standings for a phase
 *
 * Internal recalculation (called by matches service after a result changes):
 *   POST /standings/recalculate        → rebuild standings for a phase
 */
export function buildStandingsRouter(service: StandingsService): Router {
  const router = Router();

  function parseZodError(err: ZodError): Record<string, string> {
    return Object.fromEntries(err.errors.map((e) => [e.path.join('.'), e.message]));
  }

  // GET /standings/:phaseId
  router.get('/:phaseId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phaseId } = phaseIdSchema.parse(req.params);
      const standings = await service.getByPhase(phaseId);
      res.json({ data: standings });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid phaseId', parseZodError(err)));
      next(err);
    }
  });

  // POST /standings/recalculate
  // Internal endpoint — called by the matches service after finishing a match.
  // In production this would be protected by an internal network policy.
  router.post('/recalculate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phaseId } = recalculateSchema.parse(req.body);
      const standings = await service.recalculate(phaseId);
      res.json({ data: standings });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid recalculate request', parseZodError(err)));
      next(err);
    }
  });

  return router;
}
