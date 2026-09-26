import type { ID, Timestamps } from '../shared/types/common';

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_CATEGORIES = [
  'RESTOCKING',
  'PLANOGRAM',
  'AUDIT',
  'COMPLIANCE',
  'GENERAL',
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

/** A single operational activity on a store programme. */
export interface Task extends Timestamps {
  id: ID;
  title: string;
  description: string;
  programmeId: ID;
  storeId: ID;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  assigneeId: ID | null;
  createdBy: ID;
  dueAt: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  programmeId: ID;
  priority?: TaskPriority;
  category?: TaskCategory;
  assigneeId?: ID | null;
  dueAt?: string | null;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  assigneeId?: ID | null;
}

export interface TaskFilters {
  programmeId?: ID;
  status?: TaskStatus;
}

export const isTaskStatus = (value: unknown): value is TaskStatus =>
  typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value);

export const isTaskPriority = (value: unknown): value is TaskPriority =>
  typeof value === 'string' && (TASK_PRIORITIES as readonly string[]).includes(value);

export const isTaskCategory = (value: unknown): value is TaskCategory =>
  typeof value === 'string' && (TASK_CATEGORIES as readonly string[]).includes(value);
