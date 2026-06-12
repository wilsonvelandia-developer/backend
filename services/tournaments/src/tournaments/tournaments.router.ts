import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError } from '@tournament/shared';
import { TournamentsService } from './tournaments.service.js';
import {
  createTournamentSchema, updateTournamentSchema, tournamentIdSchema,
  createPhaseSchema, updatePhaseSchema, phaseParamsSchema,
  listTournamentsSchema,
} from './tournaments.schema.js';

/**
 * Tournaments router.
 *
 * Tournament routes:
 *   GET    /tournaments                         → list (with filters)
 *   GET    /tournaments/:id                     → get one
 *   POST   /tournaments                         → create
 *   PUT    /tournaments/:id                     → update
 *   DELETE /tournaments/:id                     → delete
 *
 * Phase routes (nested under tournament):
 *   GET    /tournaments/:id/phases              → list phases
 *   GET    /tournaments/:id/phases/:phaseId     → get one phase
 *   POST   /tournaments/:id/phases              → add phase
 *   PUT    /tournaments/:id/phases/:phaseId     → update phase
 *   DELETE /tournaments/:id/phases/:phaseId     → delete phase
 */
export function buildTournamentsRouter(service: TournamentsService): Router {
  const router = Router();

  function parseZodError(err: ZodError): Record<string, string> {
    return Object.fromEntries(err.errors.map((e) => [e.path.join('.'), e.message]));
  }

  // ── Tournament CRUD ───────────────────────────────────────────────────────

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = listTournamentsSchema.parse(req.query);
      const tournaments = await service.getAll(filters);
      res.json({ data: tournaments });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid query parameters', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const tournament = await service.getById(id);
      res.json({ data: tournament });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid tournament id', parseZodError(err)));
      next(err);
    }
  });

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = createTournamentSchema.parse(req.body);
      const tournament = await service.create(dto);
      res.status(201).json({ data: tournament });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid tournament data', parseZodError(err)));
      next(err);
    }
  });

  router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const dto = updateTournamentSchema.parse(req.body);
      const tournament = await service.update(id, dto);
      res.json({ data: tournament });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid tournament data', parseZodError(err)));
      next(err);
    }
  });

  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      await service.delete(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid tournament id', parseZodError(err)));
      next(err);
    }
  });

  // ── Phase CRUD (nested) ───────────────────────────────────────────────────

  router.get('/:id/phases', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const phases = await service.getPhases(id);
      res.json({ data: phases });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid tournament id', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id/phases/:phaseId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, phaseId } = phaseParamsSchema.parse(req.params);
      const phase = await service.getPhaseById(id, phaseId);
      res.json({ data: phase });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid parameters', parseZodError(err)));
      next(err);
    }
  });

  router.post('/:id/phases', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const dto = createPhaseSchema.parse(req.body);
      const phase = await service.createPhase(id, dto);
      res.status(201).json({ data: phase });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid phase data', parseZodError(err)));
      next(err);
    }
  });

  router.put('/:id/phases/:phaseId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, phaseId } = phaseParamsSchema.parse(req.params);
      const dto = updatePhaseSchema.parse(req.body);
      const phase = await service.updatePhase(id, phaseId, dto);
      res.json({ data: phase });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid phase data', parseZodError(err)));
      next(err);
    }
  });

  router.delete('/:id/phases/:phaseId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, phaseId } = phaseParamsSchema.parse(req.params);
      await service.deletePhase(id, phaseId);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid parameters', parseZodError(err)));
      next(err);
    }
  });

  return router;
}
