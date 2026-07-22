import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

/**
 * Write-operation logging middleware.
 *
 * Logs all non-GET/HEAD requests at info level with structured context.
 * Provides observability for all mutations (create, update, delete) across all services.
 *
 * Logged fields:
 *  - method, path, userId, correlationId, statusCode, durationMs
 *
 * Place after authMiddleware so x-user-id is available.
 */
export function writeLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();

  // Only log write operations
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const startTime = Date.now();
  const userId = req.headers['x-user-id'] as string | undefined;
  const correlationId = res.locals['correlationId'] as string | undefined;

  // Hook into response finish to log with status code
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]({
      event:         'write_operation',
      method,
      path:          req.originalUrl,
      userId:        userId ?? 'anonymous',
      correlationId: correlationId ?? 'unknown',
      statusCode:    res.statusCode,
      durationMs,
    }, `${method} ${req.originalUrl} → ${res.statusCode} (${durationMs}ms)`);
  });

  next();
}
