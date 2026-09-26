import { ForbiddenError } from '../shared/errors/ForbiddenError';
import { NotFoundError } from '../shared/errors/NotFoundError';
import { UnauthorizedError } from '../shared/errors/UnauthorizedError';
import { ValidationError } from '../shared/errors/ValidationError';
import { isManagerRole } from '../shared/types/common';
import type { AuthenticatedUser, ID } from '../shared/types/common';
import { StaffRepository, staffRepository } from './repository';
import type { AuthToken, LoginInput, LoginResult, User, UserProfile } from './types';

/**
 * Staff is the identity module. Other modules read from it through this
 * service only (architecture rule #2) — never through `StaffRepository`.
 */
export class StaffService {
  constructor(private readonly repository: StaffRepository = staffRepository) {}

  /**
   * Resolves a bearer token to the caller identity.
   * TODO: replace with real auth — tokens are static and unverified.
   */
  public async authenticate(token: string): Promise<AuthenticatedUser> {
    const trimmed = token.trim();
    if (trimmed.length === 0) {
      throw new UnauthorizedError('Bearer token is missing');
    }

    const authToken = this.repository.findToken(trimmed);
    if (!authToken) {
      throw new UnauthorizedError('Bearer token is not recognised');
    }

    if (Date.parse(authToken.expiresAt) <= Date.now()) {
      throw new UnauthorizedError('Bearer token has expired');
    }

    const user = this.repository.findById(authToken.userId);
    if (!user || !user.active) {
      throw new UnauthorizedError('Account is inactive or no longer exists');
    }

    return { id: user.id, storeId: user.storeId, role: user.role };
  }

  public async login(input: LoginInput): Promise<LoginResult> {
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';

    if (email.length === 0) {
      throw new ValidationError('email is required', { field: 'email' });
    }
    if (password.length === 0) {
      throw new ValidationError('password is required', { field: 'password' });
    }

    const user = this.repository.findByEmail(email);
    // TODO: replace with real auth — any non-empty password is accepted.
    if (!user || !user.active) {
      throw new UnauthorizedError('Invalid credentials');
    }

    return { token: this.repository.issueToken(user.id), user };
  }

  public async getUser(id: ID): Promise<User> {
    const user = this.repository.findById(id);
    if (!user) {
      throw new NotFoundError('Staff member', id);
    }
    return user;
  }

  public async getProfile(userId: ID): Promise<UserProfile> {
    await this.getUser(userId);
    const profile = this.repository.findProfile(userId);
    if (!profile) {
      throw new NotFoundError('Staff profile', userId);
    }
    return profile;
  }

  public async updateProfile(
    caller: AuthenticatedUser,
    userId: ID,
    patch: Partial<Pick<UserProfile, 'displayName' | 'department' | 'phone' | 'shiftPattern'>>,
  ): Promise<UserProfile> {
    const current = await this.getProfile(userId);
    if (caller.id !== userId && !isManagerRole(caller.role)) {
      throw new ForbiddenError('Staff can only update their own profile');
    }
    if (patch.displayName !== undefined && patch.displayName.trim().length === 0) {
      throw new ValidationError('displayName cannot be empty', { field: 'displayName' });
    }

    return this.repository.saveProfile({
      ...current,
      ...patch,
      displayName: patch.displayName?.trim() ?? current.displayName,
      userId: current.userId,
    });
  }

  public async listByStore(storeId: ID): Promise<User[]> {
    return this.repository.findByStore(storeId);
  }

  /** Read-only helper for the reports module. */
  public async findToken(token: string): Promise<AuthToken | undefined> {
    return this.repository.findToken(token);
  }
}

export const staffService = new StaffService();
