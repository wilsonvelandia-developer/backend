import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError } from '@tournament/shared';
import { PaymentsService } from './payments.service.js';
import { createPaymentSchema, updatePaymentSchema, paymentIdSchema, paymentQuerySchema } from './payments.schema.js';

export function buildPaymentsRouter(service: PaymentsService): Router {
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

  // GET /payments
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = paymentQuerySchema.parse(req.query);
      const payments = await service.getAll(q.tournamentId, q.teamId, q.status);
      res.json({ data: payments });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid query', parseZodError(err)));
      next(err);
    }
  });

  // GET /payments/:id
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = paymentIdSchema.parse(req.params);
      const payment = await service.getById(id);
      res.json({ data: payment });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid id', parseZodError(err)));
      next(err);
    }
  });

  // POST /payments
  router.post('/', requireRole('admin', 'organizer'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = createPaymentSchema.parse(req.body);
      const recordedBy = (req.headers['x-user-id'] as string) || null;
      const payment = await service.create(dto, recordedBy);
      res.status(201).json({ data: payment });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid payment data', parseZodError(err)));
      next(err);
    }
  });

  // PUT /payments/:id
  router.put('/:id', requireRole('admin', 'organizer'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = paymentIdSchema.parse(req.params);
      const dto = updatePaymentSchema.parse(req.body);
      const payment = await service.update(id, dto);
      res.json({ data: payment });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid payment data', parseZodError(err)));
      next(err);
    }
  });

  // DELETE /payments/:id
  router.delete('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = paymentIdSchema.parse(req.params);
      await service.delete(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Invalid id', parseZodError(err)));
      next(err);
    }
  });

  return router;
}
