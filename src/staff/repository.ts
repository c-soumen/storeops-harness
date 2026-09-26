import { nowIso } from '../shared/types/common';
import type { ID } from '../shared/types/common';
import type { AuthToken, User, UserProfile } from './types';

const SEED_ISSUED_AT = '2026-01-05T08:00:00.000Z';
const SEED_EXPIRES_AT = '2099-01-01T00:00:00.000Z';

const seedUsers = (): User[] => [
  {
    id: 'usr_regional',
    email: 'rhea.regional@storeops.test',
    name: 'Rhea Nandy',
    storeId: 'store_001',
    regionId: 'region_north',
    role: 'REGIONAL_MANAGER',
    active: true,
    createdAt: SEED_ISSUED_AT,
    updatedAt: SEED_ISSUED_AT,
  },
  {
    id: 'usr_manager',
    email: 'marcus.manager@storeops.test',
    name: 'Marcus Oduya',
    storeId: 'store_001',
    regionId: 'region_north',
    role: 'STORE_MANAGER',
    active: true,
    createdAt: SEED_ISSUED_AT,
    updatedAt: SEED_ISSUED_AT,
  },
  {
    id: 'usr_lead',
    email: 'lena.lead@storeops.test',
    name: 'Lena Fischer',
    storeId: 'store_001',
    regionId: 'region_north',
    role: 'DEPARTMENT_LEAD',
    active: true,
    createdAt: SEED_ISSUED_AT,
    updatedAt: SEED_ISSUED_AT,
  },
  {
    id: 'usr_associate',
    email: 'ade.associate@storeops.test',
    name: 'Ade Balogun',
    storeId: 'store_001',
    regionId: 'region_north',
    role: 'ASSOCIATE',
    active: true,
    createdAt: SEED_ISSUED_AT,
    updatedAt: SEED_ISSUED_AT,
  },
  {
    id: 'usr_inactive',
    email: 'sam.leaver@storeops.test',
    name: 'Sam Leaver',
    storeId: 'store_001',
    regionId: 'region_north',
    role: 'ASSOCIATE',
    active: false,
    createdAt: SEED_ISSUED_AT,
    updatedAt: SEED_ISSUED_AT,
  },
];

const seedProfiles = (): UserProfile[] => [
  {
    userId: 'usr_regional',
    displayName: 'Rhea (Region North)',
    department: 'REGIONAL_OFFICE',
    phone: '+44 20 7000 0001',
    shiftPattern: 'OFFICE_HOURS',
  },
  {
    userId: 'usr_manager',
    displayName: 'Marcus (Store 001)',
    department: 'STORE_OFFICE',
    phone: '+44 20 7000 0002',
    shiftPattern: 'EARLY',
  },
  {
    userId: 'usr_lead',
    displayName: 'Lena (Grocery)',
    department: 'GROCERY',
    phone: null,
    shiftPattern: 'LATE',
  },
  {
    userId: 'usr_associate',
    displayName: 'Ade (Grocery)',
    department: 'GROCERY',
    phone: null,
    shiftPattern: 'LATE',
  },
];

/**
 * Stub tokens so the API is usable straight after boot.
 * TODO: replace with real auth — these are static, non-expiring bearer tokens.
 */
const seedTokens = (): AuthToken[] => [
  { token: 'token-regional', userId: 'usr_regional', issuedAt: SEED_ISSUED_AT, expiresAt: SEED_EXPIRES_AT },
  { token: 'token-manager', userId: 'usr_manager', issuedAt: SEED_ISSUED_AT, expiresAt: SEED_EXPIRES_AT },
  { token: 'token-lead', userId: 'usr_lead', issuedAt: SEED_ISSUED_AT, expiresAt: SEED_EXPIRES_AT },
  { token: 'token-associate', userId: 'usr_associate', issuedAt: SEED_ISSUED_AT, expiresAt: SEED_EXPIRES_AT },
  // Deliberately expired / disabled fixtures so the auth branches are exercised.
  { token: 'token-expired', userId: 'usr_associate', issuedAt: SEED_ISSUED_AT, expiresAt: '2026-01-06T08:00:00.000Z' },
  { token: 'token-inactive', userId: 'usr_inactive', issuedAt: SEED_ISSUED_AT, expiresAt: SEED_EXPIRES_AT },
  { token: 'token-orphaned', userId: 'usr_deleted', issuedAt: SEED_ISSUED_AT, expiresAt: SEED_EXPIRES_AT },
];

export class StaffRepository {
  private users = new Map<ID, User>();
  private profiles = new Map<ID, UserProfile>();
  private tokens = new Map<string, AuthToken>();

  constructor() {
    this.reset();
  }

  /** Re-seeds the in-memory store. Called by tests between cases. */
  public reset(): void {
    this.users = new Map(seedUsers().map((user) => [user.id, user]));
    this.profiles = new Map(seedProfiles().map((profile) => [profile.userId, profile]));
    this.tokens = new Map(seedTokens().map((token) => [token.token, token]));
  }

  public findAll(): User[] {
    return [...this.users.values()];
  }

  public findById(id: ID): User | undefined {
    return this.users.get(id);
  }

  public findByEmail(email: string): User | undefined {
    const normalised = email.trim().toLowerCase();
    return this.findAll().find((user) => user.email.toLowerCase() === normalised);
  }

  public findByStore(storeId: ID): User[] {
    return this.findAll().filter((user) => user.storeId === storeId);
  }

  public findProfile(userId: ID): UserProfile | undefined {
    return this.profiles.get(userId);
  }

  public saveProfile(profile: UserProfile): UserProfile {
    this.profiles.set(profile.userId, profile);
    return profile;
  }

  public findToken(token: string): AuthToken | undefined {
    return this.tokens.get(token);
  }

  public issueToken(userId: ID): AuthToken {
    const token: AuthToken = {
      token: `token-${userId}-${this.tokens.size + 1}`,
      userId,
      issuedAt: nowIso(),
      expiresAt: SEED_EXPIRES_AT,
    };
    this.tokens.set(token.token, token);
    return token;
  }
}

export const staffRepository = new StaffRepository();
