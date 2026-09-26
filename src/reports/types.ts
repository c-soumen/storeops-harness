import type { ID, Timestamp } from '../shared/types/common';

export const REPORT_TYPES = [
  'STORE_SUMMARY',
  'REGIONAL_ROLLUP',
  'DEPARTMENT_PERFORMANCE',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_STATUSES = ['PENDING', 'READY', 'FAILED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Aggregated counts are kept as plain records so the reports module does not
 * depend on the enum types owned by other modules.
 */
export type CountsByKey = Record<string, number>;

export interface StoreSummaryData {
  storeId: ID;
  programmeCount: number;
  activityCount: number;
  staffCount: number;
  activitiesByStatus: CountsByKey;
  activitiesByPriority: CountsByKey;
}

export interface RegionalRollupData {
  storeIds: ID[];
  totalProgrammes: number;
  totalActivities: number;
  openActivities: number;
  activitiesByStore: CountsByKey;
}

export interface DepartmentPerformanceData {
  storeId: ID;
  departments: DepartmentPerformanceRow[];
}

export interface DepartmentPerformanceRow {
  department: string;
  staffCount: number;
  assignedActivities: number;
  completedActivities: number;
  blockedActivities: number;
}

export type ReportData = StoreSummaryData | RegionalRollupData | DepartmentPerformanceData;

export interface Report {
  id: ID;
  type: ReportType;
  storeId: ID | null;
  status: ReportStatus;
  requestedBy: ID;
  data: ReportData | null;
  error: string | null;
  createdAt: Timestamp;
  completedAt: Timestamp | null;
}

export interface ReportFilters {
  type?: ReportType;
  status?: ReportStatus;
}

export const isReportType = (value: unknown): value is ReportType =>
  typeof value === 'string' && (REPORT_TYPES as readonly string[]).includes(value);

export const isReportStatus = (value: unknown): value is ReportStatus =>
  typeof value === 'string' && (REPORT_STATUSES as readonly string[]).includes(value);
