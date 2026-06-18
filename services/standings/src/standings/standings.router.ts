import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError } from '@tournament/shared';
import { StandingsService } from './standings.service.js';
import { phaseIdSchema, recalculateSchema } from './standings.schema.js';

export function buildStandingsRouter(service: StandingsService): Router {
  const router = Router();

  function parseZodError(err: ZodError): Record<string, string> {
    return Object.fromEntries(err.errors.map((e) => [e.path.join('.'), e.message]));
  }

  // GET /standings/groups/:tournamentId — standings per group
  router.get('/groups/:tournamentId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params['tournamentId'] as string;
      const result = await service.getByGroups(tournamentId);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

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
