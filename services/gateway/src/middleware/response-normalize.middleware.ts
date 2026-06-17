import { Request, Response, NextFunction } from 'express';

/**
 * Response normalization middleware.
 *
 * The Angular frontend expects every API response to follow this envelope:
 *   { data: T, success: boolean, message: string }
 *
 * The microservices return:
 *   { data: T }                       — success responses
 *   { code, message, correlationId }  — error responses (already handled by error middleware)
 *
 * This middleware intercepts the JSON sent by the proxy and wraps it
 * so that every success response includes `success: true` and a `message`.
 *
 * It only transforms responses whose body is a plain JSON object with a `data`
 * key but no `success` key — to avoid double-wrapping.
 *
 * Applied ONLY on /api/* routes (after the proxy resolves).
 */
export const responseNormalizeMiddleware = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Intercept res.json to transform the payload before it's sent
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown): Response {
    if (
      body !== null &&
      typeof body === 'object' &&
      'data' in (body as object) &&
      !('success' in (body as object)) &&
      !('code' in (body as object))   // don't touch error responses
    ) {
      const normalized = {
        ...(body as object),
        success: true,
        message: '',
      };
      return originalJson(normalized);
    }
    return originalJson(body);
  };

  next();
};
