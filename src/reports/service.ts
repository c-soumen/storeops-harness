import { ForbiddenError } from '../shared/errors/ForbiddenError';
import { NotFoundError } from '../shared/errors/NotFoundError';
import { ValidationError } from '../shared/errors/ValidationError';
import { EventBus, eventBus } from '../shared/events/EventBus';
import type { Unsubscribe } from '../shared/events/events.types';
import { nowIso } from '../shared/types/common';
import type { AuthenticatedUser, ID } from '../shared/types/common';
import { ActivityService, activityService } from '../activities/service';
import { ProgrammeService, programmeService } from '../programmes/service';
import { StaffService, staffService } from '../staff/service';
import { ReportRepository, reportRepository } from './repository';
import { isReportStatus, isReportType } from './types';
import type {
  CountsByKey,
  DepartmentPerformanceData,
  DepartmentPerformanceRow,
  RegionalRollupData,
  Report,
  ReportData,
  ReportFilters,
  StoreSummaryData,
} from './types';

const OPEN_STATUSES = new Set(['TODO', 'IN_PROGRESS', 'BLOCKED']);

const tally = (values: readonly string[], keys: readonly string[]): CountsByKey => {
  const counts: CountsByKey = {};
  for (const key of keys) {
    counts[key] = 0;
  }
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
};

/**
 * READ-ONLY module (architecture rule #5).
 *
 * It aggregates through the *service* layer of activities, programmes and
 * staff, and never calls create/update/delete on any of them. The only writes
 * it performs are to its own ReportRepository.
 */
export class ReportService {
  constructor(
    private readonly repository: ReportRepository = reportRepository,
    private readonly activities: ActivityService = activityService,
    private readonly programmes: ProgrammeService = programmeService,
    private readonly staff: StaffService = staffService,
    private readonly bus: EventBus = eventBus,
  ) {}

  public async getReport(id: ID): Promise<Report> {
    const report = this.repository.findById(id);
    if (!report) {
      throw new NotFoundError('Report', id);
    }
    return report;
  }

  public async listReports(
    caller: AuthenticatedUser,
    filters: ReportFilters = {},
  ): Promise<Report[]> {
    if (filters.type !== undefined && !isReportType(filters.type)) {
      throw new ValidationError(`Unknown type ${String(filters.type)}`, { field: 'type' });
    }
    if (filters.status !== undefined && !isReportStatus(filters.status)) {
      throw new ValidationError(`Unknown status ${String(filters.status)}`, { field: 'status' });
    }
    return this.repository.findByStore(caller.storeId, filters);
  }

  public async generateStoreSummary(caller: AuthenticatedUser, storeId?: ID): Promise<Report> {
    const target = this.resolveTarget(caller, storeId);

    const report = this.repository.create({
      type: 'STORE_SUMMARY',
      storeId: target,
      status: 'PENDING',
      requestedBy: caller.id,
      data: null,
      error: null,
      completedAt: null,
    });

    const [programmes, activities, staff] = await Promise.all([
      this.programmes.listProjectsForStore(target),
      this.activities.listTasksForStore(target),
      this.staff.listByStore(target),
    ]);

    const data: StoreSummaryData = {
      storeId: target,
      programmeCount: programmes.length,
      activityCount: activities.length,
      staffCount: staff.length,
      activitiesByStatus: tally(
        activities.map((activity) => activity.status),
        ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'],
      ),
      activitiesByPriority: tally(
        activities.map((activity) => activity.priority),
        ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      ),
    };

    return this.complete(report.id, data);
  }

  public async generateRegionalRollup(
    caller: AuthenticatedUser,
    storeIds: readonly ID[],
  ): Promise<Report> {
    if (caller.role !== 'REGIONAL_MANAGER') {
      throw new ForbiddenError('Regional roll-ups are limited to regional managers');
    }
    if (storeIds.length === 0) {
      throw new ValidationError('At least one storeId is required', { field: 'storeIds' });
    }

    const report = this.repository.create({
      type: 'REGIONAL_ROLLUP',
      storeId: null,
      status: 'PENDING',
      requestedBy: caller.id,
      data: null,
      error: null,
      completedAt: null,
    });

    const activitiesByStore: CountsByKey = {};
    let totalProgrammes = 0;
    let totalActivities = 0;
    let openActivities = 0;

    for (const storeId of storeIds) {
      const [programmes, activities] = await Promise.all([
        this.programmes.listProjectsForStore(storeId),
        this.activities.listTasksForStore(storeId),
      ]);
      totalProgrammes += programmes.length;
      totalActivities += activities.length;
      openActivities += activities.filter((activity) => OPEN_STATUSES.has(activity.status)).length;
      activitiesByStore[storeId] = activities.length;
    }

    const data: RegionalRollupData = {
      storeIds: [...storeIds],
      totalProgrammes,
      totalActivities,
      openActivities,
      activitiesByStore,
    };

    return this.complete(report.id, data);
  }

  public async generateDepartmentPerformance(
    caller: AuthenticatedUser,
    storeId?: ID,
  ): Promise<Report> {
    const target = this.resolveTarget(caller, storeId);

    const report = this.repository.create({
      type: 'DEPARTMENT_PERFORMANCE',
      storeId: target,
      status: 'PENDING',
      requestedBy: caller.id,
      data: null,
      error: null,
      completedAt: null,
    });

    const [staff, activities] = await Promise.all([
      this.staff.listByStore(target),
      this.activities.listTasksForStore(target),
    ]);

    const rows = new Map<string, DepartmentPerformanceRow>();
    for (const member of staff) {
      const profile = await this.staff.getProfile(member.id).catch(() => undefined);
      const department = profile?.department ?? 'UNASSIGNED';
      const row: DepartmentPerformanceRow = rows.get(department) ?? {
        department,
        staffCount: 0,
        assignedActivities: 0,
        completedActivities: 0,
        blockedActivities: 0,
      };

      const assigned = activities.filter((activity) => activity.assigneeId === member.id);
      row.staffCount += 1;
      row.assignedActivities += assigned.length;
      row.completedActivities += assigned.filter((a) => a.status === 'DONE').length;
      row.blockedActivities += assigned.filter((a) => a.status === 'BLOCKED').length;
      rows.set(department, row);
    }

    const data: DepartmentPerformanceData = {
      storeId: target,
      departments: [...rows.values()].sort((a, b) => a.department.localeCompare(b.department)),
    };

    return this.complete(report.id, data);
  }

  /** Cross-module trigger arrives as an event (rule #3). */
  public registerSubscribers(): Unsubscribe[] {
    return [
      this.bus.on('report.store_summary_requested', async (payload) => {
        await this.generateStoreSummary(
          { id: payload.requestedBy, storeId: payload.storeId, role: 'REGIONAL_MANAGER' },
          payload.storeId,
        );
      }),
    ];
  }

  /** Reporting on a store other than your own is a regional privilege. */
  private resolveTarget(caller: AuthenticatedUser, storeId?: ID): ID {
    const target = storeId ?? caller.storeId;
    if (target !== caller.storeId && caller.role !== 'REGIONAL_MANAGER') {
      throw new ForbiddenError('Only a regional manager can report on another store');
    }
    return target;
  }

  private async complete(id: ID, data: ReportData): Promise<Report> {
    const completed = this.repository.update(id, {
      status: 'READY',
      data,
      completedAt: nowIso(),
    });
    if (!completed) {
      throw new NotFoundError('Report', id);
    }
    return completed;
  }
}

export const reportService = new ReportService();
