import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

/**
 * Login-specific brute-force protection.
 *
 * Tracks failed login attempts per email in memory with:
 *  - Max 5 attempts per 15 minutes per email
 *  - After 5 failures: account is locked for 15 minutes
 *  - After successful login: counter resets
 *
 * Returns 429 with retry-after header when threshold is exceeded.
 *
 * Note: In-memory store works for single-instance deployments (server-unified).
 * For multi-instance, replace with Redis or DB-backed store.
 */

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout

/** In-memory store of login attempts keyed by email. */
const attempts = new Map<string, AttemptRecord>();

/** Cleanup expired entries every 10 minutes to prevent memory leaks. */
setInterval(() => {
  const now = Date.now();
  for (const [email, record] of attempts) {
    const windowExpired = (now - record.firstAttemptAt) > WINDOW_MS;
    const lockExpired = record.lockedUntil !== null && now > record.lockedUntil;
    if (windowExpired && (lockExpired || record.lockedUntil === null)) {
      attempts.delete(email);
    }
  }
}, 10 * 60 * 1000).unref();

/**
 * Checks if the given email is currently locked out.
 * Returns remaining lockout seconds or 0 if not locked.
 */
export function isLockedOut(email: string): number {
  const record = attempts.get(email.toLowerCase());
  if (!record?.lockedUntil) return 0;
  const remaining = record.lockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Records a failed login attempt for the given email.
 * Returns true if the account is now locked.
 */
export function recordFailedAttempt(email: string): boolean {
  const key = email.toLowerCase();
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || (now - record.firstAttemptAt) > WINDOW_MS) {
    // Start new window
    attempts.set(key, { count: 1, firstAttemptAt: now, lockedUntil: null });
    return false;
  }

  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    logger.warn({ email: key, attempts: record.count }, 'Account locked due to too many failed login attempts');
    return true;
  }

  return false;
}

/**
 * Resets failed attempt counter after successful login.
 */
export function resetAttempts(email: string): void {
  attempts.delete(email.toLowerCase());
}

/**
 * Express middleware that blocks login requests for locked-out emails.
 * Must be placed BEFORE the login handler.
 */
export function loginRateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const email = req.body?.email as string | undefined;

  if (!email) {
    // No email in body — let the validation handler catch it
    return next();
  }

  const lockSeconds = isLockedOut(email);
  if (lockSeconds > 0) {
    logger.warn({ email: email.toLowerCase() }, 'Login blocked — account is locked');
    res.set('Retry-After', String(lockSeconds));
    res.status(429).json({
      data: null,
      success: false,
      message: `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(lockSeconds / 60)} minutos.`,
      code: 'ACCOUNT_LOCKED',
      retryAfterSeconds: lockSeconds,
    });
    return;
  }

  next();
}
