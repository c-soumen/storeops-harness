import { Router } from 'express';

import { asyncHandler } from '../shared/errors/errorHandler';
import { ValidationError } from '../shared/errors/ValidationError';
import { currentUser, requireAuth } from '../staff/auth.middleware';
import { ProgrammeService, programmeService } from './service';
import type { AddMemberInput, CreateProjectInput, ProjectFilters, ProjectStatus } from './types';

const asObject = (body: unknown): Record<string, unknown> => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
};

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`, { field });
  }
  return value;
};

export const createProgrammeRouter = (service: ProgrammeService = programmeService): Router => {
  const router = Router();

  router.use(requireAuth());

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const caller = currentUser(req.user);
      const status = optionalString(req.query.status, 'status');
      const filters: ProjectFilters =
        status === undefined ? {} : { status: status as ProjectStatus };
      res.status(200).json(await service.listProjects(caller, filters));
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const caller = currentUser(req.user);
      const body = asObject(req.body);
      const input: CreateProjectInput = {
        name: optionalString(body.name, 'name') ?? '',
        description: optionalString(body.description, 'description'),
        status: body.status as ProjectStatus | undefined,
      };
      res.status(201).json(await service.createProject(caller, input));
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.getProject(String(req.params.id)));
    }),
  );

  router.get(
    '/:id/members',
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.listMembers(String(req.params.id)));
    }),
  );

  router.post(
    '/:id/members',
    asyncHandler(async (req, res) => {
      const caller = currentUser(req.user);
      const body = asObject(req.body);
      const input = {
        userId: optionalString(body.userId, 'userId') ?? '',
        role: body.role,
      } as AddMemberInput;
      res.status(201).json(await service.addMember(caller, String(req.params.id), input));
    }),
  );

  return router;
};

export const programmeRouter = createProgrammeRouter();
