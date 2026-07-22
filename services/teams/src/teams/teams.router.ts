import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError, AuditService } from '@tournament/shared';
import { TeamsService } from './teams.service.js';
import {
  createTeamSchema, updateTeamSchema, teamIdSchema,
  createPlayerSchema, updatePlayerSchema, playerParamsSchema,
  listTeamsSchema,
} from './teams.schema.js';

/** Roles that should NOT see sensitive player data (documents, EPS, parent info). */
const PUBLIC_ROLES = ['player', 'parent', 'companion', 'observer'];

/** Sensitive fields that are stripped for public roles. */
const SENSITIVE_FIELDS = [
  'documentNumber', 'document_number',
  'documentType', 'document_type',
  'documentFrontUrl', 'document_front_url',
  'documentBackUrl', 'document_back_url',
  'epsFileUrl', 'eps_file_url',
  'parentName', 'parent_name',
  'parentPhone', 'parent_phone',
  'parentEmail', 'parent_email',
  'address', 'birthDate', 'birth_date',
];

/** Parse x-user-roles header into string array. */
function parseRolesHeader(req: Request): string[] {
  try {
    const raw = req.headers['x-user-roles'] as string | undefined;
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch { return []; }
}

/** Returns true if the user should see a reduced DTO (no sensitive data). */
function shouldFilterSensitiveData(roles: string[]): boolean {
  if (roles.length === 0) return true;
  if (roles.includes('admin') || roles.includes('organizer')) return false;
  if (roles.includes('coach') || roles.includes('president')) return false;
  // All other roles get filtered data
  return roles.every((r) => PUBLIC_ROLES.includes(r) || ['assistant', 'delegate', 'fitness_coach', 'coordinator', 'referee'].includes(r));
}

/** Strips sensitive fields from a player object. */
function stripSensitivePlayerFields(player: unknown): Record<string, unknown> {
  const filtered = { ...(player as Record<string, unknown>) };
  for (const field of SENSITIVE_FIELDS) {
    delete filtered[field];
  }
  return filtered;
}

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
export function buildTeamsRouter(service: TeamsService, audit?: AuditService): Router {
  const router = Router();

  function parseZodError(err: ZodError): Record<string, string> {
    return Object.fromEntries(err.errors.map((e) => [e.path.join('.'), e.message]));
  }

  // ── Teams CRUD ────────────────────────────────────────────────────────────

  // GET /teams/my-teams — get teams linked to the current user (via players.user_id)
  router.get('/my-teams', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.headers['x-user-id'] as string | undefined;
      if (!userId) {
        res.json({ data: [] });
        return;
      }
      const teams = await service.getTeamsForUser(userId);
      res.json({ data: teams });
    } catch (err) { next(err); }
  });

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = listTeamsSchema.parse(req.query);
      const result  = await service.getAll(filters);
      res.json({
        data:     result.data,
        total:    result.total,
        page:     result.page,
        pageSize: result.pageSize,
      });
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
      const userId = req.headers['x-user-id'] as string | undefined;
      audit?.log({ tableName: 'teams', recordId: team.id, action: 'INSERT', performedBy: userId ?? null, newData: team as unknown as Record<string, unknown> });
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
      const userId = req.headers['x-user-id'] as string | undefined;
      audit?.log({ tableName: 'teams', recordId: id, action: 'UPDATE', performedBy: userId ?? null, newData: team as unknown as Record<string, unknown> });
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
      const userId = req.headers['x-user-id'] as string | undefined;
      audit?.log({ tableName: 'teams', recordId: id, action: 'DELETE', performedBy: userId ?? null });
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

      // Filter sensitive fields for public/read-only roles
      const userRoles = parseRolesHeader(req);
      const filtered = shouldFilterSensitiveData(userRoles)
        ? players.map(stripSensitivePlayerFields)
        : players;

      res.json({ data: filtered });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid team id', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id/players/:playerId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, playerId } = playerParamsSchema.parse(req.params);
      const player = await service.getPlayerById(id, playerId);

      // Filter sensitive fields for public/read-only roles
      const userRoles = parseRolesHeader(req);
      const filtered = shouldFilterSensitiveData(userRoles)
        ? stripSensitivePlayerFields(player)
        : player;

      res.json({ data: filtered });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid parameters', parseZodError(err)));
      next(err);
    }
  });

  // GET /teams/:id/players/:playerId/stats — aggregated player statistics
  router.get('/:id/players/:playerId/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId } = playerParamsSchema.parse(req.params);
      const stats = await service.getPlayerStats(playerId);
      res.json({ data: stats });
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
