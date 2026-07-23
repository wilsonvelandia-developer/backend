import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { z, ZodError } from 'zod';
import { ForbiddenError, NotFoundError, ValidationError } from '@tournament/shared';
import { config } from '../config.js';

/**
 * Users API routes — full CRUD for user profiles.
 *
 * GET    /users           → list all users (admin/organizer only)
 * GET    /users/:id       → get single user profile
 * PUT    /users/:id       → update user profile
 * DELETE /users/:id       → deactivate user (soft delete)
 */

const router = Router();
const pool = new Pool({ connectionString: config.db.connectionString });

// ── Schemas ───────────────────────────────────────────────────────────────────

const userIdSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

const updateUserSchema = z.object({
  firstName:        z.string().trim().min(1).max(100).optional(),
  secondName:       z.string().trim().max(100).nullable().optional(),
  firstLastName:    z.string().trim().min(1).max(100).optional(),
  secondLastName:   z.string().trim().max(100).nullable().optional(),
  email:            z.string().email().optional(),
  documentType:     z.string().trim().max(10).nullable().optional(),
  documentNumber:   z.string().trim().max(30).nullable().optional(),
  birthDate:        z.string().max(10).nullable().optional(),
  phone:            z.string().trim().max(30).nullable().optional(),
  photoUrl:         z.string().max(500).nullable().optional(),
  documentFrontUrl: z.string().max(500).nullable().optional(),
  documentBackUrl:  z.string().max(500).nullable().optional(),
  epsFileUrl:       z.string().max(500).nullable().optional(),
  roles:            z.array(z.string().min(2).max(30)).optional(),
});

function parseZodError(err: ZodError): Record<string, string> {
  return Object.fromEntries(err.errors.map((e) => [e.path.join('.'), e.message]));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  email: string;
  name: string;
  first_name: string | null;
  second_name: string | null;
  first_last_name: string | null;
  second_last_name: string | null;
  document_type: string | null;
  document_number: string | null;
  birth_date: string | null;
  phone: string | null;
  photo_url: string | null;
  avatar_url: string | null;
  document_front_url: string | null;
  document_back_url: string | null;
  eps_file_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface UserResponse {
  id: string;
  email: string;
  name: string;
  firstName: string | null;
  secondName: string | null;
  firstLastName: string | null;
  secondLastName: string | null;
  documentType: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  phone: string | null;
  photoUrl: string | null;
  avatarUrl: string | null;
  documentFrontUrl: string | null;
  documentBackUrl: string | null;
  epsFileUrl: string | null;
  isActive: boolean;
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Maps a DB row to the API response format.
 */
function mapUserRow(row: UserRow, roles: string[]): UserResponse {
  return {
    id:               row.id,
    email:            row.email,
    name:             row.name,
    firstName:        row.first_name,
    secondName:       row.second_name,
    firstLastName:    row.first_last_name,
    secondLastName:   row.second_last_name,
    documentType:     row.document_type,
    documentNumber:   row.document_number,
    birthDate:        row.birth_date ? String(row.birth_date).slice(0, 10) : null,
    phone:            row.phone,
    photoUrl:         row.photo_url,
    avatarUrl:        row.avatar_url,
    documentFrontUrl: row.document_front_url,
    documentBackUrl:  row.document_back_url,
    epsFileUrl:       row.eps_file_url,
    isActive:         row.is_active,
    roles,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}

/**
 * Checks if the requesting user has admin or organizer role.
 */
function requireAdminOrOrganizer(req: Request, next: NextFunction): boolean {
  const roles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];
  if (!roles.includes('admin') && !roles.includes('organizer')) {
    next(new ForbiddenError('No tienes permisos para esta acción'));
    return false;
  }
  return true;
}

// ── GET /users — list all users ───────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdminOrOrganizer(req, next)) return;

    const roleFilter = req.query['role'] as string | undefined;

    let usersResult;
    if (roleFilter) {
      // Filter users by role
      usersResult = await pool.query<UserRow>(
        `SELECT DISTINCT u.id, u.email, u.name, u.first_name, u.second_name, u.first_last_name, u.second_last_name,
                u.document_type, u.document_number, u.birth_date, u.phone, u.photo_url, u.avatar_url,
                u.document_front_url, u.document_back_url, u.eps_file_url,
                u.is_active, u.created_at, u.updated_at
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         WHERE u.is_active = TRUE AND ur.role_id = $1
         ORDER BY u.name`,
        [roleFilter],
      );
    } else {
      usersResult = await pool.query<UserRow>(
        `SELECT id, email, name, first_name, second_name, first_last_name, second_last_name,
                document_type, document_number, birth_date, phone, photo_url, avatar_url,
                document_front_url, document_back_url, eps_file_url,
                is_active, created_at, updated_at
         FROM users WHERE is_active = TRUE ORDER BY name`,
      );
    }

    const users = await Promise.all(
      usersResult.rows.map(async (u) => {
        const rolesResult = await pool.query<{ role_id: string }>(
          `SELECT role_id FROM user_roles WHERE user_id = $1`,
          [u.id],
        );
        // Add computed fields for the frontend
        const roles = rolesResult.rows.map((r) => r.role_id);
        const matchCountResult = await pool.query<{ count: string }>(
          `SELECT COUNT(*)::int as count FROM match_referees WHERE user_id = $1`,
          [u.id],
        );
        return {
          ...mapUserRow(u, roles),
          matchCount: parseInt(matchCountResult.rows[0]?.count ?? '0', 10),
          isAvailable: true,
        };
      }),
    );

    res.json({ data: users, success: true, message: '' });
  } catch (err) {
    next(err);
  }
});

