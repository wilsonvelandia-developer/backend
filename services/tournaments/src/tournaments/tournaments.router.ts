import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError, AuditService } from '@tournament/shared';
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
export function buildTournamentsRouter(service: TournamentsService, audit?: AuditService): Router {
  const router = Router();

  function parseZodError(err: ZodError): Record<string, string> {
    return Object.fromEntries(err.errors.map((e) => [e.path.join('.'), e.message]));
  }

  // ── Tournament CRUD ───────────────────────────────────────────────────────

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = listTournamentsSchema.parse(req.query);
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

      // Auto-register the creator as organizer of the tournament
      const userId = req.headers['x-user-id'] as string | undefined;
      if (userId) {
        await service.registerStaff(tournament.id, userId, 'organizer');
      }

      audit?.log({ tableName: 'tournaments', recordId: tournament.id, action: 'INSERT', performedBy: userId ?? null, newData: tournament as unknown as Record<string, unknown> });

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
      const userId = req.headers['x-user-id'] as string | undefined;

      audit?.log({ tableName: 'tournaments', recordId: id, action: 'UPDATE', performedBy: userId ?? null, newData: tournament as unknown as Record<string, unknown> });

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
      const userId = req.headers['x-user-id'] as string | undefined;

      audit?.log({ tableName: 'tournaments', recordId: id, action: 'DELETE', performedBy: userId ?? null });

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

  // ── Group Draw endpoints ──────────────────────────────────────────────────

  // GET /tournaments/:id/groups — get group draw
  router.get('/:id/groups', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const groups = await service.getGroups(id);
      res.json({ data: groups });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid id', parseZodError(err)));
      next(err);
    }
  });

  // POST /tournaments/:id/groups — save group draw
  router.post('/:id/groups', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const assignments = req.body as Array<{ teamId: string; groupName: string; drawOrder: number }>;
      await service.saveGroupDraw(id, assignments);
      const groups = await service.getGroups(id);
      res.status(201).json({ data: groups });
    } catch (err) {
      next(err);
    }
  });

  // POST /tournaments/:id/generate-fixture — generate group phase matches
  router.post('/:id/generate-fixture', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const config = req.body as {
        startDate?: string;
        matchDurationMinutes?: number;
        matchesPerDay?: number;
        firstMatchTime?: string;
        randomOrder?: boolean;
      };
      const matches = await service.generateGroupFixture(id, config);
      res.status(201).json({ data: matches });
    } catch (err) {
      next(err);
    }
  });

  // POST /tournaments/:id/generate-knockout — create knockout phase from group standings
  router.post('/:id/generate-knockout', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const config = req.body as {
        teamsPerGroup?: number;
        startDate?: string;
        matchDurationMinutes?: number;
        includeThirdPlace?: boolean;
      };
      const matches = await service.generateKnockoutFromStandings(id, config);
      res.status(201).json({ data: matches });
    } catch (err) {
      next(err);
    }
  });

  // ── Cups CRUD ─────────────────────────────────────────────────────────────

  router.get('/:id/cups', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const result = await service.getCups(id);
      res.json({ data: result });
    } catch (err) { next(err); }
  });

  router.post('/:id/cups', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const cups = req.body as Array<{ name: string; orderIndex: number; groupPositionsFrom: number; groupPositionsTo: number; hasSemifinals: boolean; hasThirdPlace: boolean }>;
      await service.saveCups(id, cups);
      const result = await service.getCups(id);
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  });

  // ── Sanction Types CRUD ───────────────────────────────────────────────────

  router.get('/:id/sanction-types', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const result = await service.getSanctionTypes(id);
      res.json({ data: result });
    } catch (err) { next(err); }
  });

  router.post('/:id/sanction-types', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const types = req.body as Array<{ name: string; code: string; pointsEffect: number; monetaryValue: number; color: string; icon: string }>;
      await service.saveSanctionTypes(id, types);
      const result = await service.getSanctionTypes(id);
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  });

  // ── Venues CRUD ────────────────────────────────────────────────────────────

  router.get('/:id/venues', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const result = await service.getVenues(id);
      res.json({ data: result });
    } catch (err) { next(err); }
  });

  router.post('/:id/venues', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const body = req.body as { name: string; address?: string; locationUrl?: string; capacity?: number; surfaceType?: string };
      const venue = await service.createVenue(id, body);
      res.status(201).json({ data: venue });
    } catch (err) { next(err); }
  });

  router.put('/:id/venues/:venueId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const venueId = req.params['venueId'] as string;
      const body = req.body as { name?: string; address?: string; locationUrl?: string; capacity?: number; surfaceType?: string; isActive?: boolean };
      const venue = await service.updateVenue(venueId, body);
      res.json({ data: venue });
    } catch (err) { next(err); }
  });

  router.delete('/:id/venues/:venueId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const venueId = req.params['venueId'] as string;
      await service.deleteVenue(venueId);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  // ── Announcements CRUD ────────────────────────────────────────────────────

  router.get('/:id/announcements', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const result = await service.getAnnouncements(id);
      res.json({ data: result });
    } catch (err) { next(err); }
  });

  router.post('/:id/announcements', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const userId = req.headers['x-user-id'] as string ?? '';
      const body = req.body as { title: string; content: string; priority?: string; isPinned?: boolean };
      const ann = await service.createAnnouncement(id, userId, body);
      res.status(201).json({ data: ann });
    } catch (err) { next(err); }
  });

  router.delete('/:id/announcements/:annId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const annId = req.params['annId'] as string;
      await service.deleteAnnouncement(annId);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  // ── Payments CRUD ─────────────────────────────────────────────────────────

  router.get('/:id/payments', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const result = await service.getPayments(id);
      res.json({ data: result });
    } catch (err) { next(err); }
  });

  router.post('/:id/payments', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const userId = req.headers['x-user-id'] as string ?? '';
      const body = req.body as { teamId: string; amount: number; paymentMethod?: string; reference?: string; notes?: string };
      const payment = await service.createPayment(id, userId, body);
      res.status(201).json({ data: payment });
    } catch (err) { next(err); }
  });

  router.put('/:id/payments/:paymentId/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentId = req.params['paymentId'] as string;
      const { status } = req.body as { status: string };
      await service.updatePaymentStatus(paymentId, status);
      res.json({ data: { paymentId, status }, success: true, message: 'Estado actualizado' });
    } catch (err) { next(err); }
  });

  // ── Gallery CRUD ──────────────────────────────────────────────────────────

  router.get('/:id/gallery', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const result = await service.getGallery(id);
      res.json({ data: result });
    } catch (err) { next(err); }
  });

  router.post('/:id/gallery', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const userId = req.headers['x-user-id'] as string ?? '';
      const body = req.body as { url: string; thumbnailUrl?: string; caption?: string; matchId?: string; teamId?: string };
      const photo = await service.addPhoto(id, userId, body);
      res.status(201).json({ data: photo });
    } catch (err) { next(err); }
  });

  router.delete('/:id/gallery/:photoId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const photoId = req.params['photoId'] as string;
      await service.deletePhoto(photoId);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  // ── Enrollment Management ───────────────────────────────────────────────────

  router.get('/:id/enrollments', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const status = req.query['status'] as string | undefined;
      const result = await service.getEnrollments(id, status);
      res.json({ data: result });
    } catch (err) { next(err); }
  });

  router.put('/:id/enrollments/:enrollmentId/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const enrollmentId = req.params['enrollmentId'] as string;
      const { status } = req.body as { status: string };
      if (!status || !['active', 'withdrawn', 'disqualified', 'pending', 'rejected'].includes(status)) {
        return next(new ValidationError('status must be: active, pending, withdrawn, disqualified, or rejected'));
      }
      await service.updateEnrollmentStatus(id, enrollmentId, status);
      res.json({ data: { enrollmentId, status }, success: true, message: 'Estado actualizado' });
    } catch (err) { next(err); }
  });

  router.delete('/:id/enrollments/:enrollmentId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const enrollmentId = req.params['enrollmentId'] as string;
      await service.deleteEnrollment(id, enrollmentId);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  // ── Tournament Staff (referees, observers) ─────────────────────────────────

  router.get('/:id/staff', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const role = req.query['role'] as string | undefined;
      const result = await service.getStaff(id, role);
      res.json({ data: result });
    } catch (err) { next(err); }
  });

  router.post('/:id/staff', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const { userId, staffRole } = req.body as { userId: string; staffRole: string };
      if (!userId || !staffRole) {
        return next(new ValidationError('userId and staffRole are required'));
      }
      await service.registerStaff(id, userId, staffRole);
      const result = await service.getStaff(id);
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  });

  router.delete('/:id/staff/:userId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const userId = req.params['userId'] as string;
      await service.removeStaff(id, userId);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  // ── Public enrollment (no auth required — routed via /public) ─────────────

  router.post('/:id/enroll', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const body = req.body as {
        teamName: string;
        shortName?: string;
        contactName: string;
        contactPhone: string;
        contactEmail?: string;
        players: Array<{ name: string; jerseyNumber: number; position?: string }>;
      };

      if (!body.teamName || !body.contactName || !body.contactPhone) {
        return next(new ValidationError('Campos requeridos: teamName, contactName, contactPhone'));
      }

      const result = await service.enrollTeam(id, body);
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  });

  // ── Observations (Veedor / Observer) ──────────────────────────────────────

  // GET /tournaments/:id/observations — list observations for a tournament
  router.get('/:id/observations', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const userRoles = JSON.parse((req.headers['x-user-roles'] as string) || '[]') as string[];
      const userId = req.headers['x-user-id'] as string;

      // Admin and organizer see all; observer sees only their own
      let observations;
      if (userRoles.includes('admin') || userRoles.includes('organizer')) {
        observations = await service.getObservations(id);
      } else {
        observations = await service.getObservations(id, userId);
      }
      res.json({ data: observations });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid tournament id', parseZodError(err)));
      next(err);
    }
  });

  // POST /tournaments/:id/observations — submit an observation (observer only)
  router.post('/:id/observations', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = tournamentIdSchema.parse(req.params);
      const userId = req.headers['x-user-id'] as string;
      const userRoles = JSON.parse((req.headers['x-user-roles'] as string) || '[]') as string[];

      if (!userId) {
        return next(new ValidationError('User ID required'));
      }

      // Only observers, organizers, and admins can submit observations
      if (!userRoles.includes('observer') && !userRoles.includes('organizer') && !userRoles.includes('admin')) {
        return next(new ValidationError('Solo veedores pueden enviar observaciones'));
      }

      const { subject, body: obsBody, matchId } = req.body as {
        subject: string;
        body: string;
        matchId?: string;
      };

      if (!subject || !obsBody) {
        return next(new ValidationError('subject y body son requeridos'));
      }

      const observation = await service.createObservation(id, userId, subject, obsBody, matchId);
      res.status(201).json({ data: observation });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid tournament id', parseZodError(err)));
      next(err);
    }
  });

  return router;
}
