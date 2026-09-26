import express from 'express';
import request from 'supertest';

import { errorHandler, notFoundHandler } from '../../src/shared/errors/errorHandler';
import { currentUser, requireRole } from '../../src/staff/auth.middleware';
import { staffRepository } from '../../src/staff/repository';
import { createStaffRouter } from '../../src/staff/routes';
import { staffService } from '../../src/staff/service';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';

const buildApp = (): express.Express => {
  const app = express();
  app.use(express.json());
  app.use('/api/staff', createStaffRouter(staffService));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

describe('staff routes', () => {
  let app: express.Express;

  beforeEach(() => {
    staffRepository.reset();
    app = buildApp();
  });

  describe('POST /api/staff/login', () => {
    it('returns 200 with a usable token', async () => {
      const response = await request(app)
        .post('/api/staff/login')
        .send({ email: 'marcus.manager@storeops.test', password: 'pw' });

      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe('usr_manager');
      expect(typeof response.body.token.token).toBe('string');

      const me = await request(app)
        .get('/api/staff/me')
        .set('Authorization', `Bearer ${response.body.token.token}`);
      expect(me.status).toBe(200);
    });

    it('returns 400 when credentials are incomplete', async () => {
      const response = await request(app).post('/api/staff/login').send({ email: '' });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when the body is not an object', async () => {
      const response = await request(app)
        .post('/api/staff/login')
        .set('Content-Type', 'application/json')
        .send('[]');
      expect(response.status).toBe(400);
    });

    it('returns 401 for unknown credentials', async () => {
      const response = await request(app)
        .post('/api/staff/login')
        .send({ email: 'ghost@storeops.test', password: 'pw' });
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/staff/me', () => {
    it('returns the caller user and profile', async () => {
      const response = await request(app)
        .get('/api/staff/me')
        .set('Authorization', 'Bearer token-lead');

      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe('usr_lead');
      expect(response.body.profile.department).toBe('GROCERY');
    });

    it('returns 401 without an Authorization header', async () => {
      const response = await request(app).get('/api/staff/me');
      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('Bearer');
    });

    it('returns 401 for a malformed Authorization header', async () => {
      const response = await request(app)
        .get('/api/staff/me')
        .set('Authorization', 'Token token-lead');
      expect(response.status).toBe(401);
    });

    it('returns 401 for an unknown token', async () => {
      const response = await request(app)
        .get('/api/staff/me')
        .set('Authorization', 'Bearer nope');
      expect(response.status).toBe(401);
    });
  });

  it('returns 404 for an unmatched staff route', async () => {
    const response = await request(app).get('/api/staff/nowhere');
    expect(response.status).toBe(404);
  });
});

describe('auth middleware guards', () => {
  const guardedApp = (): express.Express => {
    const app = express();
    app.get(
      '/managers-only',
      (req, _res, next) => {
        req.user = { id: 'usr_associate', storeId: 'store_001', role: 'ASSOCIATE' };
        next();
      },
      requireRole('STORE_MANAGER', 'REGIONAL_MANAGER'),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    app.get(
      '/managers-only-anonymous',
      requireRole('STORE_MANAGER'),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    app.get('/allowed', (req, _res, next) => {
      req.user = { id: 'usr_manager', storeId: 'store_001', role: 'STORE_MANAGER' };
      next();
    }, requireRole('STORE_MANAGER'), (_req, res) => res.status(200).json({ ok: true }));
    app.use(errorHandler);
    return app;
  };

  it('returns 403 when the role is not permitted', async () => {
    const response = await request(guardedApp()).get('/managers-only');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 401 when there is no authenticated user', async () => {
    const response = await request(guardedApp()).get('/managers-only-anonymous');
    expect(response.status).toBe(401);
  });

  it('passes a permitted role through', async () => {
    const response = await request(guardedApp()).get('/allowed');
    expect(response.status).toBe(200);
  });

  it('currentUser throws UnauthorizedError when the request is anonymous', () => {
    expect(() => currentUser(undefined)).toThrow(UnauthorizedError);
    expect(currentUser({ id: 'usr_manager', storeId: 'store_001', role: 'STORE_MANAGER' }).id).toBe(
      'usr_manager',
    );
  });
});
