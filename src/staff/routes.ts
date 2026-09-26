import { Router } from 'express';

import { asyncHandler } from '../shared/errors/errorHandler';
import { ValidationError } from '../shared/errors/ValidationError';
import { currentUser, requireAuth } from './auth.middleware';
import { StaffService, staffService } from './service';
import type { LoginInput } from './types';

/**
 * Staff exposes no CRUD surface — only the two auth endpoints needed to obtain
 * and inspect an identity. Staff records are read by other modules through
 * `StaffService`, not over HTTP.
 */
export const createStaffRouter = (service: StaffService = staffService): Router => {
  const router = Router();

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const body = req.body as Partial<LoginInput> | undefined;
      if (!body || typeof body !== 'object') {
        throw new ValidationError('Request body must be a JSON object');
      }

      const result = await service.login({
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
      });
      res.status(200).json(result);
    }),
  );

  router.get(
    '/me',
    requireAuth(service),
    asyncHandler(async (req, res) => {
      const caller = currentUser(req.user);
      const [user, profile] = await Promise.all([
        service.getUser(caller.id),
        service.getProfile(caller.id),
      ]);
      res.status(200).json({ user, profile });
    }),
  );

  return router;
};

export const staffRouter = createStaffRouter();