// ── GET /users/by-document/:documentNumber — search user by document ─────────

router.get('/by-document/:documentNumber', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const documentNumber = req.params['documentNumber'] as string;
    if (!documentNumber || documentNumber.trim().length < 3) {
      res.json({ data: null, success: true, message: 'No encontrado' });
      return;
    }

    const result = await pool.query<UserRow>(
      `SELECT id, email, name, first_name, second_name, first_last_name, second_last_name,
              document_type, document_number, birth_date, phone, photo_url, avatar_url,
              is_active, created_at, updated_at
       FROM users WHERE document_number = $1 AND is_active = TRUE LIMIT 1`,
      [documentNumber.trim()],
    );

    if (result.rowCount === 0) {
      res.json({ data: null, success: true, message: 'No encontrado' });
      return;
    }

    const rolesResult = await pool.query<{ role_id: string }>(
      `SELECT role_id FROM user_roles WHERE user_id = $1`,
      [result.rows[0].id],
    );

    const user = mapUserRow(result.rows[0], rolesResult.rows.map((r) => r.role_id));
    res.json({ data: user, success: true, message: 'Usuario encontrado' });
  } catch (err) {
    next(err);
  }
});

// ── GET /users/:id — get single user ─────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = userIdSchema.parse(req.params);

    // Allow admin/organizer OR the user themselves
    const requestingUserId = req.headers['x-user-id'] as string | undefined;
    const roles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];
    const isAdminOrOrg = roles.includes('admin') || roles.includes('organizer');
    if (!isAdminOrOrg && requestingUserId !== id) {
      return next(new ForbiddenError('No tienes permisos para ver este perfil'));
    }

    const result = await pool.query<UserRow>(
      `SELECT id, email, name, first_name, second_name, first_last_name, second_last_name,
              document_type, document_number, birth_date, phone, photo_url, avatar_url,
              document_front_url, document_back_url, eps_file_url,
              is_active, created_at, updated_at
       FROM users WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) return next(new NotFoundError('User', id));

    const rolesResult = await pool.query<{ role_id: string }>(
      `SELECT role_id FROM user_roles WHERE user_id = $1`,
      [id],
    );

    const user = mapUserRow(result.rows[0], rolesResult.rows.map((r) => r.role_id));
    res.json({ data: user, success: true, message: '' });
  } catch (err) {
    if (err instanceof ZodError) return next(new ValidationError('ID inválido', parseZodError(err)));
    next(err);
  }
});

// ── PUT /users/:id — update user profile ─────────────────────────────────────

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = userIdSchema.parse(req.params);
    const dto = updateUserSchema.parse(req.body);

    // Allow admin/organizer OR the user themselves (except role changes)
    const requestingUserId = req.headers['x-user-id'] as string | undefined;
    const requesterRoles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];
    const isAdminOrOrg = requesterRoles.includes('admin') || requesterRoles.includes('organizer');

    if (!isAdminOrOrg && requestingUserId !== id) {
      return next(new ForbiddenError('No tienes permisos para editar este perfil'));
    }
    // Only admin/organizer can change roles
    if (dto.roles && !isAdminOrOrg) {
      return next(new ForbiddenError('Solo administradores pueden cambiar roles'));
    }

    // Build dynamic UPDATE
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      firstName:        'first_name',
      secondName:       'second_name',
      firstLastName:    'first_last_name',
      secondLastName:   'second_last_name',
      email:            'email',
      documentType:     'document_type',
      documentNumber:   'document_number',
      birthDate:        'birth_date',
      phone:            'phone',
      photoUrl:         'photo_url',
      documentFrontUrl: 'document_front_url',
      documentBackUrl:  'document_back_url',
      epsFileUrl:       'eps_file_url',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if (key in dto && (dto as Record<string, unknown>)[key] !== undefined) {
        fields.push(`${column} = $${idx++}`);
        values.push((dto as Record<string, unknown>)[key]);
      }
    }

    // Recompute display name if name parts changed
    const hasNameChange = dto.firstName !== undefined || dto.firstLastName !== undefined;
    if (hasNameChange) {
      // We need current values for the parts not being updated
      const currentUser = await pool.query<UserRow>(
        `SELECT first_name, second_name, first_last_name, second_last_name FROM users WHERE id = $1`,
        [id],
      );
      if (currentUser.rowCount === 0) return next(new NotFoundError('User', id));
      const cur = currentUser.rows[0];

      const fn  = dto.firstName      ?? cur.first_name ?? '';
      const sn  = dto.secondName     ?? cur.second_name ?? '';
      const fln = dto.firstLastName  ?? cur.first_last_name ?? '';
      const sln = dto.secondLastName ?? cur.second_last_name ?? '';
      const fullName = [fn, sn, fln, sln].filter(Boolean).join(' ');

      fields.push(`name = $${idx++}`);
      values.push(fullName);
    }

    if (fields.length === 0 && !dto.roles) {
      return next(new ValidationError('No se proporcionaron campos para actualizar'));
    }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await pool.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id`,
        values,
      );
      if (result.rowCount === 0) return next(new NotFoundError('User', id));
    }

    // Update roles if provided
    if (dto.roles) {
      await pool.query(`DELETE FROM user_roles WHERE user_id = $1`, [id]);
      for (const roleId of dto.roles) {
        await pool.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, roleId],
        );
      }
    }

    // Return updated user
    const updatedResult = await pool.query<UserRow>(
      `SELECT id, email, name, first_name, second_name, first_last_name, second_last_name,
              document_type, document_number, birth_date, phone, photo_url, avatar_url,
              document_front_url, document_back_url, eps_file_url,
              is_active, created_at, updated_at
       FROM users WHERE id = $1`,
      [id],
    );
    const rolesResult = await pool.query<{ role_id: string }>(
      `SELECT role_id FROM user_roles WHERE user_id = $1`,
      [id],
    );

    const user = mapUserRow(updatedResult.rows[0], rolesResult.rows.map((r) => r.role_id));
    res.json({ data: user, success: true, message: 'Usuario actualizado' });
  } catch (err) {
    if (err instanceof ZodError) return next(new ValidationError('Datos inválidos', parseZodError(err)));
    next(err);
  }
});

