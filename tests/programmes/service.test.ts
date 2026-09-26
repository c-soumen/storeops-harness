import { ProgrammeRepository } from '../../src/programmes/repository';
import { ProgrammeService } from '../../src/programmes/service';
import { ConflictError } from '../../src/shared/errors/ConflictError';
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
const regional: AuthenticatedUser = {
  id: 'usr_regional',
  storeId: 'store_001',
  role: 'REGIONAL_MANAGER',
};

describe('ProgrammeService', () => {
  let repository: ProgrammeRepository;
  let bus: EventBus;
  let service: ProgrammeService;

  beforeEach(() => {
    repository = new ProgrammeRepository();
    bus = new EventBus();
    service = new ProgrammeService(repository, new StaffService(new StaffRepository()), bus);
  });

  describe('listProjects', () => {
    it('returns only the programmes of the caller store', async () => {
      const projects = await service.listProjects(manager);
      expect(projects).toHaveLength(2);
      expect(projects.every((project) => project.storeId === 'store_001')).toBe(true);
    });

    it('filters by status', async () => {
      await expect(service.listProjects(manager, { status: 'ACTIVE' })).resolves.toHaveLength(2);
      await expect(service.listProjects(manager, { status: 'COMPLETED' })).resolves.toHaveLength(0);
    });

    it('throws ValidationError for an unknown status filter', async () => {
      await expect(
        service.listProjects(manager, { status: 'ARCHIVED' as never }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('getProject', () => {
    it('returns the programme', async () => {
      await expect(service.getProject('prg_spring_reset')).resolves.toMatchObject({
        name: 'Spring Planogram Reset',
        ownerId: 'usr_manager',
      });
    });

    it('throws NotFoundError for an unknown programme', async () => {
      await expect(service.getProject('prg_missing')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('createProject', () => {
    it('creates a programme owned by the caller', async () => {
      const created = await service.createProject(manager, {
        name: '  Summer Refit  ',
        description: '  Front of store refresh  ',
      });

      expect(created.id).toMatch(/^prg_/);
      expect(created.name).toBe('Summer Refit');
      expect(created.description).toBe('Front of store refresh');
      expect(created.ownerId).toBe('usr_manager');
      expect(created.storeId).toBe('store_001');
      expect(created.status).toBe('PLANNING');
    });

    it('accepts an explicit status', async () => {
      const created = await service.createProject(manager, { name: 'Refit B', status: 'ACTIVE' });
      expect(created.status).toBe('ACTIVE');
    });

    it('throws ValidationError when the name is blank', async () => {
      await expect(service.createProject(manager, { name: '   ' })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it('throws ValidationError when the name is too long', async () => {
      await expect(
        service.createProject(manager, { name: 'x'.repeat(121) }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for an unknown status', async () => {
      await expect(
        service.createProject(manager, { name: 'Refit C', status: 'ARCHIVED' as never }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ConflictError for a duplicate name in the same store', async () => {
      await expect(
        service.createProject(manager, { name: 'spring planogram reset' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('allows the same name in a different store', async () => {
      const otherStore: AuthenticatedUser = { ...manager, storeId: 'store_003' };
      await expect(
        service.createProject(otherStore, { name: 'Spring Planogram Reset' }),
      ).resolves.toMatchObject({ storeId: 'store_003' });
    });
  });

  describe('listMembers', () => {
    it('returns the seeded membership', async () => {
      const members = await service.listMembers('prg_spring_reset');
      expect(members).toHaveLength(2);
      expect(members.map((member) => member.userId)).toContain('usr_lead');
    });

    it('throws NotFoundError for an unknown programme', async () => {
      await expect(service.listMembers('prg_missing')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('addMember', () => {
    it('adds a staff member to the programme', async () => {
      const member = await service.addMember(manager, 'prg_spring_reset', {
        userId: '  usr_associate  ',
        role: 'ASSOCIATE',
      });

      expect(member).toMatchObject({
        projectId: 'prg_spring_reset',
        userId: 'usr_associate',
        role: 'ASSOCIATE',
      });
      await expect(service.isMember('prg_spring_reset', 'usr_associate')).resolves.toBe(true);
    });

    it('publishes programme.member_added instead of alerting directly', async () => {
      const handler = jest.fn();
      bus.on('programme.member_added', handler);

      await service.addMember(manager, 'prg_spring_reset', {
        userId: 'usr_associate',
        role: 'ASSOCIATE',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]?.[0]).toMatchObject({
        programmeId: 'prg_spring_reset',
        userId: 'usr_associate',
        storeId: 'store_001',
        actorId: 'usr_manager',
      });
    });

    it('lets a regional manager add members to a programme they do not own', async () => {
      await expect(
        service.addMember(regional, 'prg_spring_reset', {
          userId: 'usr_associate',
          role: 'ASSOCIATE',
        }),
      ).resolves.toMatchObject({ userId: 'usr_associate' });
    });

    it('throws NotFoundError for an unknown programme', async () => {
      await expect(
        service.addMember(manager, 'prg_missing', { userId: 'usr_associate', role: 'ASSOCIATE' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError for an unknown staff member', async () => {
      await expect(
        service.addMember(manager, 'prg_spring_reset', {
          userId: 'usr_missing',
          role: 'ASSOCIATE',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ForbiddenError for a caller who is neither owner nor manager', async () => {
      await expect(
        service.addMember(associate, 'prg_compliance_q1', {
          userId: 'usr_associate',
          role: 'ASSOCIATE',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ValidationError when userId is blank', async () => {
      await expect(
        service.addMember(manager, 'prg_spring_reset', { userId: '  ', role: 'ASSOCIATE' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for an unknown role', async () => {
      await expect(
        service.addMember(manager, 'prg_spring_reset', {
          userId: 'usr_associate',
          role: 'CHIEF' as never,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when the staff member belongs to another store', async () => {
      await expect(
        service.addMember(manager, 'prg_backroom_refit', {
          userId: 'usr_associate',
          role: 'ASSOCIATE',
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ConflictError when the staff member is already on the programme', async () => {
      await expect(
        service.addMember(manager, 'prg_spring_reset', {
          userId: 'usr_lead',
          role: 'DEPARTMENT_LEAD',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('read helpers used by other modules', () => {
    it('reports non-membership', async () => {
      await expect(service.isMember('prg_spring_reset', 'usr_associate')).resolves.toBe(false);
    });

    it('lists programmes for a store', async () => {
      await expect(service.listProjectsForStore('store_002')).resolves.toHaveLength(1);
      await expect(service.listProjectsForStore('store_404')).resolves.toEqual([]);
    });
  });
});
