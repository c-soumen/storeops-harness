import type { ID, Timestamp, Timestamps } from '../shared/types/common';

export const PROJECT_ROLES = ['STORE_MANAGER', 'DEPARTMENT_LEAD', 'ASSOCIATE'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** A store programme: a seasonal rollout, compliance drive, refit, etc. */
export interface Project extends Timestamps {
  id: ID;
  name: string;
  description: string;
  storeId: ID;
  ownerId: ID;
  status: ProjectStatus;
}

export interface ProjectMember {
  id: ID;
  projectId: ID;
  userId: ID;
  role: ProjectRole;
  joinedAt: Timestamp;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  status?: ProjectStatus;
}

export interface AddMemberInput {
  userId: ID;
  role: ProjectRole;
}

export interface ProjectFilters {
  status?: ProjectStatus;
}

export const isProjectRole = (value: unknown): value is ProjectRole =>
  typeof value === 'string' && (PROJECT_ROLES as readonly string[]).includes(value);

export const isProjectStatus = (value: unknown): value is ProjectStatus =>
  typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);
