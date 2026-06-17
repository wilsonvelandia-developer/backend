import { Request, Response, NextFunction } from 'express';
import { AppError } from '@tournament/shared';
import { logger } from '../logger.js';

/**
 * Global error handler middleware.
 * Returns responses in the envelope the Angular frontend expects:
 *   { data: null, success: false, message: string, code: string, correlationId: string }
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
    logger.warn({
      correlationId,
      code:       err.code,
      statusCode: err.statusCode,
      path:       req.path,
      method:     req.method,
    }, err.message);

    res.status(err.statusCode).json({
      data:          null,
      success:       false,
      message:       err.message,
      code:          err.code,
      correlationId,
      ...(err.details && { details: err.details }),
    });
    return;
  }

  // Unknown error — never expose stack trace to client
  logger.error({
    correlationId,
    path:   req.path,
    method: req.method,
    stack:  err.stack,
  }, 'Unhandled error');

  res.status(500).json({
    data:          null,
    success:       false,
    message:       'Ha ocurrido un error inesperado',
    code:          'INTERNAL_ERROR',
    correlationId,
  });
};
