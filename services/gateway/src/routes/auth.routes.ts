import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { z, ZodError } from 'zod';
import crypto from 'crypto';
import { ValidationError, UnauthorizedError, ForbiddenError } from '@tournament/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  loginRateLimitMiddleware,
  recordFailedAttempt,
  resetAttempts,
} from '../middleware/login-rate-limit.middleware.js';
import { sendPasswordResetEmail } from '../services/email.service.js';

/**
 * Auth routes — real database authentication with refresh token rotation.
 *
 * POST /auth/login            → validates credentials, sets httpOnly cookies (access + refresh)
 * POST /auth/logout           → clears cookies, invalidates refresh token
 * POST /auth/refresh          → rotates refresh token, issues new access token
 * GET  /auth/me               → returns current user from cookie
 * POST /auth/change-password  → changes password (requires current password)
 * POST /auth/forgot-password  → generates reset token, sends email (placeholder)
 * POST /auth/reset-password   → resets password using valid token
 * POST /auth/register         → creates a new user (requires auth + can_create_users)
 */

// ── Cookie config ─────────────────────────────────────────────────────────────

const ACCESS_COOKIE_NAME = 'auth_token';
const REFRESH_COOKIE_NAME = 'refresh_token';

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   config.nodeEnv === 'production',
  sameSite: 'lax' as const,
  maxAge:   60 * 60 * 1000, // 1 hour (matches JWT expiry)
  path:     '/',
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   config.nodeEnv === 'production',
  sameSite: 'lax' as const,
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
  path:     '/auth', // Only sent to auth endpoints
};

// ── Schemas ───────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

const registerSchema = z.object({
  email:            z.string().email('Email inválido'),
  password:         z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  firstName:        z.string().min(1).max(100),
  secondName:       z.string().max(100).nullable().optional(),
  firstLastName:    z.string().min(1).max(100),
  secondLastName:   z.string().max(100).nullable().optional(),
  documentType:     z.string().max(10).nullable().optional(),
  documentNumber:   z.string().max(30).nullable().optional(),
  birthDate:        z.string().max(10).nullable().optional(),
  phone:            z.string().max(30).nullable().optional(),
  photoUrl:         z.string().max(500).nullable().optional(),
  documentFrontUrl: z.string().max(500).nullable().optional(),
  documentBackUrl:  z.string().max(500).nullable().optional(),
  epsFileUrl:       z.string().max(500).nullable().optional(),
  roles:            z.array(z.string().min(2).max(30)).min(1, 'Al menos un rol es requerido'),
  // Legacy — kept for backward compatibility
  name:             z.string().min(2).max(200).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido'),
});

const resetPasswordSchema = z.object({
  token:       z.string().min(1, 'Token requerido'),
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
});

