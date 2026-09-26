import { Router } from 'express';

import { asyncHandler } from '../shared/errors/errorHandler';
import { ValidationError } from '../shared/errors/ValidationError';
import { currentUser, requireAuth } from '../staff/auth.middleware';
import { AlertService, alertService } from './service';
import type { AlertType, NotificationFilters, NotificationStatus } from './types';

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`, { field });
  }
  return value;
};

export const createAlertRouter = (service: AlertService = alertService): Router => {
  const router = Router();

  router.use(requireAuth());

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const caller = currentUser(req.user);
      const status = optionalString(req.query.status, 'status');
      const type = optionalString(req.query.type, 'type');
      const filters: NotificationFilters = {
        ...(status === undefined ? {} : { status: status as NotificationStatus }),
        ...(type === undefined ? {} : { type: type as AlertType }),
      };
      res.status(200).json(await service.listForUser(caller, filters));
    }),
  );

  router.post(
    '/:id/read',
    asyncHandler(async (req, res) => {
      const caller = currentUser(req.user);
      res.status(200).json(await service.markRead(caller, String(req.params.id)));
    }),
  );

  return router;
};

export const alertRouter = createAlertRouter();
