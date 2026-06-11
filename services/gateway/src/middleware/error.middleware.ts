import { Request, Response, NextFunction } from 'express';
import { AppError, ApiError } from '@tournament/shared';
import { logger } from '../logger.js';

/**
 * Global error handler middleware.
 *
 * Must be registered LAST in the Express middleware chain (after all routes).
 *
 * Security rules:
 *   - Never expose stack traces to the client.
 *   - Never expose internal error messages for unexpected errors.
 *   - Always include correlationId so the caller can correlate with server logs.
 *   - Log full error details internally (with stack trace) for debugging.
 */
export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';

  if (err instanceof AppError) {
    // Known application error — log at warn level (expected failures)
    logger.warn({
      correlationId,
      code:       err.code,
      statusCode: err.statusCode,
      path:       req.path,
      method:     req.method,
    }, err.message);

    const body: ApiError = {
      code:          err.code,
      message:       err.message,
      correlationId,
      ...(err.details && { details: err.details }),
    };

    res.status(err.statusCode).json(body);
    return;
  }

  // Unknown / unexpected error — log full stack trace internally, return generic message
  logger.error({
    correlationId,
    path:   req.path,
    method: req.method,
    stack:  err.stack,
  }, 'Unhandled error');

  const body: ApiError = {
    code:          'INTERNAL_ERROR',
    message:       'An unexpected error occurred',
    correlationId,
  };

  res.status(500).json(body);
};
