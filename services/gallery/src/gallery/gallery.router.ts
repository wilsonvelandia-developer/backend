import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError } from '@tournament/shared';
import { GalleryService } from './gallery.service.js';
import { createGalleryPhotoSchema, galleryPhotoIdSchema, galleryQuerySchema } from './gallery.schema.js';

export function buildGalleryRouter(service: GalleryService): Router {
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

  // GET /gallery
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = galleryQuerySchema.parse(req.query);
      const photos = await service.getAll(q.tournamentId, q.matchId, q.teamId);
      res.json({ data: photos });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid query', parseZodError(err)));
      next(err);
    }
  });

  // GET /gallery/:id
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = galleryPhotoIdSchema.parse(req.params);
      const photo = await service.getById(id);
      res.json({ data: photo });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid id', parseZodError(err)));
      next(err);
    }
  });

  // POST /gallery
  router.post('/', requireRole('admin', 'organizer'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = createGalleryPhotoSchema.parse(req.body);
      const uploadedBy = (req.headers['x-user-id'] as string) || null;
      const photo = await service.create(dto, uploadedBy);
      res.status(201).json({ data: photo });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid gallery photo data', parseZodError(err)));
      next(err);
    }
  });

  // DELETE /gallery/:id
  router.delete('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = galleryPhotoIdSchema.parse(req.params);
      await service.delete(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid id', parseZodError(err)));
      next(err);
    }
  });

  // ── Album Photos (sub-resources) ──────────────────────────────────────────

  // GET /gallery/:id/photos — list photos in an album
  router.get('/:id/photos', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = galleryPhotoIdSchema.parse(req.params);
      const photos = await service.getAlbumPhotos(id);
      res.json({ data: photos });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid id', parseZodError(err)));
      next(err);
    }
  });

  // POST /gallery/:id/photos — add a photo to an album
  router.post('/:id/photos', requireRole('admin', 'organizer'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = galleryPhotoIdSchema.parse(req.params);
      const { imageUrl } = req.body as { imageUrl: string };
      if (!imageUrl) return next(new ValidationError('imageUrl is required'));
      const uploadedBy = (req.headers['x-user-id'] as string) || null;
      const photo = await service.addPhotoToAlbum(id, imageUrl, uploadedBy);
      res.status(201).json({ data: photo });
    } catch (err) {
      next(err);
    }
  });

  // POST /gallery/:id/photos/remove — remove a photo from an album
  router.post('/:id/photos/remove', requireRole('admin', 'organizer'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = galleryPhotoIdSchema.parse(req.params);
      const { imageUrl } = req.body as { imageUrl: string };
      if (!imageUrl) return next(new ValidationError('imageUrl is required'));
      await service.removePhotoFromAlbum(id, imageUrl);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
