/**
 * Primitives shared by every module.
 *
 * `shared/` must never import from a domain module, so the canonical role
 * vocabulary lives here and is re-exported by `staff/types.ts` as `StaffRole`.
 */

export type ID = string;

/** ISO-8601 timestamp string. */
export type Timestamp = string;

export interface Timestamps {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const STAFF_ROLES = [
  'REGIONAL_MANAGER',
  'STORE_MANAGER',
  'DEPARTMENT_LEAD',
  'ASSOCIATE',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles allowed to administer store-wide records. */
export const MANAGER_ROLES: readonly StaffRole[] = ['REGIONAL_MANAGER', 'STORE_MANAGER'];

/** The caller identity attached to a request by the auth middleware. */
export interface AuthenticatedUser {
  id: ID;
  storeId: ID;
  role: StaffRole;
}

export const isStaffRole = (value: unknown): value is StaffRole =>
  typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);

export const isManagerRole = (role: StaffRole): boolean => MANAGER_ROLES.includes(role);

export const nowIso = (): Timestamp => new Date().toISOString();

let idCounter = 0;

/** Deterministic-ish id generator; good enough for the in-memory stub stores. */
export const newId = (prefix: string): ID => {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36).padStart(3, '0')}`;
};
