import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';

import { isAppError } from './AppError';
import { NotFoundError } from './NotFoundError';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Express 4 does not forward rejected promises to the error middleware, so
 * every async route handler is wrapped with this.
 */
export const asyncHandler =
  (handler: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };

/** Terminal 404 for unmatched routes — funnels into `errorHandler`. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError('Route', `${req.method} ${req.path}`));
};

/**
 * Central mapping of thrown errors to HTTP responses (architecture rule #4).
 * `AppError` subclasses carry their own status code and error code; anything
 * else is an unexpected failure and is reported as a generic 500.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (isAppError(err)) {
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  if (process.env.NODE_ENV !== 'test') {
    console.error('[storeops] unhandled error:', err);
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'production' ? undefined : message,
    },
  });
};
