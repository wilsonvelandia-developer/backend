import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError, sanitizeHtml } from '@tournament/shared';
import { AnnouncementsService } from './announcements.service.js';
import { createAnnouncementSchema, updateAnnouncementSchema, announcementIdSchema, announcementQuerySchema } from './announcements.schema.js';

export function buildAnnouncementsRouter(service: AnnouncementsService): Router {
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

  // GET /announcements
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = announcementQuerySchema.parse(req.query);
      const announcements = await service.getAll(q.tournamentId, q.priority);
      res.json({ data: announcements });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid query', parseZodError(err)));
      next(err);
    }
  });

  // GET /announcements/:id
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = announcementIdSchema.parse(req.params);
      const announcement = await service.getById(id);
      res.json({ data: announcement });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid id', parseZodError(err)));
      next(err);
    }
  });

  // POST /announcements
  router.post('/', requireRole('admin', 'organizer'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = createAnnouncementSchema.parse(req.body);
      // Sanitize content to allow only safe inline formatting tags
      if (dto.content) dto.content = sanitizeHtml(dto.content);
      const authorId = req.headers['x-user-id'] as string;
      if (!authorId) return next(new ValidationError('Missing x-user-id header'));
      const announcement = await service.create(dto, authorId);
      res.status(201).json({ data: announcement });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid announcement data', parseZodError(err)));
      next(err);
    }
  });

  // PUT /announcements/:id
  router.put('/:id', requireRole('admin', 'organizer'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = announcementIdSchema.parse(req.params);
      const dto = updateAnnouncementSchema.parse(req.body);
      // Sanitize content on update as well
      if (dto.content) dto.content = sanitizeHtml(dto.content);
      const announcement = await service.update(id, dto);
      res.json({ data: announcement });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid announcement data', parseZodError(err)));
      next(err);
    }
  });

  // DELETE /announcements/:id
  router.delete('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = announcementIdSchema.parse(req.params);
      await service.delete(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid id', parseZodError(err)));
      next(err);
    }
  });

  return router;
}
