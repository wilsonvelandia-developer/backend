import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError } from '@tournament/shared';
import { MatchesService } from './matches.service.js';
import {
  createMatchSchema, matchIdSchema, listMatchesSchema,
  updatePeriodScoreSchema, periodParamsSchema,
  registerLineupSchema, rotateTeamSchema,
  substitutionSchema,
  createSanctionSchema, createMatchEventSchema, createScorerSchema,
  matchSetupSchema, saveLineupSchema,
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

  // GET /matches/for-referee — matches from referee's assigned tournaments
  router.get('/for-referee', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.headers['x-user-id'] as string | undefined;
      if (!userId) {
        res.status(401).json({ data: null, success: false, message: 'User ID required' });
        return;
      }
      const status = req.query['status'] as string | undefined;
      const matches = await service.getMatchesForReferee(userId, status);
      res.json({ data: matches });
    } catch (err) {
      next(err);
    }
  });

  // GET /matches/sanctions?tournamentId=X — aggregated sanctions for a tournament
  router.get('/sanctions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.query['tournamentId'] as string | undefined;
      if (!tournamentId) {
        res.status(400).json({ data: null, success: false, message: 'tournamentId is required' });
        return;
      }
      const sanctions = await service.getTournamentSanctions(tournamentId);
      res.json({ data: sanctions });
    } catch (err) {
      next(err);
    }
  });

  // GET /matches/scorers?tournamentId=X — top scorers for a tournament
  router.get('/scorers', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.query['tournamentId'] as string | undefined;
      if (!tournamentId) {
        res.status(400).json({ data: null, success: false, message: 'tournamentId is required' });
        return;
      }
      const scorers = await service.getTournamentScorers(tournamentId);
      res.json({ data: scorers });
    } catch (err) {
      next(err);
    }
  });

  // GET /matches/referees?refereeId=X — assignment history for a referee
  router.get('/referees', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refereeId = req.query['refereeId'] as string | undefined;
      if (!refereeId) {
        res.status(400).json({ data: null, success: false, message: 'refereeId is required' });
        return;
      }
      const assignments = await service.getRefereeAssignments(refereeId);
      res.json({ data: assignments });
    } catch (err) {
      next(err);
    }
  });

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

  // ── PATCH /matches/:id/schedule — update date/time/venue ───────────────────
  router.patch('/:id/schedule', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const { scheduledAt, venue } = req.body as { scheduledAt?: string; venue?: string };

      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (scheduledAt !== undefined) { fields.push(`scheduled_at = $${idx++}`); values.push(scheduledAt); }
      if (venue !== undefined)       { fields.push(`venue = $${idx++}`);        values.push(venue); }

      if (fields.length === 0) {
        res.status(400).json({ data: null, success: false, message: 'No fields to update' });
        return;
      }

      fields.push(`updated_at = NOW()`);
      values.push(id);

      // Direct pool access for this simple update
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
      const result = await pool.query(
        `UPDATE matches SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values,
      );
      await pool.end();

      if (result.rowCount === 0) {
        res.status(404).json({ data: null, success: false, message: 'Match not found' });
        return;
      }
      res.json({ data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  });

  // ── Sanctions ─────────────────────────────────────────────────────────────

  router.post('/:id/sanctions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const dto = createSanctionSchema.parse(req.body);
      const sanction = await service.addSanction(id, dto);
      res.status(201).json({ data: sanction });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid sanction data', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id/sanctions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const sanctions = await service.getSanctions(id);
      res.json({ data: sanctions });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id/sanctions/by-player/:teamId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const teamId = req.params['teamId'] as string;
      const sanctions = await service.getSanctionsByPlayer(id, teamId);
      res.json({ data: sanctions });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid parameters', parseZodError(err)));
      next(err);
    }
  });

  // GET /matches/:id/sanctions/types — get sanction types for the match's tournament
  router.get('/:id/sanctions/types', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const types = await service.getSanctionTypesForMatch(id);
      res.json({ data: types });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  // ── Match Events ──────────────────────────────────────────────────────────

  router.post('/:id/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const dto = createMatchEventSchema.parse(req.body);
      const event = await service.addEvent(id, dto);
      res.status(201).json({ data: event });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid event data', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const events = await service.getEvents(id);
      res.json({ data: events });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  // ── Match Scorers ─────────────────────────────────────────────────────────

  router.post('/:id/scorers', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const dto = createScorerSchema.parse(req.body);
      const scorer = await service.addScorer(id, dto);
      res.status(201).json({ data: scorer });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid scorer data', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id/scorers', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const scorers = await service.getScorers(id);
      res.json({ data: scorers });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  router.delete('/:id/scorers/last', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      await service.undoLastScorer(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  router.delete('/:id/events/last', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      await service.undoLastEvent(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  // ── Match Setup ───────────────────────────────────────────────────────────

  router.put('/:id/setup', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const dto = matchSetupSchema.parse(req.body);
      await service.saveSetup(id, dto);
      const setup = await service.getSetup(id);
      res.json({ data: setup });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid setup data', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id/setup', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const setup = await service.getSetup(id);
      res.json({ data: setup });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  // ── Match Lineups (starting lineup per team) ──────────────────────────────

  router.post('/:id/match-lineups', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const dto = saveLineupSchema.parse(req.body);
      const lineup = await service.saveMatchLineup(id, dto);
      res.status(201).json({ data: lineup });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid lineup data', parseZodError(err)));
      next(err);
    }
  });

  router.get('/:id/match-lineups/:teamId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const teamId = req.params['teamId'] as string;
      const periodNumber = req.query['periodNumber'] ? parseInt(req.query['periodNumber'] as string, 10) : undefined;
      const lineup = await service.getMatchLineup(id, teamId, periodNumber);
      res.json({ data: lineup });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid parameters', parseZodError(err)));
      next(err);
    }
  });

  // ── Sport Rules (public — used by referee panel) ──────────────────────────

  router.get('/:id/sport-rules', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const rules = await service.getSportRules(id);
      res.json({ data: rules });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  // ── Match Referees ────────────────────────────────────────────────────────

  router.get('/:id/referees', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const referees = await service.getMatchReferees(id);
      res.json({ data: referees });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid match id', parseZodError(err)));
      next(err);
    }
  });

  router.post('/:id/referees', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const { userId, refereeRole } = req.body as { userId: string; refereeRole?: string };
      if (!userId) {
        res.status(400).json({ data: null, success: false, message: 'userId is required' });
        return;
      }
      const result = await service.assignReferee(id, userId, refereeRole ?? 'principal');
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id/referees/:userId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = matchIdSchema.parse(req.params);
      const userId = req.params['userId'] as string;
      await service.removeReferee(id, userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
