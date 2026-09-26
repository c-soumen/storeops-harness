import express from 'express';
import request from 'supertest';

import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  asyncHandler,
  errorHandler,
  isAppError,
  notFoundHandler,
} from '../../src/shared/errors';

describe('error hierarchy', () => {
  it('maps every subclass to its HTTP status and code', () => {
    const cases: Array<[AppError, number, string]> = [
      [new ValidationError('bad input'), 400, 'VALIDATION_ERROR'],
      [new UnauthorizedError(), 401, 'UNAUTHORIZED'],
      [new ForbiddenError(), 403, 'FORBIDDEN'],
      [new NotFoundError('Activity', 'act_1'), 404, 'NOT_FOUND'],
      [new ConflictError('duplicate'), 409, 'CONFLICT'],
    ];

    for (const [error, statusCode, code] of cases) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(isAppError(error)).toBe(true);
      expect(error.statusCode).toBe(statusCode);
      expect(error.code).toBe(code);
      expect(error.name).toBe(error.constructor.name);
      expect(error.stack).toBeDefined();
    }
  });

  it('names the resource and id in NotFoundError messages', () => {
    expect(new NotFoundError('Activity', 'act_1').message).toContain('Activity');
    expect(new NotFoundError('Activity', 'act_1').message).toContain('act_1');
    expect(new NotFoundError('Activity').message).toBe('Activity not found');
  });

  it('serialises details only when they are supplied', () => {
    expect(new ValidationError('bad', { field: 'title' }).toJSON()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'bad', details: { field: 'title' } },
    });
    expect(new ForbiddenError('nope').toJSON()).toEqual({
      error: { code: 'FORBIDDEN', message: 'nope' },
    });
  });

  it('rejects non-AppError values', () => {
    expect(isAppError(new Error('raw'))).toBe(false);
    expect(isAppError('nope')).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});

describe('errorHandler middleware', () => {
  const buildApp = (): express.Express => {
    const app = express();
    app.get(
      '/app-error',
      asyncHandler(async () => {
        throw new ConflictError('already exists', { id: 'x' });
      }),
    );
    app.get(
      '/raw-error',
      asyncHandler(async () => {
        throw new TypeError('unexpected boom');
      }),
    );
    app.get('/thrown-value', () => {
      // Express forwards any truthy throwable to the error middleware.
      throw { code: 'NOT_AN_ERROR_INSTANCE' };
    });
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
  };

  it('maps an AppError to its status and body', async () => {
    const response = await request(buildApp()).get('/app-error');
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'CONFLICT', message: 'already exists', details: { id: 'x' } },
    });
  });

  it('maps an unexpected error to a 500 without leaking the class', async () => {
    const response = await request(buildApp()).get('/raw-error');
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error.message).toBe('An unexpected error occurred');
    expect(response.body.error.details).toBe('unexpected boom');
  });

  it('handles throwables that are not Error instances', async () => {
    const response = await request(buildApp()).get('/thrown-value');
    expect(response.status).toBe(500);
    expect(response.body.error.details).toBe('Unknown error');
  });

  it('turns unmatched routes into a 404 AppError response', async () => {
    const response = await request(buildApp()).get('/nowhere');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).toContain('GET /nowhere');
  });
});
