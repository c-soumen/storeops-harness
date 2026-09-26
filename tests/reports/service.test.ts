import { ActivityRepository } from '../../src/activities/repository';
import { ActivityService } from '../../src/activities/service';
import { ProgrammeRepository } from '../../src/programmes/repository';
import { ProgrammeService } from '../../src/programmes/service';
import { ReportRepository } from '../../src/reports/repository';
import { ReportService } from '../../src/reports/service';
import type {
  DepartmentPerformanceData,
  RegionalRollupData,
  StoreSummaryData,
} from '../../src/reports/types';
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
const regional: AuthenticatedUser = {
  id: 'usr_regional',
  storeId: 'store_001',
  role: 'REGIONAL_MANAGER',
};

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('ReportService', () => {
  let repository: ReportRepository;
  let activities: ActivityService;
  let programmes: ProgrammeService;
  let staff: StaffService;
  let bus: EventBus;
  let service: ReportService;

  beforeEach(() => {
    repository = new ReportRepository();
    bus = new EventBus();
    staff = new StaffService(new StaffRepository());
    programmes = new ProgrammeService(new ProgrammeRepository(), staff, bus);
    activities = new ActivityService(new ActivityRepository(), programmes, bus);
    service = new ReportService(repository, activities, programmes, staff, bus);
  });

  describe('getReport', () => {
    it('returns a seeded report', async () => {
      await expect(service.getReport('rpt_store001_summary')).resolves.toMatchObject({
        type: 'STORE_SUMMARY',
        status: 'READY',
      });
    });

    it('throws NotFoundError for an unknown report', async () => {
      await expect(service.getReport('rpt_missing')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('listReports', () => {
    it('returns the reports for the caller store', async () => {
      const reports = await service.listReports(manager);
      expect(reports).toHaveLength(1);
      expect(reports[0]?.id).toBe('rpt_store001_summary');
    });

    it('filters by type and status', async () => {
      await expect(service.listReports(manager, { type: 'STORE_SUMMARY' })).resolves.toHaveLength(1);
      await expect(service.listReports(manager, { status: 'PENDING' })).resolves.toHaveLength(0);
    });

    it('throws ValidationError for an unknown type filter', async () => {
      await expect(
        service.listReports(manager, { type: 'FORECAST' as never }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for an unknown status filter', async () => {
      await expect(
        service.listReports(manager, { status: 'ARCHIVED' as never }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('generateStoreSummary', () => {
    it('aggregates programmes, activities and staff for the caller store', async () => {
      const report = await service.generateStoreSummary(manager);
      const data = report.data as StoreSummaryData;

      expect(report.status).toBe('READY');
      expect(report.type).toBe('STORE_SUMMARY');
      expect(report.completedAt).not.toBeNull();
      expect(report.requestedBy).toBe('usr_manager');
      expect(data.storeId).toBe('store_001');
      expect(data.programmeCount).toBe(2);
      expect(data.activityCount).toBe(3);
      expect(data.staffCount).toBeGreaterThanOrEqual(4);
      expect(data.activitiesByStatus).toEqual({
        TODO: 1,
        IN_PROGRESS: 1,
        DONE: 1,
        BLOCKED: 0,
      });
      expect(data.activitiesByPriority).toEqual({
        LOW: 0,
        MEDIUM: 1,
        HIGH: 1,
        CRITICAL: 1,
      });
    });

    it('reflects live changes made through the other modules', async () => {
      await activities.updateTask(manager, 'act_restock_aisle4', { status: 'BLOCKED' });

      const report = await service.generateStoreSummary(manager);
      const data = report.data as StoreSummaryData;

      expect(data.activitiesByStatus.BLOCKED).toBe(1);
      expect(data.activitiesByStatus.TODO).toBe(0);
    });

    it('returns zeroed counts for a store with no data', async () => {
      const report = await service.generateStoreSummary(regional, 'store_404');
      const data = report.data as StoreSummaryData;

      expect(data.programmeCount).toBe(0);
      expect(data.activityCount).toBe(0);
      expect(data.staffCount).toBe(0);
    });

    it('lets a regional manager report on another store', async () => {
      const report = await service.generateStoreSummary(regional, 'store_002');
      expect((report.data as StoreSummaryData).programmeCount).toBe(1);
    });

    it('throws ForbiddenError when a store manager reports on another store', async () => {
      await expect(service.generateStoreSummary(manager, 'store_002')).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe('generateRegionalRollup', () => {
    it('rolls up several stores', async () => {
      const report = await service.generateRegionalRollup(regional, ['store_001', 'store_002']);
      const data = report.data as RegionalRollupData;

      expect(report.storeId).toBeNull();
      expect(report.status).toBe('READY');
      expect(data.totalProgrammes).toBe(3);
      expect(data.totalActivities).toBe(3);
      expect(data.openActivities).toBe(2);
      expect(data.activitiesByStore).toEqual({ store_001: 3, store_002: 0 });
    });

    it('throws ForbiddenError for a non-regional caller', async () => {
      await expect(
        service.generateRegionalRollup(manager, ['store_001']),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ValidationError when no store is supplied', async () => {
      await expect(service.generateRegionalRollup(regional, [])).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });

  describe('generateDepartmentPerformance', () => {
    it('groups staff and their activities by department', async () => {
      const report = await service.generateDepartmentPerformance(manager);
      const data = report.data as DepartmentPerformanceData;

      expect(report.type).toBe('DEPARTMENT_PERFORMANCE');
      expect(data.storeId).toBe('store_001');

      const grocery = data.departments.find((row) => row.department === 'GROCERY');
      expect(grocery).toMatchObject({
        staffCount: 2,
        assignedActivities: 3,
        completedActivities: 1,
        blockedActivities: 0,
      });

      expect(data.departments.map((row) => row.department)).toEqual(
        [...data.departments.map((row) => row.department)].sort(),
      );
    });

    it('buckets staff without a profile as UNASSIGNED', async () => {
      const report = await service.generateDepartmentPerformance(manager);
      const data = report.data as DepartmentPerformanceData;

      expect(data.departments.some((row) => row.department === 'UNASSIGNED')).toBe(true);
    });

    it('throws ForbiddenError when a store manager reports on another store', async () => {
      await expect(
        service.generateDepartmentPerformance(manager, 'store_002'),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('event subscribers', () => {
    it('generates a store summary when one is requested over the bus', async () => {
      service.registerSubscribers();

      bus.emit('report.store_summary_requested', {
        storeId: 'store_001',
        requestedBy: 'usr_regional',
      });
      await flush();

      const generated = repository
        .findAll({ type: 'STORE_SUMMARY', status: 'READY' })
        .filter((report) => report.requestedBy === 'usr_regional');
      expect(generated).toHaveLength(1);
    });
  });

  describe('read-only contract', () => {
    it('never mutates the modules it aggregates', async () => {
      const activitiesBefore = await activities.listTasksForStore('store_001');
      const programmesBefore = await programmes.listProjectsForStore('store_001');
      const staffBefore = await staff.listByStore('store_001');

      await service.generateStoreSummary(manager);
      await service.generateDepartmentPerformance(manager);
      await service.generateRegionalRollup(regional, ['store_001', 'store_002']);

      await expect(activities.listTasksForStore('store_001')).resolves.toEqual(activitiesBefore);
      await expect(programmes.listProjectsForStore('store_001')).resolves.toEqual(programmesBefore);
      await expect(staff.listByStore('store_001')).resolves.toEqual(staffBefore);
    });

    it('publishes nothing of its own while aggregating', async () => {
      await service.generateStoreSummary(manager);
      expect(bus.history()).toHaveLength(0);
    });
  });
});
