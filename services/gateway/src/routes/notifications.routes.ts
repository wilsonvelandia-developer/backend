import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { z, ZodError } from 'zod';
import { ValidationError, NotFoundError } from '@tournament/shared';
import { config } from '../config.js';

/**
 * Notifications API — in-app notifications for users.
 *
 * GET  /notifications          → list user's notifications (from JWT)
 * PUT  /notifications/:id/read → mark a notification as read
 * PUT  /notifications/read-all → mark all as read
 */

const router = Router();
const pool = new Pool({ connectionString: config.db.connectionString });

const notificationIdSchema = z.object({ id: z.string().uuid() });

// ── GET /notifications ──────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      res.status(401).json({ data: null, success: false, message: 'Auth required' });
      return;
    }

    const unreadOnly = req.query['unreadOnly'] === 'true';
    const limit = Math.min(parseInt(req.query['limit'] as string || '50', 10), 100);

    const conditions = ['user_id = $1'];
    const values: unknown[] = [userId];
    if (unreadOnly) {
      conditions.push('is_read = FALSE');
    }

    const result = await pool.query(
      `SELECT id, type, title, body, reference_type AS "referenceType",
              reference_id AS "referenceId", is_read AS "isRead",
              created_at AS "createdAt"
       FROM notifications
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1}`,
      [...values, limit],
    );

    // Also get unread count
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [userId],
    );

    res.json({
      data: result.rows,
      unreadCount: parseInt(countResult.rows[0]?.count ?? '0', 10),
      success: true,
      message: '',
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /notifications/:id/read ─────────────────────────────────────────────

router.put('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      res.status(401).json({ data: null, success: false, message: 'Auth required' });
      return;
    }

    const { id } = notificationIdSchema.parse(req.params);

    const result = await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId],
    );
    if (result.rowCount === 0) {
      return next(new NotFoundError('Notification', id));
    }

    res.json({ data: null, success: true, message: 'Marked as read' });
  } catch (err) {
    if (err instanceof ZodError) return next(new ValidationError('Invalid id'));
    next(err);
  }
});

// ── PUT /notifications/read-all ─────────────────────────────────────────────

router.put('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      res.status(401).json({ data: null, success: false, message: 'Auth required' });
      return;
    }

    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
      [userId],
    );

    res.json({ data: null, success: true, message: 'All marked as read' });
  } catch (err) {
    next(err);
  }
});

export { router as notificationsRouter };
