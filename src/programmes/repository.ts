import { newId, nowIso } from '../shared/types/common';
import type { ID } from '../shared/types/common';
import type { Project, ProjectFilters, ProjectMember } from './types';

const SEED_AT = '2026-01-06T09:00:00.000Z';

const seedProjects = (): Project[] => [
  {
    id: 'prg_spring_reset',
    name: 'Spring Planogram Reset',
    description: 'Seasonal planogram rollout across grocery and homeware aisles.',
    storeId: 'store_001',
    ownerId: 'usr_manager',
    status: 'ACTIVE',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  },
  {
    id: 'prg_compliance_q1',
    name: 'Q1 Compliance Drive',
    description: 'Food safety and labelling compliance checks for Q1.',
    storeId: 'store_001',
    ownerId: 'usr_regional',
    status: 'ACTIVE',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  },
  {
    id: 'prg_backroom_refit',
    name: 'Backroom Refit',
    description: 'Racking replacement and stockroom re-layout.',
    storeId: 'store_002',
    ownerId: 'usr_manager',
    status: 'PLANNING',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  },
];

const seedMembers = (): ProjectMember[] => [
  {
    id: 'prm_0001',
    projectId: 'prg_spring_reset',
    userId: 'usr_manager',
    role: 'STORE_MANAGER',
    joinedAt: SEED_AT,
  },
  {
    id: 'prm_0002',
    projectId: 'prg_spring_reset',
    userId: 'usr_lead',
    role: 'DEPARTMENT_LEAD',
    joinedAt: SEED_AT,
  },
  {
    id: 'prm_0003',
    projectId: 'prg_compliance_q1',
    userId: 'usr_lead',
    role: 'DEPARTMENT_LEAD',
    joinedAt: SEED_AT,
  },
];

export class ProgrammeRepository {
  private projects = new Map<ID, Project>();
  private members = new Map<ID, ProjectMember>();

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.projects = new Map(seedProjects().map((project) => [project.id, project]));
    this.members = new Map(seedMembers().map((member) => [member.id, member]));
  }

  public findByStore(storeId: ID, filters: ProjectFilters = {}): Project[] {
    return [...this.projects.values()].filter((project) => {
      if (project.storeId !== storeId) {
        return false;
      }
      if (filters.status !== undefined && project.status !== filters.status) {
        return false;
      }
      return true;
    });
  }

  public findById(id: ID): Project | undefined {
    return this.projects.get(id);
  }

  public findByOwner(ownerId: ID): Project[] {
    return [...this.projects.values()].filter((project) => project.ownerId === ownerId);
  }

  public create(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
    const timestamp = nowIso();
    const created: Project = {
      ...project,
      id: newId('prg'),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.projects.set(created.id, created);
    return created;
  }

  public update(id: ID, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Project | undefined {
    const existing = this.projects.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: Project = { ...existing, ...patch, id: existing.id, updatedAt: nowIso() };
    this.projects.set(id, updated);
    return updated;
  }

  public findMembers(projectId: ID): ProjectMember[] {
    return [...this.members.values()].filter((member) => member.projectId === projectId);
  }

  public findMembership(projectId: ID, userId: ID): ProjectMember | undefined {
    return this.findMembers(projectId).find((member) => member.userId === userId);
  }

  public findMembershipsForUser(userId: ID): ProjectMember[] {
    return [...this.members.values()].filter((member) => member.userId === userId);
  }

  public addMember(member: Omit<ProjectMember, 'id' | 'joinedAt'>): ProjectMember {
    const created: ProjectMember = { ...member, id: newId('prm'), joinedAt: nowIso() };
    this.members.set(created.id, created);
    return created;
  }
}

export const programmeRepository = new ProgrammeRepository();