function parseZodError(err: ZodError): Record<string, string> {
  return Object.fromEntries(err.errors.map((e) => [e.path.join('.'), e.message]));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  document_number: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

interface UserResponse {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  roles: string[];
  mustChangePassword: boolean;
}

/**
 * Builds auth router with injected database pool.
 * This eliminates the problem of creating a separate pool instance.
 */
export function buildAuthRouter(pool: Pool): Router {
  const router = Router();

  async function getUserWithRoles(userId: string): Promise<UserResponse | null> {
    const userResult = await pool.query<UserRow>(
      `SELECT * FROM users WHERE id = $1 AND is_active = TRUE`,
      [userId],
    );
    if (userResult.rowCount === 0) return null;

    const rolesResult = await pool.query<{ role_id: string }>(
      `SELECT role_id FROM user_roles WHERE user_id = $1`,
      [userId],
    );

    const user = userResult.rows[0];
    return {
      id:                 user.id,
      email:              user.email,
      name:              user.name,
      phone:             user.phone,
      avatarUrl:         user.avatar_url,
      roles:             rolesResult.rows.map((r) => r.role_id),
      mustChangePassword: (user as unknown as Record<string, unknown>)['must_change_password'] as boolean ?? false,
    };
  }

  function signAccessToken(user: UserResponse): string {
    return jwt.sign(
      { sub: user.id, email: user.email, roles: user.roles, name: user.name },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] },
    );
  }

  function verifyTokenFromCookie(req: Request): jwt.JwtPayload {
    const token = req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined;
    if (!token) throw new UnauthorizedError('No active session');
    try {
      return jwt.verify(token, config.jwt.secret) as jwt.JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Session expired');
      throw new UnauthorizedError('Invalid session');
    }
  }

  /**
   * Generates a cryptographically secure refresh token, stores its hash in the DB.
   * Returns the plaintext token (to be set in cookie).
   */
  async function createRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Invalidate all previous refresh tokens for this user (single active session)
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    );

    return token;
  }

  /**
   * Validates and rotates a refresh token.
   * Returns the user ID if valid, null otherwise.
   * Implements rotation: old token is revoked, new one is issued.
   */
  async function rotateRefreshToken(token: string): Promise<string | null> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await pool.query<{ id: string; user_id: string; expires_at: Date }>(
      `SELECT id, user_id, expires_at FROM refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash],
    );

    if (result.rowCount === 0) return null;

    const row = result.rows[0];

    // Check expiry
    if (new Date(row.expires_at) < new Date()) {
      await pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);
      return null;
    }

    // Revoke the used token (rotation)
    await pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);

    return row.user_id;
  }

  // ── POST /auth/login ────────────────────────────────────────────────────────

  router.post('/login', loginRateLimitMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const result = await pool.query<UserRow>(
        `SELECT * FROM users WHERE email = $1`,
        [email],
      );

      if (result.rowCount === 0) {
        recordFailedAttempt(email);
        return next(new UnauthorizedError('Email o contraseña incorrectos'));
      }

      const user = result.rows[0];

      if (!user.is_active) {
        return next(new UnauthorizedError('Cuenta desactivada. Contacta al administrador.'));
      }

      const passwordValid = await bcrypt.compare(password, user.password_hash);
      if (!passwordValid) {
        recordFailedAttempt(email);
        return next(new UnauthorizedError('Email o contraseña incorrectos'));
      }

      // Successful login — reset brute-force counter
      resetAttempts(email);

      const userResponse = await getUserWithRoles(user.id);
      if (!userResponse) return next(new UnauthorizedError('Error loading user data'));

      // Issue access token
      const accessToken = signAccessToken(userResponse);
      res.cookie(ACCESS_COOKIE_NAME, accessToken, ACCESS_COOKIE_OPTIONS);

      // Issue refresh token
      const refreshToken = await createRefreshToken(user.id);
      res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

      logger.info({ userId: user.id, roles: userResponse.roles }, 'User logged in');

      res.json({
        data: userResponse,
        success: true,
        message: 'Sesión iniciada correctamente',
      });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Datos inválidos', parseZodError(err)));
      next(err);
    }
  });

  // ── POST /auth/logout ───────────────────────────────────────────────────────

  router.post('/logout', async (req: Request, res: Response) => {
    // Revoke refresh token if present
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash],
      ).catch(() => { /* non-critical */ });
    }

    res.clearCookie(ACCESS_COOKIE_NAME, { path: '/' });
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
    res.json({ data: null, success: true, message: 'Sesión cerrada' });
  });

  // ── POST /auth/refresh ──────────────────────────────────────────────────────

  router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
      if (!refreshToken) {
        return next(new UnauthorizedError('No refresh token'));
      }

      const userId = await rotateRefreshToken(refreshToken);
      if (!userId) {
        res.clearCookie(ACCESS_COOKIE_NAME, { path: '/' });
        res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
        return next(new UnauthorizedError('Sesión expirada. Inicia sesión de nuevo.'));
      }

      const userResponse = await getUserWithRoles(userId);
      if (!userResponse) {
        return next(new UnauthorizedError('User not found'));
      }

      // Issue new access token
      const accessToken = signAccessToken(userResponse);
      res.cookie(ACCESS_COOKIE_NAME, accessToken, ACCESS_COOKIE_OPTIONS);

      // Issue new refresh token (rotation)
      const newRefreshToken = await createRefreshToken(userId);
      res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, REFRESH_COOKIE_OPTIONS);

      res.json({ data: userResponse, success: true, message: 'Sesión renovada' });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /auth/change-password ──────────────────────────────────────────────

  router.post('/change-password', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = verifyTokenFromCookie(req);
      const userId = payload['sub'] as string;
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

      const userResult = await pool.query<UserRow>(
        `SELECT password_hash FROM users WHERE id = $1`,
        [userId],
      );
      if (userResult.rowCount === 0) return next(new UnauthorizedError('User not found'));

      const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
      if (!valid) return next(new UnauthorizedError('La contraseña actual es incorrecta'));

      const newHash = await bcrypt.hash(newPassword, 10);
      await pool.query(
        `UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2`,
        [newHash, userId],
      );

      // Invalidate all refresh tokens (force re-login on other devices)
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );

      logger.info({ userId }, 'Password changed');
      res.json({ data: null, success: true, message: 'Contraseña actualizada' });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Datos inválidos', parseZodError(err)));
      next(err);
    }
  });

  // ── POST /auth/forgot-password ──────────────────────────────────────────────

  router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);

      // Always return success to prevent email enumeration
      const successResponse = {
        data: null,
        success: true,
        message: 'Si el email está registrado, recibirás instrucciones para restablecer tu contraseña.',
      };

      const userResult = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1 AND is_active = TRUE`,
        [email],
      );

      if (userResult.rowCount === 0) {
        // Don't reveal that the email doesn't exist
        res.json(successResponse);
        return;
      }

      const userId = userResult.rows[0].id;

      // Generate reset token (valid 1 hour)
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Invalidate previous reset tokens for this user
      await pool.query(
        `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
        [userId],
      );

      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt],
      );

      // Send password reset email
      sendPasswordResetEmail(email, token).catch(() => {
        logger.warn({ userId }, 'Failed to send password reset email');
      });

      logger.info({ userId }, 'Password reset requested');
      res.json(successResponse);
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Datos inválidos', parseZodError(err)));
      next(err);
    }
  });

  // ── POST /auth/reset-password ───────────────────────────────────────────────

  router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = resetPasswordSchema.parse(req.body);
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const result = await pool.query<{ id: string; user_id: string; expires_at: Date }>(
        `SELECT id, user_id, expires_at FROM password_reset_tokens
         WHERE token_hash = $1 AND used_at IS NULL`,
        [tokenHash],
      );

      if (result.rowCount === 0) {
        return next(new UnauthorizedError('Token inválido o expirado'));
      }

      const row = result.rows[0];

      if (new Date(row.expires_at) < new Date()) {
        await pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
        return next(new UnauthorizedError('Token expirado. Solicita uno nuevo.'));
      }

      // Mark token as used
      await pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);

      // Update password
      const newHash = await bcrypt.hash(newPassword, 10);
      await pool.query(
        `UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2`,
        [newHash, row.user_id],
      );

      // Invalidate all refresh tokens (force re-login)
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [row.user_id],
      );

      logger.info({ userId: row.user_id }, 'Password reset completed');
      res.json({ data: null, success: true, message: 'Contraseña restablecida correctamente' });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Datos inválidos', parseZodError(err)));
      next(err);
    }
  });

  // ── GET /auth/me ────────────────────────────────────────────────────────────

  router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = verifyTokenFromCookie(req);
      const user = await getUserWithRoles(payload['sub'] as string);
      if (!user) return next(new UnauthorizedError('User not found'));

      res.json({ data: user, success: true, message: 'Sesión activa' });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /auth/register ─────────────────────────────────────────────────────

  router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = registerSchema.parse(req.body);

      // ── Permission check: who can create users? ───────────────────────────
      let creatorRoles: string[] = [];
      try {
        const creatorPayload = verifyTokenFromCookie(req);
        const creatorId = creatorPayload['sub'] as string;
        const creatorRolesResult = await pool.query<{ role_id: string; can_create_users: boolean }>(
          `SELECT ur.role_id, r.can_create_users
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = $1`,
          [creatorId],
        );
        creatorRoles = creatorRolesResult.rows.map((r) => r.role_id);
        const canCreate = creatorRolesResult.rows.some((r) => r.can_create_users);

        if (!canCreate) {
          return next(new ForbiddenError('Tu perfil no tiene permisos para crear usuarios'));
        }

        // Validate role assignment rules
        const requestedRoles = dto.roles;
        const adminOnlyRoles = ['admin', 'organizer'];
        const organizerCanAssign = ['coach', 'assistant', 'delegate', 'fitness_coach', 'coordinator', 'president', 'player', 'parent', 'companion', 'referee', 'observer'];
        const coachCanAssign = ['player', 'parent', 'companion'];

        if (!creatorRoles.includes('admin')) {
          if (requestedRoles.some((r) => adminOnlyRoles.includes(r))) {
            return next(new ForbiddenError('Solo administradores pueden asignar el rol de administrador u organizador'));
          }

          if (creatorRoles.includes('organizer')) {
            if (!requestedRoles.every((r) => organizerCanAssign.includes(r))) {
              return next(new ForbiddenError('No tienes permisos para asignar ese rol'));
            }
          } else {
            if (!requestedRoles.every((r) => coachCanAssign.includes(r))) {
              return next(new ForbiddenError('Solo puedes registrar jugadores, padres o acompañantes'));
            }
          }
        }
      } catch {
        // No valid session — only allow self-registration as companion (spectator)
        if (dto.roles.length !== 1 || dto.roles[0] !== 'companion') {
          return next(new UnauthorizedError('Autenticación requerida para crear usuarios con este rol'));
        }
      }

      // Check if email already exists
      const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [dto.email]);
      if ((existing.rowCount ?? 0) > 0) {
        return next(new ValidationError('El email ya está registrado'));
      }

      // Hash password
      const passwordHash = await bcrypt.hash(dto.password, 10);

      // Compute display name from parts (or use legacy 'name' field)
      const displayName = dto.name
        ?? [dto.firstName, dto.secondName, dto.firstLastName, dto.secondLastName].filter(Boolean).join(' ');

      // Create user
      const userResult = await pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, name, first_name, second_name, first_last_name, second_last_name,
                            document_type, document_number, birth_date, phone, photo_url,
                            document_front_url, document_back_url, eps_file_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
        [
          dto.email, passwordHash, displayName,
          dto.firstName ?? null, dto.secondName ?? null,
          dto.firstLastName ?? null, dto.secondLastName ?? null,
          dto.documentType ?? null, dto.documentNumber ?? null,
          dto.birthDate ?? null, dto.phone ?? null, dto.photoUrl ?? null,
          dto.documentFrontUrl ?? null, dto.documentBackUrl ?? null, dto.epsFileUrl ?? null,
        ],
      );
      const userId = userResult.rows[0].id;

      // Assign roles
      for (const roleId of dto.roles) {
        await pool.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, roleId],
        );
      }

      const user = await getUserWithRoles(userId);

      logger.info({ userId, roles: dto.roles }, 'User registered');

      res.status(201).json({ data: user, success: true, message: 'Usuario registrado correctamente' });
    } catch (err) {
      if (err instanceof ZodError) return next(new ValidationError('Datos inválidos', parseZodError(err)));
      next(err);
    }
  });

  return router;
}

// ── Legacy export (backward compatibility with existing imports) ──────────────
// Creates its own pool — will be replaced when server-unified.ts uses buildAuthRouter
const _legacyPool = new Pool({ connectionString: config.db.connectionString });
export const authRouter = buildAuthRouter(_legacyPool);
