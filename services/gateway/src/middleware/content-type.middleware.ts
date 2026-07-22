import { Request, Response, NextFunction } from 'express';

/**
 * Content-Type validation middleware.
 *
 * Ensures POST/PUT/PATCH requests include a valid Content-Type header.
 * Rejects requests with unexpected content types to prevent:
 *  - Accidental form submissions interpreted as JSON
 *  - Content-type confusion attacks
 *
 * Allowed: application/json (with optional charset).
 * Skipped: GET, HEAD, OPTIONS, DELETE (no body expected).
 */
export function contentTypeMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();

  // Only validate methods that carry a request body
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
    return next();
  }

  // Empty body is allowed (some endpoints accept empty POST for actions like /start)
  const contentLength = req.headers['content-length'];
  if (contentLength === '0' || (!req.headers['content-type'] && !contentLength)) {
    return next();
  }

  const contentType = req.headers['content-type'] ?? '';

  // Allow application/json with optional charset or boundary params
  if (contentType.includes('application/json')) {
    return next();
  }

  // Allow multipart for file uploads (handled by multer/@fastify/multipart)
  if (contentType.includes('multipart/form-data')) {
    return next();
  }

  res.status(415).json({
    data:    null,
    success: false,
    code:    'UNSUPPORTED_MEDIA_TYPE',
    message: 'Content-Type debe ser application/json',
  });
}
