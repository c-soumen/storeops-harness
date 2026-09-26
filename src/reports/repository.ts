import { newId, nowIso } from '../shared/types/common';
import type { ID } from '../shared/types/common';
import type { Report, ReportFilters } from './types';

const SEED_AT = '2026-01-07T10:00:00.000Z';

const seedReports = (): Report[] => [
  {
    id: 'rpt_store001_summary',
    type: 'STORE_SUMMARY',
    storeId: 'store_001',
    status: 'READY',
    requestedBy: 'usr_manager',
    data: {
      storeId: 'store_001',
      programmeCount: 2,
      activityCount: 3,
      staffCount: 4,
      activitiesByStatus: { TODO: 1, IN_PROGRESS: 1, DONE: 1, BLOCKED: 0 },
      activitiesByPriority: { LOW: 0, MEDIUM: 1, HIGH: 1, CRITICAL: 1 },
    },
    error: null,
    createdAt: SEED_AT,
    completedAt: SEED_AT,
  },
  {
    id: 'rpt_region_north_rollup',
    type: 'REGIONAL_ROLLUP',
    storeId: null,
    status: 'PENDING',
    requestedBy: 'usr_regional',
    data: null,
    error: null,
    createdAt: SEED_AT,
    completedAt: null,
  },
];

export class ReportRepository {
  private reports = new Map<ID, Report>();

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.reports = new Map(seedReports().map((report) => [report.id, report]));
  }

  public findAll(filters: ReportFilters = {}): Report[] {
    return [...this.reports.values()].filter((report) => {
      if (filters.type !== undefined && report.type !== filters.type) {
        return false;
      }
      if (filters.status !== undefined && report.status !== filters.status) {
        return false;
      }
      return true;
    });
  }

  public findByStore(storeId: ID, filters: ReportFilters = {}): Report[] {
    return this.findAll(filters).filter((report) => report.storeId === storeId);
  }

  public findById(id: ID): Report | undefined {
    return this.reports.get(id);
  }

  public create(report: Omit<Report, 'id' | 'createdAt'>): Report {
    const created: Report = { ...report, id: newId('rpt'), createdAt: nowIso() };
    this.reports.set(created.id, created);
    return created;
  }

  public update(id: ID, patch: Partial<Omit<Report, 'id' | 'createdAt'>>): Report | undefined {
    const existing = this.reports.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: Report = { ...existing, ...patch, id: existing.id };
    this.reports.set(id, updated);
    return updated;
  }

  public count(): number {
    return this.reports.size;
  }
}

export const reportRepository = new ReportRepository();
