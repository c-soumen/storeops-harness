import { ActivityRepository } from '../../src/activities/repository';
import { ActivityService } from '../../src/activities/service';
import { ProgrammeRepository } from '../../src/programmes/repository';
import { ProgrammeService } from '../../src/programmes/service';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ValidationError } from '../../src/shared/errors/ValidationError';
import { EventBus } from '../../src/shared/events/EventBus';
import { StaffRepository } from '../../src/staff/repository';
import { StaffService } from '../../src/staff/service';
import type { AuthenticatedUser } from '../../src/shared/types/common';

const manager: AuthenticatedUser = {
  id: 'usr_manager',
  storeId: 'store_001',
  role: 'STORE_MANAGER',
};
const associate: AuthenticatedUser = {
  id: 'usr_associate',
  storeId: 'store_001',
  role: 'ASSOCIATE',
};

describe('ActivityService', () => {
  let repository: ActivityRepository;
  let bus: EventBus;
  let service: ActivityService;

  beforeEach(() => {
    repository = new ActivityRepository();
    bus = new EventBus();
    const programmes = new ProgrammeService(
      new ProgrammeRepository(),
      new StaffService(new StaffRepository()),
      bus,
    );
    service = new ActivityService(repository, programmes, bus);
  });

  describe('listTasks', () => {
    it('returns the seeded activities for the caller store', async () => {
      const tasks = await service.listTasks(manager);
      expect(tasks).toHaveLength(3);
      expect(tasks.every((task) => task.storeId === 'store_001')).toBe(true);
    });

    it('filters by programme and status', async () => {
      await expect(service.listTasks(manager, { programmeId: 'prg_spring_reset' })).resolves.toHaveLength(2);
      await expect(service.listTasks(manager, { status: 'DONE' })).resolves.toHaveLength(1);
      await expect(
        service.listTasks(manager, { programmeId: 'prg_spring_reset', status: 'DONE' }),
      ).resolves.toHaveLength(0);
    });

    it('returns an empty list for a store with no activities', async () => {
      const otherStore: AuthenticatedUser = { ...manager, storeId: 'store_404' };
      await expect(service.listTasks(otherStore)).resolves.toEqual([]);
    });

    it('throws ValidationError for an unknown status filter', async () => {
      await expect(
        service.listTasks(manager, { status: 'NOPE' as never }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('getTask', () => {
    it('returns the activity', async () => {
      await expect(service.getTask('act_restock_aisle4')).resolves.toMatchObject({
        title: 'Restock aisle 4 ambient shelves',
        category: 'RESTOCKING',
      });
    });

    it('throws NotFoundError for an unknown id', async () => {
      await expect(service.getTask('act_missing')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('createTask', () => {
    const validInput = {
      title: '  Face up the bakery bay  ',
      description: '  Front and face all bakery lines  ',
      programmeId: 'prg_spring_reset',
      priority: 'HIGH' as const,
      category: 'RESTOCKING' as const,
      assigneeId: 'usr_associate',
    };

    it('creates an activity and defaults its status', async () => {
      const created = await service.createTask(manager, validInput);

      expect(created.id).toMatch(/^act_/);
      expect(created.title).toBe('Face up the bakery bay');
      expect(created.description).toBe('Front and face all bakery lines');
      expect(created.status).toBe('TODO');
      expect(created.createdBy).toBe('usr_manager');
      expect(created.storeId).toBe('store_001');
      expect(repository.count()).toBe(4);
    });

    it('applies defaults for optional fields', async () => {
      const created = await service.createTask(manager, {
        title: 'Sweep the yard',
        programmeId: 'prg_spring_reset',
      });

      expect(created.priority).toBe('MEDIUM');
      expect(created.category).toBe('GENERAL');
      expect(created.assigneeId).toBeNull();
      expect(created.dueAt).toBeNull();
      expect(created.description).toBe('');
    });

    it('publishes task.created rather than calling the alerts module', async () => {
      const handler = jest.fn();
      bus.on('task.created', handler);

      const created = await service.createTask(manager, validInput);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]?.[0]).toMatchObject({
        taskId: created.id,
        category: 'RESTOCKING',
        assigneeId: 'usr_associate',
        actorId: 'usr_manager',
      });
    });

    it('throws ValidationError when the title is blank', async () => {
      await expect(
        service.createTask(manager, { ...validInput, title: '   ' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when the title is too long', async () => {
      await expect(
        service.createTask(manager, { ...validInput, title: 'x'.repeat(201) }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when programmeId is missing', async () => {
      await expect(
        service.createTask(manager, { ...validInput, programmeId: '  ' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for an unknown priority', async () => {
      await expect(
        service.createTask(manager, { ...validInput, priority: 'URGENT' as never }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for an unknown category', async () => {
      await expect(
        service.createTask(manager, { ...validInput, category: 'PRICING' as never }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError when the programme does not exist', async () => {
      await expect(
        service.createTask(manager, { ...validInput, programmeId: 'prg_missing' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ForbiddenError when the programme belongs to another store', async () => {
      await expect(
        service.createTask(manager, { ...validInput, programmeId: 'prg_backroom_refit' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('updateTask', () => {
    it('updates status, priority, category and assignee', async () => {
      const updated = await service.updateTask(manager, 'act_restock_aisle4', {
        status: 'IN_PROGRESS',
        priority: 'CRITICAL',
        category: 'AUDIT',
        assigneeId: 'usr_lead',
      });

      expect(updated).toMatchObject({
        status: 'IN_PROGRESS',
        priority: 'CRITICAL',
        category: 'AUDIT',
        assigneeId: 'usr_lead',
      });
      expect(updated.updatedAt).not.toBe(updated.createdAt);
    });

    it('clears the assignee when null is supplied', async () => {
      const updated = await service.updateTask(manager, 'act_restock_aisle4', {
        assigneeId: null,
      });
      expect(updated.assigneeId).toBeNull();
    });

    it('publishes task.status_changed only when the status actually moves', async () => {
      const handler = jest.fn();
      bus.on('task.status_changed', handler);

      await service.updateTask(manager, 'act_restock_aisle4', { status: 'TODO' });
      expect(handler).not.toHaveBeenCalled();

      await service.updateTask(manager, 'act_restock_aisle4', { status: 'IN_PROGRESS' });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]?.[0]).toMatchObject({
        previousStatus: 'TODO',
        status: 'IN_PROGRESS',
      });
    });

    it('publishes task.sla_breached when an activity becomes blocked', async () => {
      const breach = jest.fn();
      bus.on('task.sla_breached', breach);

      await service.updateTask(manager, 'act_restock_aisle4', { status: 'BLOCKED' });

      expect(breach).toHaveBeenCalledTimes(1);
      expect(breach.mock.calls[0]?.[0]).toMatchObject({
        taskId: 'act_restock_aisle4',
        priority: 'HIGH',
      });
    });

    it('does not publish a breach for other status moves', async () => {
      const breach = jest.fn();
      bus.on('task.sla_breached', breach);
      await service.updateTask(manager, 'act_restock_aisle4', { status: 'DONE' });
      expect(breach).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown activity', async () => {
      await expect(
        service.updateTask(manager, 'act_missing', { status: 'DONE' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ForbiddenError for an activity in another store', async () => {
      const otherStore: AuthenticatedUser = { ...manager, storeId: 'store_002' };
      await expect(
        service.updateTask(otherStore, 'act_restock_aisle4', { status: 'DONE' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ValidationError when no updatable field is supplied', async () => {
      await expect(service.updateTask(manager, 'act_restock_aisle4', {})).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it('throws ValidationError for unknown enum values', async () => {
      await expect(
        service.updateTask(manager, 'act_restock_aisle4', { status: 'PAUSED' as never }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        service.updateTask(manager, 'act_restock_aisle4', { priority: 'URGENT' as never }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        service.updateTask(manager, 'act_restock_aisle4', { category: 'PRICING' as never }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('deleteTask', () => {
    it('lets the owner delete their activity', async () => {
      await service.deleteTask(manager, 'act_restock_aisle4');
      expect(repository.count()).toBe(2);
      await expect(service.getTask('act_restock_aisle4')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('lets a store manager delete an activity they do not own', async () => {
      await expect(service.deleteTask(manager, 'act_chiller_temp_check')).resolves.toBeUndefined();
    });

    it('throws ForbiddenError when an associate deletes somebody else activity', async () => {
      await expect(service.deleteTask(associate, 'act_restock_aisle4')).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(repository.count()).toBe(3);
    });

    it('throws ForbiddenError for an activity in another store', async () => {
      const otherStore: AuthenticatedUser = { ...manager, storeId: 'store_002' };
      await expect(service.deleteTask(otherStore, 'act_restock_aisle4')).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });

    it('throws NotFoundError for an unknown activity', async () => {
      await expect(service.deleteTask(manager, 'act_missing')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('read helpers used by reports', () => {
    it('lists activities for a store', async () => {
      await expect(service.listTasksForStore('store_001')).resolves.toHaveLength(3);
    });

    it('lists activities for a programme', async () => {
      await expect(service.listTasksForProgramme('prg_spring_reset')).resolves.toHaveLength(2);
    });
  });

  describe('bulkUpdateStatus', () => {
    // AC-1.1
    it('updates every activity in the batch', async () => {
      const result = await service.bulkUpdateStatus(manager, {
        ids: ['act_restock_aisle4', 'act_planogram_home'],
        status: 'DONE',
      });

      expect(result.requested).toBe(2);
      expect(result.updated).toBe(2);
      expect(result.results).toEqual([
        { id: 'act_restock_aisle4', outcome: 'updated', code: null, status: 'DONE' },
        { id: 'act_planogram_home', outcome: 'updated', code: null, status: 'DONE' },
      ]);
      await expect(service.getTask('act_restock_aisle4')).resolves.toMatchObject({
        status: 'DONE',
      });
      await expect(service.getTask('act_planogram_home')).resolves.toMatchObject({
        status: 'DONE',
      });
    });

    // AC-1.2
    it('reports per-item outcomes without failing the whole batch', async () => {
      const lead: AuthenticatedUser = {
        id: 'usr_lead',
        storeId: 'store_001',
        role: 'DEPARTMENT_LEAD',
      };

      const result = await service.bulkUpdateStatus(lead, {
        ids: ['act_restock_aisle4', 'act_missing'],
        status: 'BLOCKED',
      });

      expect(result.updated).toBe(1);
      expect(result.results).toContainEqual({
        id: 'act_restock_aisle4',
        outcome: 'updated',
        code: null,
        status: 'BLOCKED',
      });
      expect(result.results).toContainEqual({
        id: 'act_missing',
        outcome: 'not_found',
        code: 'NOT_FOUND',
        status: null,
      });
    });

    // AC-1.3
    it('refuses activities from another store without touching them', async () => {
      const otherStoreManager: AuthenticatedUser = {
        id: 'usr_manager',
        storeId: 'store_002',
        role: 'STORE_MANAGER',
      };
      const foreign = await service.createTask(otherStoreManager, {
        title: 'Backroom racking teardown',
        programmeId: 'prg_backroom_refit',
      });

      const result = await service.bulkUpdateStatus(manager, {
        ids: ['act_restock_aisle4', foreign.id],
        status: 'DONE',
      });

      expect(result.updated).toBe(1);
      expect(result.results).toContainEqual({
        id: foreign.id,
        outcome: 'forbidden',
        code: 'FORBIDDEN',
        status: null,
      });
      expect(result.results).toContainEqual({
        id: 'act_restock_aisle4',
        outcome: 'updated',
        code: null,
        status: 'DONE',
      });
      await expect(service.getTask(foreign.id)).resolves.toMatchObject({ status: 'TODO' });
    });

    // AC-1.4
    it('reports unchanged and emits nothing when already in the target status', async () => {
      const handler = jest.fn();
      bus.on('task.status_changed', handler);

      const result = await service.bulkUpdateStatus(manager, {
        ids: ['act_chiller_temp_check'],
        status: 'DONE',
      });

      expect(result.updated).toBe(0);
      expect(result.results).toEqual([
        { id: 'act_chiller_temp_check', outcome: 'unchanged', code: null, status: 'DONE' },
      ]);
      expect(handler).not.toHaveBeenCalled();
    });

    // AC-1.5
    it('emits one status_changed event per changed activity', async () => {
      const handler = jest.fn();
      bus.on('task.status_changed', handler);

      await service.bulkUpdateStatus(manager, {
        ids: ['act_restock_aisle4', 'act_planogram_home', 'act_missing'],
        status: 'DONE',
      });

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler.mock.calls[0]?.[0]).toMatchObject({
        taskId: 'act_restock_aisle4',
        previousStatus: 'TODO',
        status: 'DONE',
        actorId: 'usr_manager',
      });
      expect(handler.mock.calls[1]?.[0]).toMatchObject({
        taskId: 'act_planogram_home',
        previousStatus: 'IN_PROGRESS',
        status: 'DONE',
        actorId: 'usr_manager',
      });
    });

    // AC-1.6
    it('raises an SLA breach for each activity moved to BLOCKED', async () => {
      const bulkBreach = jest.fn();
      const singleBreach = jest.fn();

      bus.on('task.sla_breached', bulkBreach);
      await service.bulkUpdateStatus(manager, { ids: ['act_restock_aisle4'], status: 'BLOCKED' });
      bus.off('task.sla_breached', bulkBreach);

      expect(bulkBreach).toHaveBeenCalledTimes(1);
      expect(bulkBreach.mock.calls[0]?.[0]).toMatchObject({
        taskId: 'act_restock_aisle4',
        priority: 'HIGH',
      });

      // The payload must be shaped exactly like the single-update path.
      bus.on('task.sla_breached', singleBreach);
      await service.updateTask(manager, 'act_planogram_home', { status: 'BLOCKED' });

      expect(Object.keys(bulkBreach.mock.calls[0]?.[0] ?? {}).sort()).toEqual(
        Object.keys(singleBreach.mock.calls[0]?.[0] ?? {}).sort(),
      );
    });

    // AC-1.7
    it('throws ValidationError for request-level problems', async () => {
      const fiftyOne = Array.from({ length: 51 }, (_, index) => `act_${index}`);

      await expect(
        service.bulkUpdateStatus(manager, { ids: [], status: 'DONE' }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        service.bulkUpdateStatus(manager, {
          ids: ['act_restock_aisle4'],
          status: 'TODO' as never,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        service.bulkUpdateStatus(manager, {
          ids: ['act_restock_aisle4'],
          status: 'PAUSED' as never,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        service.bulkUpdateStatus(manager, { ids: fiftyOne, status: 'DONE' }),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        service.bulkUpdateStatus(manager, { ids: [], status: 'DONE' }),
      ).rejects.toMatchObject({ details: { field: 'ids' } });
      await expect(
        service.bulkUpdateStatus(manager, { ids: fiftyOne, status: 'DONE' }),
      ).rejects.toMatchObject({ details: { field: 'ids' } });
      await expect(
        service.bulkUpdateStatus(manager, {
          ids: ['act_restock_aisle4'],
          status: 'TODO' as never,
        }),
      ).rejects.toMatchObject({ details: { field: 'status' } });

      // Nothing was modified by any of the rejected calls.
      await expect(service.getTask('act_restock_aisle4')).resolves.toMatchObject({
        status: 'TODO',
      });
      expect(repository.count()).toBe(3);
    });

    // AC-1.8
    it('deduplicates repeated ids', async () => {
      const handler = jest.fn();
      bus.on('task.status_changed', handler);

      const result = await service.bulkUpdateStatus(manager, {
        ids: ['act_restock_aisle4', 'act_restock_aisle4'],
        status: 'DONE',
      });

      expect(result.requested).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.updated).toBe(1);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
