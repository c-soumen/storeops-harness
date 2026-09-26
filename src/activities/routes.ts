import { Router } from 'express';

import { asyncHandler } from '../shared/errors/errorHandler';
import { ValidationError } from '../shared/errors/ValidationError';
import { currentUser, requireAuth } from '../staff/auth.middleware';
import { ActivityService, activityService } from './service';
import type {
  BulkStatusInput,
  BulkStatusTarget,
  CreateTaskInput,
  TaskCategory,
  TaskFilters,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput,
} from './types';

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

/** Assignee may be cleared by sending an explicit null. */
const nullableString = (value: unknown, field: string): string | null => {
  if (value === null) {
    return null;
  }
  return optionalString(value, field) ?? null;
};

export const createActivityRouter = (service: ActivityService = activityService): Router => {
  const router = Router();

  router.use(requireAuth());

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const caller = currentUser(req.user);
      const programmeId = optionalString(req.query.programmeId, 'programmeId');
      const status = optionalString(req.query.status, 'status');
      const filters: TaskFilters = {
        ...(programmeId === undefined ? {} : { programmeId }),
        ...(status === undefined ? {} : { status: status as TaskStatus }),
      };
      res.status(200).json(await service.listTasks(caller, filters));
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const caller = currentUser(req.user);
      const body = asObject(req.body);
      const input: CreateTaskInput = {
        title: optionalString(body.title, 'title') ?? '',
        description: optionalString(body.description, 'description'),
        programmeId: optionalString(body.programmeId, 'programmeId') ?? '',
        priority: body.priority as TaskPriority | undefined,
        category: body.category as TaskCategory | undefined,
        assigneeId: nullableString(body.assigneeId, 'assigneeId'),
        dueAt: optionalString(body.dueAt, 'dueAt') ?? null,
      };
      res.status(201).json(await service.createTask(caller, input));
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.getTask(String(req.params.id)));
    }),
  );

  // Registered before PATCH /:id — otherwise :id captures the literal "bulk-status".
  router.patch(
    '/bulk-status',
    asyncHandler(async (req, res) => {
      const caller = currentUser(req.user);
      const body = asObject(req.body);

      if (!Array.isArray(body.ids)) {
        throw new ValidationError('ids must be an array of activity ids', { field: 'ids' });
      }

      const input: BulkStatusInput = {
        ids: body.ids.map((id, index) => optionalString(id, `ids[${index}]`) ?? ''),
        status: body.status as BulkStatusTarget,
      };

      // 207 describes the batch, not the items: per-item failures are in the body.
      res.status(207).json(await service.bulkUpdateStatus(caller, input));
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const caller = currentUser(req.user);
      const body = asObject(req.body);
      const input: UpdateTaskInput = {
        status: body.status as TaskStatus | undefined,
        priority: body.priority as TaskPriority | undefined,
        category: body.category as TaskCategory | undefined,
        ...(body.assigneeId === undefined
          ? {}
          : { assigneeId: nullableString(body.assigneeId, 'assigneeId') }),
      };
      res.status(200).json(await service.updateTask(caller, String(req.params.id), input));
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const caller = currentUser(req.user);
      await service.deleteTask(caller, String(req.params.id));
      res.status(204).send();
    }),
  );

  return router;
};

export const activityRouter = createActivityRouter();
