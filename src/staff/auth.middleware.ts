import type { RequestHandler } from 'express';

import { ForbiddenError } from '../shared/errors/ForbiddenError';
import { UnauthorizedError } from '../shared/errors/UnauthorizedError';
import type { AuthenticatedUser, StaffRole } from '../shared/types/common';
import { StaffService, staffService } from './service';

const BEARER_PREFIX = /^Bearer\s+/i;

/**
 * TODO: replace with real auth.
 *
 * Stub-quality authentication: reads `Authorization: Bearer <token>` and looks
 * the token up in the in-memory staff store. No signature, no expiry checks
 * beyond the stored timestamp, no refresh.
 */
export const requireAuth = (service: StaffService = staffService): RequestHandler => {
  return (req, _res, next) => {
    const header = req.header('authorization');
    if (!header || !BEARER_PREFIX.test(header)) {
      next(new UnauthorizedError('Authorization header must be "Bearer <token>"'));
      return;
    }

    service
      .authenticate(header.replace(BEARER_PREFIX, ''))
      .then((user) => {
        req.user = user;
        next();
      })
      .catch(next);
  };
};

/** Route guard for role-restricted endpoints. */
export const requireRole = (...roles: StaffRole[]): RequestHandler => {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(user.role)) {
      next(new ForbiddenError(`Requires one of: ${roles.join(', ')}`));
      return;
    }
    next();
  };
};

/**
 * Narrows `req.user` for handlers that run behind `requireAuth`.
 * Throws rather than returning undefined so handlers stay branch-free.
 */
export const currentUser = (user: AuthenticatedUser | undefined): AuthenticatedUser => {
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
};