// ── DELETE /users/:id — soft delete (deactivate) ─────────────────────────────

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdminOrOrganizer(req, next)) return;

    const { id } = userIdSchema.parse(req.params);

    // Prevent self-deletion
    const requestingUserId = req.headers['x-user-id'] as string | undefined;
    if (requestingUserId === id) {
      return next(new ValidationError('No puedes desactivar tu propia cuenta'));
    }

    const result = await pool.query(
      `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND is_active = TRUE RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) return next(new NotFoundError('User', id));

    res.json({ data: null, success: true, message: 'Usuario desactivado' });
  } catch (err) {
    if (err instanceof ZodError) return next(new ValidationError('ID inválido', parseZodError(err)));
    next(err);
  }
});

// ── PUT /users/:id/status — activate or deactivate a user (admin only) ───────

router.put('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];
    if (!roles.includes('admin')) {
      return next(new ForbiddenError('Solo administradores pueden cambiar el estado de usuarios'));
    }

    const { id } = userIdSchema.parse(req.params);
    const { isActive } = req.body as { isActive: boolean };

    if (typeof isActive !== 'boolean') {
      return next(new ValidationError('isActive debe ser true o false'));
    }

    const result = await pool.query(
      `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, is_active`,
      [isActive, id],
    );
    if (result.rowCount === 0) return next(new NotFoundError('User', id));

    const status = isActive ? 'activado' : 'desactivado';
    res.json({ data: { id, isActive }, success: true, message: `Usuario ${status}` });
  } catch (err) {
    next(err);
  }
});

// ── POST /users/invite-organizer — invite an organizer with a plan (admin only)

const inviteOrganizerSchema = z.object({
  email:   z.string().email('Email inválido'),
  name:    z.string().min(2).max(200),
  phone:   z.string().max(30).optional(),
  planSlug: z.enum(['basic', 'professional', 'premium']),
  expiresInDays: z.number().int().min(30).max(365).default(30),
});

router.post('/invite-organizer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];
    if (!roles.includes('admin')) {
      return next(new ForbiddenError('Solo administradores pueden invitar organizadores'));
    }

    const dto = inviteOrganizerSchema.parse(req.body);
    const adminId = req.headers['x-user-id'] as string;

    // Check email doesn't already exist
    const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [dto.email]);
    if ((existing.rowCount ?? 0) > 0) {
      return next(new ValidationError('Ya existe un usuario con ese email'));
    }

    // Load plan
    const planResult = await pool.query<{ id: string }>(
      `SELECT id FROM subscription_plans WHERE slug = $1 AND is_active = TRUE`,
      [dto.planSlug],
    );
    if (planResult.rowCount === 0) {
      return next(new ValidationError(`Plan "${dto.planSlug}" no encontrado`));
    }
    const planId = planResult.rows[0].id;

    // Create user account with temp password (must change on first login)
    const bcrypt = await import('bcrypt');
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!'; // random 8+ chars
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const subscriptionExpires = new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000);

    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, phone, plan_id, subscription_expires_at, must_change_password, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE) RETURNING id`,
      [dto.email, passwordHash, dto.name, dto.phone ?? null, planId, subscriptionExpires],
    );
    const userId = userResult.rows[0].id;

    // Assign organizer role
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, 'organizer') ON CONFLICT DO NOTHING`,
      [userId],
    );

    // Record invitation
    await pool.query(
      `INSERT INTO organizer_invitations (invited_by, email, plan_id, user_id, status)
       VALUES ($1, $2, $3, $4, 'accepted')`,
      [adminId, dto.email, planId, userId],
    );

    // TODO: Send welcome email with temp password
    // For now, return it in the response (only visible to admin)

    res.status(201).json({
      data: {
        userId,
        email: dto.email,
        name: dto.name,
        plan: dto.planSlug,
        tempPassword,
        subscriptionExpiresAt: subscriptionExpires.toISOString(),
      },
      success: true,
      message: `Organizador invitado. Contraseña temporal: ${tempPassword} (debe cambiarla al primer ingreso).`,
    });
  } catch (err) {
    if (err instanceof ZodError) return next(new ValidationError('Datos inválidos', parseZodError(err)));
    next(err);
  }
});

// ── GET /users/plans — list available subscription plans (public) ─────────────

router.get('/plans/available', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT id, slug, name, price_cop AS "priceCop",
              max_teams_per_tournament AS "maxTeamsPerTournament",
              max_active_tournaments AS "maxActiveTournaments",
              max_venues AS "maxVenues",
              features, display_order AS "displayOrder"
       FROM subscription_plans
       WHERE is_active = TRUE
       ORDER BY display_order`,
    );
    res.json({ data: result.rows, success: true, message: '' });
  } catch (err) {
    next(err);
  }
});

export { router as usersRouter };
