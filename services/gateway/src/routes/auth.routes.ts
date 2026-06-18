import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { z, ZodError } from 'zod';
import { ValidationError, UnauthorizedError } from '@tournament/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Auth routes — real database authentication.
 *
 * POST /auth/login   → validates credentials, sets httpOnly cookie
 * POST /auth/logout  → clears httpOnly cookie
 * GET  /auth/me      → returns current user from cookie
 * POST /auth/register → creates a new user (requires auth + can_create_users)
 */

const router = Router();
const pool = new Pool({ connectionString: config.db.connectionString });

const COOKIE_NAME = 'auth_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   config.nodeEnv === 'production',
  sameSite: 'lax' as const,
  maxAge:   24 * 60 * 60 * 1000,
  path:     '/',
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
}

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
    id:        user.id,
    email:     user.email,
    name:      user.name,
    phone:     user.phone,
    avatarUrl: user.avatar_url,
    roles:     rolesResult.rows.map((r) => r.role_id),
  };
}

function signToken(user: UserResponse): string {
  return jwt.sign(
    { sub: user.id, email: user.email, roles: user.roles, name: user.name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] },
  );
}

function verifyTokenFromCookie(req: Request): jwt.JwtPayload {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) throw new UnauthorizedError('No active session');
  try {
    return jwt.verify(token, config.jwt.secret) as jwt.JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Session expired');
    throw new UnauthorizedError('Invalid session');
  }
}

// ── POST /auth/login ──────────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const result = await pool.query<UserRow>(
      `SELECT * FROM users WHERE email = $1`,
      [email],
    );

    if (result.rowCount === 0) {
      return next(new UnauthorizedError('Email o contraseña incorrectos'));
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return next(new UnauthorizedError('Cuenta desactivada. Contacta al administrador.'));
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return next(new UnauthorizedError('Email o contraseña incorrectos'));
    }

    const userResponse = await getUserWithRoles(user.id);
    if (!userResponse) return next(new UnauthorizedError('Error loading user data'));

    const token = signToken(userResponse);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

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

// ── POST /auth/logout ─────────────────────────────────────────────────────────

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ data: null, success: true, message: 'Sesión cerrada' });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────

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

// ── POST /auth/register ───────────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = registerSchema.parse(req.body);

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

export { router as authRouter };
