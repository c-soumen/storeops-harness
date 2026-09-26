import { AlertRepository } from '../../src/alerts/repository';
import { AlertService } from '../../src/alerts/service';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ValidationError } from '../../src/shared/errors/ValidationError';
import { EventBus } from '../../src/shared/events/EventBus';
import type { AuthenticatedUser } from '../../src/shared/types/common';

const associate: AuthenticatedUser = {
  id: 'usr_associate',
  storeId: 'store_001',
  role: 'ASSOCIATE',
};
const lead: AuthenticatedUser = {
  id: 'usr_lead',
  storeId: 'store_001',
  role: 'DEPARTMENT_LEAD',
};

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('AlertService', () => {
  let repository: AlertRepository;
  let bus: EventBus;
  let service: AlertService;

  beforeEach(() => {
    repository = new AlertRepository();
    bus = new EventBus();
    service = new AlertService(repository, bus);
  });

  describe('listForUser', () => {
    it('returns only the alerts addressed to the caller', async () => {
      const alerts = await service.listForUser(associate);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.id).toBe('alr_low_stock_aisle4');
    });

    it('filters by status and type', async () => {
      await expect(service.listForUser(lead, { status: 'SENT' })).resolves.toHaveLength(1);
      await expect(service.listForUser(lead, { status: 'READ' })).resolves.toHaveLength(0);
      await expect(service.listForUser(lead, { type: 'SHIFT_HANDOVER' })).resolves.toHaveLength(1);
      await expect(service.listForUser(lead, { type: 'INVENTORY' })).resolves.toHaveLength(0);
    });

    it('throws ValidationError for an unknown status filter', async () => {
      await expect(
        service.listForUser(associate, { status: 'ARCHIVED' as never }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for an unknown type filter', async () => {
      await expect(
        service.listForUser(associate, { type: 'PRICING' as never }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('getNotification', () => {
    it('returns the alert for its recipient', async () => {
      await expect(service.getNotification(associate, 'alr_low_stock_aisle4')).resolves.toMatchObject(
        { type: 'INVENTORY' },
      );
    });

    it('throws NotFoundError for an unknown alert', async () => {
      await expect(service.getNotification(associate, 'alr_missing')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('throws ForbiddenError when the caller is not the recipient', async () => {
      await expect(service.getNotification(lead, 'alr_low_stock_aisle4')).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe('createNotification', () => {
    it('creates an in-app alert by default', async () => {
      const created = await service.createNotification({
        userId: '  usr_associate  ',
        storeId: 'store_001',
        type: 'ESCALATION',
        title: '  Escalated to duty manager  ',
      });

      expect(created).toMatchObject({
        userId: 'usr_associate',
        title: 'Escalated to duty manager',
        channel: 'IN_APP',
        status: 'PENDING',
        body: '',
        readAt: null,
      });
      expect(repository.count()).toBe(4);
    });

    it('honours an explicit channel', async () => {
      const created = await service.createNotification({
        userId: 'usr_associate',
        storeId: 'store_001',
        type: 'ESCALATION',
        title: 'Emailed escalation',
        channel: 'EMAIL',
      });
      expect(created.channel).toBe('EMAIL');
    });

    it('throws ValidationError when userId is blank', async () => {
      await expect(
        service.createNotification({
          userId: '  ',
          storeId: 'store_001',
          type: 'ESCALATION',
          title: 'x',
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when the title is blank', async () => {
      await expect(
        service.createNotification({
          userId: 'usr_associate',
          storeId: 'store_001',
          type: 'ESCALATION',
          title: '   ',
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for an unknown alert type', async () => {
      await expect(
        service.createNotification({
          userId: 'usr_associate',
          storeId: 'store_001',
          type: 'PRICING' as never,
          title: 'x',
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError for an unknown channel', async () => {
      await expect(
        service.createNotification({
          userId: 'usr_associate',
          storeId: 'store_001',
          type: 'ESCALATION',
          title: 'x',
          channel: 'SMS' as never,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('markRead', () => {
    it('marks the alert as read', async () => {
      const updated = await service.markRead(associate, 'alr_low_stock_aisle4');
      expect(updated.status).toBe('READ');
      expect(updated.readAt).not.toBeNull();
      await expect(service.listForUser(associate, { status: 'READ' })).resolves.toHaveLength(1);
    });

    it('throws NotFoundError for an unknown alert', async () => {
      await expect(service.markRead(associate, 'alr_missing')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('throws ForbiddenError when the caller is not the recipient', async () => {
      await expect(service.markRead(lead, 'alr_low_stock_aisle4')).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe('event subscribers', () => {
    beforeEach(() => {
      service.registerSubscribers();
    });

    it('raises an SLA_BREACH alert for the assignee', async () => {
      bus.emit('task.sla_breached', {
        taskId: 'act_1',
        storeId: 'store_001',
        assigneeId: 'usr_associate',
        priority: 'HIGH',
        reason: 'Activity moved to BLOCKED',
      });
      await flush();

      const alerts = await service.listForUser(associate, { type: 'SLA_BREACH' });
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.channel).toBe('IN_APP');
      expect(alerts[0]?.body).toContain('BLOCKED');
    });

    it('escalates a critical SLA breach to email', async () => {
      bus.emit('task.sla_breached', {
        taskId: 'act_1',
        storeId: 'store_001',
        assigneeId: 'usr_associate',
        priority: 'CRITICAL',
        reason: 'Activity moved to BLOCKED',
      });
      await flush();

      const alerts = await service.listForUser(associate, { type: 'SLA_BREACH' });
      expect(alerts[0]?.channel).toBe('EMAIL');
    });

    it('ignores an SLA breach with no assignee', async () => {
      bus.emit('task.sla_breached', {
        taskId: 'act_1',
        storeId: 'store_001',
        assigneeId: null,
        priority: 'HIGH',
        reason: 'Activity moved to BLOCKED',
      });
      await flush();

      expect(repository.count()).toBe(3);
    });

    it('raises an INVENTORY alert for an assigned restocking activity', async () => {
      bus.emit('task.created', {
        taskId: 'act_2',
        programmeId: 'prg_spring_reset',
        storeId: 'store_001',
        category: 'RESTOCKING',
        assigneeId: 'usr_associate',
        actorId: 'usr_manager',
      });
      await flush();

      await expect(
        service.listForUser(associate, { type: 'INVENTORY' }),
      ).resolves.toHaveLength(2);
    });

    it('ignores non-restocking or unassigned activity creation', async () => {
      bus.emit('task.created', {
        taskId: 'act_3',
        programmeId: 'prg_spring_reset',
        storeId: 'store_001',
        category: 'AUDIT',
        assigneeId: 'usr_associate',
        actorId: 'usr_manager',
      });
      bus.emit('task.created', {
        taskId: 'act_4',
        programmeId: 'prg_spring_reset',
        storeId: 'store_001',
        category: 'RESTOCKING',
        assigneeId: null,
        actorId: 'usr_manager',
      });
      await flush();

      expect(repository.count()).toBe(3);
    });

    it('raises a SHIFT_HANDOVER alert when a member joins a programme', async () => {
      bus.emit('programme.member_added', {
        programmeId: 'prg_spring_reset',
        storeId: 'store_001',
        userId: 'usr_associate',
        role: 'ASSOCIATE',
        actorId: 'usr_manager',
      });
      await flush();

      const alerts = await service.listForUser(associate, { type: 'SHIFT_HANDOVER' });
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.body).toContain('prg_spring_reset');
    });

    it('survives a subscriber failure without breaking the publisher', async () => {
      expect(() =>
        bus.emit('programme.member_added', {
          programmeId: 'prg_spring_reset',
          storeId: 'store_001',
          userId: '   ',
          role: 'ASSOCIATE',
          actorId: 'usr_manager',
        }),
      ).not.toThrow();
      await flush();
      expect(repository.count()).toBe(3);
    });
  });
});
