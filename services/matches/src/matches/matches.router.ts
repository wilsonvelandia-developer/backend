import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError } from '@tournament/shared';
import { MatchesService } from './matches.service.js';
import {
  createMatchSchema, matchIdSchema, listMatchesSchema,
  updatePeriodScoreSchema, periodParamsSchema,
  registerLineupSchema, rotateTeamSchema,
  substitutionSchema,
} from './matches.schema.js';

/**
 * Matches router.
 *
 * Match lifecycle:
 *   POST   /matches                              → schedule match
 *   GET    /matches                              → list matches (filter by phase, team, status)
 *   GET    /matches/:id                          → get match detail with periods
 *   DELETE /matches/:id                          → delete scheduled match
 *   PUT    /matches/:id/start                    → start match (creates periods)
 *   PUT    /matches/:id/finish                   → finish match (computes winner)
 *
 * Scoring:
 *   PUT    /matches/:id/periods/:periodNumber/score → update period score
 *
 * Volleyball:
 *   POST   /matches/:id/lineups                  → register starting lineup
 *   GET    /matches/:id/lineups/:teamId/:set      → get current lineup
 *   POST   /matches/:id/rotate                   → apply rotation
 *
 * Substitutions:
 *   POST   /matches/:id/substitutions            → record substitution
 *   GET    /matches/:id/substitutions            → list substitutions
 */
export function buildMatchesRouter(service: MatchesService): Router {
  const router = Router();

  function parseZodError(err: ZodError): Record<string, string> {
    return Object.fromEntries(err.errors.map((e) => [e.path.join('.'), e.message]));
  }

  // ── Match CRUD & lifecycle ────────────────────────────────────────────────

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = listMatchesSchema.parse(req.query);
      const matches = await service.getAll(filters);
      res.json({ data: matches });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid query parameters', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const detail = await service.getById(id);
      res.json({ data: detail });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = createMatchSchema.parse(req.body);
      const match = await service.create(dto);
      res.status(201).json({ data: match });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match data', parseZodError(err)));
      next(err);
    }
  });

  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      await service.delete(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  router.put('/:id/start', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const detail = await service.startMatch(id);
      res.json({ data: detail });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  router.put('/:id/finish', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const detail = await service.finishMatch(id);
      res.json({ data: detail });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  // ── Scoring ───────────────────────────────────────────────────────────────

  router.put('/:id/periods/:periodNumber/score', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, periodNumber } = periodParamsSchema.parse(req.params);
      const dto = updatePeriodScoreSchema.parse(req.body);
      const detail = await service.updatePeriodScore(id, periodNumber, dto);
      res.json({ data: detail });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid score data', parseZodError(err)));
      next(err);
    }
  });

  // ── Volleyball ────────────────────────────────────────────────────────────

  router.post('/:id/lineups', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const dto = registerLineupSchema.parse(req.body);
      const lineup = await service.registerLineup(id, dto);
      res.status(201).json({ data: lineup });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid lineup data', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id/lineups/:teamId/:setNumber', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const teamId    = req.params['teamId'] as string;
      const setNumber = parseInt(req.params['setNumber'] as string, 10);
      const lineup = await service.getLineup(id, teamId, setNumber);
      res.json({ data: lineup });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid parameters', parseZodError(err)));
      next(err);
    }
  });

  router.post('/:id/rotate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const dto = rotateTeamSchema.parse(req.body);
      const lineup = await service.rotateTeam(id, dto);
      res.json({ data: lineup });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid rotation data', parseZodError(err)));
      next(err);
    }
  });

  // ── Substitutions ─────────────────────────────────────────────────────────

  router.post('/:id/substitutions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const dto = substitutionSchema.parse(req.body);
      const sub = await service.addSubstitution(id, dto);
      res.status(201).json({ data: sub });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid substitution data', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id/substitutions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const subs = await service.getSubstitutions(id);
      res.json({ data: subs });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  return router;
}
