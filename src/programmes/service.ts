import { ConflictError } from '../shared/errors/ConflictError';
import { ForbiddenError } from '../shared/errors/ForbiddenError';
import { NotFoundError } from '../shared/errors/NotFoundError';
import { ValidationError } from '../shared/errors/ValidationError';
import { EventBus, eventBus } from '../shared/events/EventBus';
import { isManagerRole } from '../shared/types/common';
import type { AuthenticatedUser, ID } from '../shared/types/common';
import { StaffService, staffService } from '../staff/service';
import { ProgrammeRepository, programmeRepository } from './repository';
import { isProjectRole, isProjectStatus } from './types';
import type {
  AddMemberInput,
  CreateProjectInput,
  Project,
  ProjectFilters,
  ProjectMember,
} from './types';

export class ProgrammeService {
  constructor(
    private readonly repository: ProgrammeRepository = programmeRepository,
    /** Cross-module read through the staff *service* — rule #2. */
    private readonly staff: StaffService = staffService,
    private readonly bus: EventBus = eventBus,
  ) {}

  public async listProjects(
    caller: AuthenticatedUser,
    filters: ProjectFilters = {},
  ): Promise<Project[]> {
    if (filters.status !== undefined && !isProjectStatus(filters.status)) {
      throw new ValidationError(`Unknown status ${String(filters.status)}`, { field: 'status' });
    }
    return this.repository.findByStore(caller.storeId, filters);
  }

  public async getProject(id: ID): Promise<Project> {
    const project = this.repository.findById(id);
    if (!project) {
      throw new NotFoundError('Programme', id);
    }
    return project;
  }

  public async createProject(
    caller: AuthenticatedUser,
    input: CreateProjectInput,
  ): Promise<Project> {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name.length === 0) {
      throw new ValidationError('name is required', { field: 'name' });
    }
    if (name.length > 120) {
      throw new ValidationError('name must be 120 characters or fewer', { field: 'name' });
    }
    if (input.status !== undefined && !isProjectStatus(input.status)) {
      throw new ValidationError(`Unknown status ${String(input.status)}`, { field: 'status' });
    }

    const duplicate = this.repository
      .findByStore(caller.storeId)
      .find((project) => project.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      throw new ConflictError(`A programme named ${name} already exists for this store`, {
        programmeId: duplicate.id,
      });
    }

    return this.repository.create({
      name,
      description: input.description?.trim() ?? '',
      storeId: caller.storeId,
      ownerId: caller.id,
      status: input.status ?? 'PLANNING',
    });
  }

  public async listMembers(id: ID): Promise<ProjectMember[]> {
    await this.getProject(id);
    return this.repository.findMembers(id);
  }

  public async addMember(
    caller: AuthenticatedUser,
    projectId: ID,
    input: AddMemberInput,
  ): Promise<ProjectMember> {
    const project = await this.getProject(projectId);

    if (project.ownerId !== caller.id && !isManagerRole(caller.role)) {
      throw new ForbiddenError('Only the programme owner or a store manager can add members');
    }

    const userId = typeof input.userId === 'string' ? input.userId.trim() : '';
    if (userId.length === 0) {
      throw new ValidationError('userId is required', { field: 'userId' });
    }
    if (!isProjectRole(input.role)) {
      throw new ValidationError(`Unknown role ${String(input.role)}`, { field: 'role' });
    }

    // Read-only cross-module lookup; throws NotFoundError when the staff
    // member does not exist.
    const member = await this.staff.getUser(userId);
    if (member.storeId !== project.storeId) {
      throw new ValidationError('Staff member belongs to a different store', { field: 'userId' });
    }

    if (this.repository.findMembership(projectId, userId)) {
      throw new ConflictError('Staff member is already on this programme', { projectId, userId });
    }

    const created = this.repository.addMember({ projectId, userId, role: input.role });

    // Side effect (alerting the new member) is another module job — rule #3.
    this.bus.emit('programme.member_added', {
      programmeId: projectId,
      storeId: project.storeId,
      userId,
      role: member.role,
      actorId: caller.id,
    });

    return created;
  }

  /** Read-only helper used by activities and reports. */
  public async isMember(projectId: ID, userId: ID): Promise<boolean> {
    return this.repository.findMembership(projectId, userId) !== undefined;
  }

  /** Read-only helper for reports aggregation. */
  public async listProjectsForStore(storeId: ID): Promise<Project[]> {
    return this.repository.findByStore(storeId);
  }
}

export const programmeService = new ProgrammeService();
