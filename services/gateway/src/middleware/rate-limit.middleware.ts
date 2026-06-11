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
  message: {
    code:    'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later',
  },
  // Use X-Forwarded-For when behind a reverse proxy (e.g. nginx, load balancer)
  // In production, set trustProxy in the Express app instead
  skip: (req) => req.path === '/health',
});
