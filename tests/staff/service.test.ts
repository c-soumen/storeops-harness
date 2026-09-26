import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { ValidationError } from '../../src/shared/errors/ValidationError';
import type { AuthenticatedUser } from '../../src/shared/types/common';
import { StaffRepository } from '../../src/staff/repository';
import { StaffService } from '../../src/staff/service';

const manager: AuthenticatedUser = { id: 'usr_manager', storeId: 'store_001', role: 'STORE_MANAGER' };
const associate: AuthenticatedUser = {
  id: 'usr_associate',
  storeId: 'store_001',
  role: 'ASSOCIATE',
};

describe('StaffService', () => {
  let repository: StaffRepository;
  let service: StaffService;

  beforeEach(() => {
    repository = new StaffRepository();
    service = new StaffService(repository);
  });

  describe('authenticate', () => {
    it('resolves a known token to the caller identity', async () => {
      await expect(service.authenticate('token-manager')).resolves.toEqual({
        id: 'usr_manager',
        storeId: 'store_001',
        role: 'STORE_MANAGER',
      });
    });

    it('tolerates surrounding whitespace', async () => {
      const user = await service.authenticate('  token-associate  ');
      expect(user.id).toBe('usr_associate');
    });

    it('rejects an empty token with UnauthorizedError', async () => {
      await expect(service.authenticate('   ')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rejects an unknown token with UnauthorizedError', async () => {
      await expect(service.authenticate('nope')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rejects an expired token with UnauthorizedError', async () => {
      await expect(service.authenticate('token-expired')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rejects a token for a deactivated account', async () => {
      await expect(service.authenticate('token-inactive')).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it('rejects a token whose user no longer exists', async () => {
      await expect(service.authenticate('token-orphaned')).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });
  });

  describe('login', () => {
    it('issues a token for a known staff member', async () => {
      const result = await service.login({
        email: 'Marcus.Manager@storeops.test',
        password: 'anything',
      });

      expect(result.user.id).toBe('usr_manager');
      expect(result.token.userId).toBe('usr_manager');
      await expect(service.authenticate(result.token.token)).resolves.toMatchObject({
        id: 'usr_manager',
      });
    });

    it('throws ValidationError when the email is missing', async () => {
      await expect(service.login({ email: '  ', password: 'pw' })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it('throws ValidationError when the password is missing', async () => {
      await expect(
        service.login({ email: 'marcus.manager@storeops.test', password: '' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws UnauthorizedError for an unknown email', async () => {
      await expect(
        service.login({ email: 'ghost@storeops.test', password: 'pw' }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('throws UnauthorizedError for a deactivated account', async () => {
      await expect(
        service.login({ email: 'sam.leaver@storeops.test', password: 'pw' }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe('getUser', () => {
    it('returns the staff record', async () => {
      await expect(service.getUser('usr_lead')).resolves.toMatchObject({
        id: 'usr_lead',
        role: 'DEPARTMENT_LEAD',
      });
    });

    it('throws NotFoundError for an unknown id', async () => {
      await expect(service.getUser('usr_missing')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getProfile', () => {
    it('returns the profile for a known staff member', async () => {
      await expect(service.getProfile('usr_lead')).resolves.toMatchObject({
        userId: 'usr_lead',
        department: 'GROCERY',
      });
    });

    it('throws NotFoundError when the staff member does not exist', async () => {
      await expect(service.getProfile('usr_missing')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError when the staff member has no profile', async () => {
      await expect(service.getProfile('usr_inactive')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('updateProfile', () => {
    it('updates the profile of the caller', async () => {
      const updated = await service.updateProfile(associate, 'usr_associate', {
        displayName: '  Ade B.  ',
        phone: '+44 20 7000 0009',
      });

      expect(updated.displayName).toBe('Ade B.');
      expect(updated.phone).toBe('+44 20 7000 0009');
      await expect(service.getProfile('usr_associate')).resolves.toMatchObject({
        displayName: 'Ade B.',
      });
    });

    it('lets a manager update another staff profile', async () => {
      const updated = await service.updateProfile(manager, 'usr_associate', {
        department: 'HOMEWARE',
      });
      expect(updated.department).toBe('HOMEWARE');
      expect(updated.displayName).toBe('Ade (Grocery)');
    });

    it('throws ForbiddenError when an associate edits somebody else', async () => {
      await expect(
        service.updateProfile(associate, 'usr_lead', { department: 'HOMEWARE' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ValidationError for a blank display name', async () => {
      await expect(
        service.updateProfile(associate, 'usr_associate', { displayName: '   ' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError for an unknown staff member', async () => {
      await expect(
        service.updateProfile(manager, 'usr_missing', { department: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('read helpers used by other modules', () => {
    it('lists staff for a store', async () => {
      const staff = await service.listByStore('store_001');
      expect(staff.length).toBeGreaterThanOrEqual(4);
      expect(staff.every((member) => member.storeId === 'store_001')).toBe(true);
    });

    it('returns an empty list for a store with no staff', async () => {
      await expect(service.listByStore('store_999')).resolves.toEqual([]);
    });

    it('exposes token lookup without throwing for unknown tokens', async () => {
      await expect(service.findToken('token-manager')).resolves.toMatchObject({
        userId: 'usr_manager',
      });
      await expect(service.findToken('nope')).resolves.toBeUndefined();
    });
  });
});
