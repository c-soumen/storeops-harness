import { ForbiddenError } from '../shared/errors/ForbiddenError';
import { NotFoundError } from '../shared/errors/NotFoundError';
import { ValidationError } from '../shared/errors/ValidationError';
import { EventBus, eventBus } from '../shared/events/EventBus';
import { isManagerRole } from '../shared/types/common';
import type { AuthenticatedUser, ID } from '../shared/types/common';
import { ProgrammeService, programmeService } from '../programmes/service';
import { ActivityRepository, activityRepository } from './repository';
import { isTaskCategory, isTaskPriority, isTaskStatus } from './types';
import type { CreateTaskInput, Task, TaskFilters, UpdateTaskInput } from './types';

/** Statuses that indicate the activity can no longer progress unaided. */
const BREACH_STATUSES = new Set(['BLOCKED']);

export class ActivityService {
  constructor(
    private readonly repository: ActivityRepository = activityRepository,
    /** Cross-module read through the programmes *service* — rule #2. */
    private readonly programmes: ProgrammeService = programmeService,
    private readonly bus: EventBus = eventBus,
  ) {}

  public async listTasks(caller: AuthenticatedUser, filters: TaskFilters = {}): Promise<Task[]> {
    if (filters.status !== undefined && !isTaskStatus(filters.status)) {
      throw new ValidationError(`Unknown status ${String(filters.status)}`, { field: 'status' });
    }
    return this.repository.findAll(caller.storeId, filters);
  }

  public async getTask(id: ID): Promise<Task> {
    const task = this.repository.findById(id);
    if (!task) {
      throw new NotFoundError('Activity', id);
    }
    return task;
  }

  public async createTask(caller: AuthenticatedUser, input: CreateTaskInput): Promise<Task> {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (title.length === 0) {
      throw new ValidationError('title is required', { field: 'title' });
    }
    if (title.length > 200) {
      throw new ValidationError('title must be 200 characters or fewer', { field: 'title' });
    }

    const programmeId = typeof input.programmeId === 'string' ? input.programmeId.trim() : '';
    if (programmeId.length === 0) {
      throw new ValidationError('programmeId is required', { field: 'programmeId' });
    }
    if (input.priority !== undefined && !isTaskPriority(input.priority)) {
      throw new ValidationError(`Unknown priority ${String(input.priority)}`, { field: 'priority' });
    }
    if (input.category !== undefined && !isTaskCategory(input.category)) {
      throw new ValidationError(`Unknown category ${String(input.category)}`, { field: 'category' });
    }

    // Read-only cross-module lookup; throws NotFoundError for a bad programme.
    const programme = await this.programmes.getProject(programmeId);
    if (programme.storeId !== caller.storeId) {
      throw new ForbiddenError('Programme belongs to a different store');
    }

    const created = this.repository.create({
      title,
      description: input.description?.trim() ?? '',
      programmeId,
      storeId: caller.storeId,
      status: 'TODO',
      priority: input.priority ?? 'MEDIUM',
      category: input.category ?? 'GENERAL',
      assigneeId: input.assigneeId ?? null,
      createdBy: caller.id,
      dueAt: input.dueAt ?? null,
    });

    this.bus.emit('task.created', {
      taskId: created.id,
      programmeId: created.programmeId,
      storeId: created.storeId,
      category: created.category,
      assigneeId: created.assigneeId,
      actorId: caller.id,
    });

    return created;
  }

  public async updateTask(
    caller: AuthenticatedUser,
    id: ID,
    input: UpdateTaskInput,
  ): Promise<Task> {
    const existing = await this.getTask(id);
    if (existing.storeId !== caller.storeId) {
      throw new ForbiddenError('Activity belongs to a different store');
    }

    if (input.status !== undefined && !isTaskStatus(input.status)) {
      throw new ValidationError(`Unknown status ${String(input.status)}`, { field: 'status' });
    }
    if (input.priority !== undefined && !isTaskPriority(input.priority)) {
      throw new ValidationError(`Unknown priority ${String(input.priority)}`, { field: 'priority' });
    }
    if (input.category !== undefined && !isTaskCategory(input.category)) {
      throw new ValidationError(`Unknown category ${String(input.category)}`, { field: 'category' });
    }
    if (
      input.status === undefined &&
      input.priority === undefined &&
      input.category === undefined &&
      input.assigneeId === undefined
    ) {
      throw new ValidationError(
        'At least one of status, priority, category or assigneeId must be supplied',
      );
    }

    const updated = this.repository.update(id, {
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.assigneeId === undefined ? {} : { assigneeId: input.assigneeId }),
    });
    if (!updated) {
      throw new NotFoundError('Activity', id);
    }

    if (input.status !== undefined && input.status !== existing.status) {
      this.bus.emit('task.status_changed', {
        taskId: updated.id,
        storeId: updated.storeId,
        assigneeId: updated.assigneeId,
        previousStatus: existing.status,
        status: updated.status,
        actorId: caller.id,
      });

      if (BREACH_STATUSES.has(updated.status)) {
        // Raising the alert itself belongs to the alerts module — rule #3.
        this.bus.emit('task.sla_breached', {
          taskId: updated.id,
          storeId: updated.storeId,
          assigneeId: updated.assigneeId,
          priority: updated.priority,
          reason: `Activity moved to ${updated.status}`,
        });
      }
    }

    return updated;
  }

  public async deleteTask(caller: AuthenticatedUser, id: ID): Promise<void> {
    const existing = await this.getTask(id);
    if (existing.storeId !== caller.storeId) {
      throw new ForbiddenError('Activity belongs to a different store');
    }
    if (existing.createdBy !== caller.id && !isManagerRole(caller.role)) {
      throw new ForbiddenError('Only the activity owner or a store manager can delete it');
    }
    this.repository.delete(id);
  }

  /** Read-only helper for the reports module. */
  public async listTasksForStore(storeId: ID): Promise<Task[]> {
    return this.repository.findAll(storeId);
  }

  /** Read-only helper for the reports module. */
  public async listTasksForProgramme(programmeId: ID): Promise<Task[]> {
    return this.repository.findByProgramme(programmeId);
  }
}

export const activityService = new ActivityService();
