import { newId, nowIso } from '../shared/types/common';
import type { ID } from '../shared/types/common';
import type { Task, TaskFilters } from './types';

const SEED_AT = '2026-01-07T07:30:00.000Z';

const seedTasks = (): Task[] => [
  {
    id: 'act_restock_aisle4',
    title: 'Restock aisle 4 ambient shelves',
    description: 'Overnight delivery pallet 12 to be worked before opening.',
    programmeId: 'prg_spring_reset',
    storeId: 'store_001',
    status: 'TODO',
    priority: 'HIGH',
    category: 'RESTOCKING',
    assigneeId: 'usr_associate',
    createdBy: 'usr_manager',
    dueAt: '2026-01-08T06:00:00.000Z',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  },
  {
    id: 'act_planogram_home',
    title: 'Reset homeware planogram to spring layout',
    description: 'Follow planogram pack SPR-26 bay by bay.',
    programmeId: 'prg_spring_reset',
    storeId: 'store_001',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    category: 'PLANOGRAM',
    assigneeId: 'usr_lead',
    createdBy: 'usr_manager',
    dueAt: '2026-01-12T17:00:00.000Z',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  },
  {
    id: 'act_chiller_temp_check',
    title: 'Chiller temperature compliance check',
    description: 'Record all chiller temperatures and log exceptions.',
    programmeId: 'prg_compliance_q1',
    storeId: 'store_001',
    status: 'DONE',
    priority: 'CRITICAL',
    category: 'COMPLIANCE',
    assigneeId: 'usr_lead',
    createdBy: 'usr_regional',
    dueAt: '2026-01-07T12:00:00.000Z',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  },
];

export class ActivityRepository {
  private tasks = new Map<ID, Task>();

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.tasks = new Map(seedTasks().map((task) => [task.id, task]));
  }

  public findAll(storeId: ID, filters: TaskFilters = {}): Task[] {
    return [...this.tasks.values()].filter((task) => {
      if (task.storeId !== storeId) {
        return false;
      }
      if (filters.programmeId !== undefined && task.programmeId !== filters.programmeId) {
        return false;
      }
      if (filters.status !== undefined && task.status !== filters.status) {
        return false;
      }
      return true;
    });
  }

  public findByProgramme(programmeId: ID): Task[] {
    return [...this.tasks.values()].filter((task) => task.programmeId === programmeId);
  }

  public findById(id: ID): Task | undefined {
    return this.tasks.get(id);
  }

  /** Single lookup pass for bulk operations; unknown ids are simply absent. */
  public findByIds(ids: readonly ID[]): Task[] {
    const found: Task[] = [];
    for (const id of ids) {
      const task = this.tasks.get(id);
      if (task) {
        found.push(task);
      }
    }
    return found;
  }

  public create(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
    const timestamp = nowIso();
    const created: Task = { ...task, id: newId('act'), createdAt: timestamp, updatedAt: timestamp };
    this.tasks.set(created.id, created);
    return created;
  }

  public update(id: ID, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Task | undefined {
    const existing = this.tasks.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: Task = { ...existing, ...patch, id: existing.id, updatedAt: nowIso() };
    this.tasks.set(id, updated);
    return updated;
  }

  public delete(id: ID): boolean {
    return this.tasks.delete(id);
  }

  public count(): number {
    return this.tasks.size;
  }
}

export const activityRepository = new ActivityRepository();
