import type { ID, Timestamp, Timestamps } from '../shared/types/common';

export { STAFF_ROLES, isStaffRole } from '../shared/types/common';
export type { StaffRole } from '../shared/types/common';

import type { StaffRole } from '../shared/types/common';

export interface User extends Timestamps {
  id: ID;
  email: string;
  name: string;
  storeId: ID;
  /** Region the store belongs to — used by regional roll-up reports. */
  regionId: ID;
  role: StaffRole;
  active: boolean;
}

export interface UserProfile {
  userId: ID;
  displayName: string;
  department: string;
  phone: string | null;
  shiftPattern: string;
}

export interface AuthToken {
  token: string;
  userId: ID;
  issuedAt: Timestamp;
  expiresAt: Timestamp;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  token: AuthToken;
  user: User;
}
