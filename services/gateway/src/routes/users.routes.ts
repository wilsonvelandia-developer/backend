import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { ForbiddenError } from '@tournament/shared';
import { config } from '../config.js';

/**
 * Users API routes.
 * GET /users — list all users with their roles (admin/organizer only)
 */

const router = Router();
const pool = new Pool({ connectionString: config.db.connectionString });

interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only admin and organizer can list users
    const roles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];
    if (!roles.includes('admin') && !roles.includes('organizer')) {
      return next(new ForbiddenError('No tienes permisos para ver usuarios'));
    }

    const usersResult = await pool.query<UserRow>(
      `SELECT id, email, name, phone, avatar_url, is_active FROM users WHERE is_active = TRUE ORDER BY name`,
    );

    // Load roles for each user
    const users = await Promise.all(
      usersResult.rows.map(async (u) => {
        const rolesResult = await pool.query<{ role_id: string }>(
          `SELECT role_id FROM user_roles WHERE user_id = $1`,
          [u.id],
        );
        return {
          id:        u.id,
          email:     u.email,
          name:      u.name,
          phone:     u.phone,
          avatarUrl: u.avatar_url,
          roles:     rolesResult.rows.map((r) => r.role_id),
        };
      }),
    );

    res.json({ data: users, success: true, message: '' });
  } catch (err) {
    next(err);
  }
});

export { router as usersRouter };
