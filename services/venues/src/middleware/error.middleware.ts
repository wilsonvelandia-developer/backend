import { Request, Response, NextFunction } from 'express';
import { AppError, ApiError } from '@tournament/shared';
import { logger } from '../logger.js';

export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? 'unknown';

  if (err instanceof AppError) {
    logger.warn({ correlationId, code: err.code, statusCode: err.statusCode, path: req.path }, err.message);
    const body: ApiError = {
      code:          err.code,
      message:       err.message,
      correlationId,
      ...(err.details && { details: err.details }),
    };
    res.status(err.statusCode).json(body);
    return;
  }

  logger.error({ correlationId, path: req.path, method: req.method, stack: err.stack }, 'Unhandled error');
  const body: ApiError = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', correlationId };
  res.status(500).json(body);
};
