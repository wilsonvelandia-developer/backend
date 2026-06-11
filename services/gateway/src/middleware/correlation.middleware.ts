import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Correlation ID middleware.
 *
 * Reads X-Correlation-ID from the incoming request (if provided by the caller)
 * or generates a new UUID v4. Attaches it to:
 *   - res.locals.correlationId  → accessible by all downstream middleware
 *   - response header           → returned to the client for traceability
 *
 * All downstream service calls must forward this header.
 */
export const correlationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const incoming = req.headers['x-correlation-id'];
  const correlationId =
    typeof incoming === 'string' && incoming.length > 0
      ? incoming
      : uuidv4();

  res.locals['correlationId'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  next();
};
