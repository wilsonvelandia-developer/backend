import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

/**
 * Rate limiting middleware.
 *
 * Applied globally at the gateway level before routing.
 * Limits each IP to config.rateLimit.max requests per windowMs.
 *
 * Returns 429 Too Many Requests with a Retry-After header when exceeded.
 * Does NOT expose internal rate limit implementation details in the response body.
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max:      config.rateLimit.max,
  standardHeaders: true,   // Return RateLimit-* headers per RFC 6585
  legacyHeaders:   false,  // Disable X-RateLimit-* headers
  handler: (_req, res) => {
    const retryAfterSeconds = Math.ceil(config.rateLimit.windowMs / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    res.status(429).json({
      data:    null,
      success: false,
      code:    'RATE_LIMIT_EXCEEDED',
      message: 'Demasiadas solicitudes. Intenta de nuevo más tarde.',
      retryAfterSeconds,
    });
  },
  // Use X-Forwarded-For when behind a reverse proxy (e.g. nginx, load balancer)
  // In production, set trustProxy in the Express app instead
  skip: (req) => req.path === '/health',
});
