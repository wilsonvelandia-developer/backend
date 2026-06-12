import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError } from '@tournament/shared';
import { TeamsService } from './teams.service.js';
import {
  createTeamSchema, updateTeamSchema, teamIdSchema,
  createPlayerSchema, updatePlayerSchema, playerParamsSchema,
  listTeamsSchema,
} from './teams.schema.js';

/**
 * Teams router.
 *
 * Team routes:
 *   GET    /teams                        → list teams (filter by tournamentId)
 *   GET    /teams/:id                    → get one team
 *   POST   /teams                        → create team
 *   PUT    /teams/:id                    → update team
 *   DELETE /teams/:id                    → delete team
 *
 * Player routes (nested under team):
 *   GET    /teams/:id/players            → list players
 *   GET    /teams/:id/players/:playerId  → get one player
 *   POST   /teams/:id/players            → add player (validates roster limit)
 *   PUT    /teams/:id/players/:playerId  → update player
 *   DELETE /teams/:id/players/:playerId  → delete player
 */
export function buildTeamsRouter(service: TeamsService): Router {
  const router = Router();

  function parseZodError(err: ZodError): Record<string, string> {
    return Object.fromEntries(err.errors.map((e) => [e.path.join('.'), e.message]));
  }

  // ── Teams CRUD ────────────────────────────────────────────────────────────

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = listTeamsSchema.parse(req.query);
      const teams = await service.getAll(filters);
      res.json({ data: teams });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid query parameters', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = teamIdSchema.parse(req.params);
      const team = await service.getById(id);
      res.json({ data: team });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid team id', parseZodError(err)));
      next(err);
    }
  });

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = createTeamSchema.parse(req.body);
      const team = await service.create(dto);
      res.status(201).json({ data: team });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid team data', parseZodError(err)));
      next(err);
    }
  });

  router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = teamIdSchema.parse(req.params);
      const dto = updateTeamSchema.parse(req.body);
      const team = await service.update(id, dto);
      res.json({ data: team });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid team data', parseZodError(err)));
      next(err);
    }
  });

  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = teamIdSchema.parse(req.params);
      await service.delete(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid team id', parseZodError(err)));
      next(err);
    }
  });

  // ── Players CRUD (nested) ─────────────────────────────────────────────────

  router.get('/:id/players', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = teamIdSchema.parse(req.params);
      const players = await service.getPlayers(id);
      res.json({ data: players });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid team id', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id/players/:playerId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, playerId } = playerParamsSchema.parse(req.params);
      const player = await service.getPlayerById(id, playerId);
      res.json({ data: player });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid parameters', parseZodError(err)));
      next(err);
    }
  });

  router.post('/:id/players', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = teamIdSchema.parse(req.params);
      const dto = createPlayerSchema.parse(req.body);
      const player = await service.createPlayer(id, dto);
      res.status(201).json({ data: player });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid player data', parseZodError(err)));
      next(err);
    }
  });

  router.put('/:id/players/:playerId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, playerId } = playerParamsSchema.parse(req.params);
      const dto = updatePlayerSchema.parse(req.body);
      const player = await service.updatePlayer(id, playerId, dto);
      res.json({ data: player });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid player data', parseZodError(err)));
      next(err);
    }
  });

  router.delete('/:id/players/:playerId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, playerId } = playerParamsSchema.parse(req.params);
      await service.deletePlayer(id, playerId);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid parameters', parseZodError(err)));
      next(err);
    }
  });

  return router;
}
