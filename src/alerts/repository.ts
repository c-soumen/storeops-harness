import { newId, nowIso } from '../shared/types/common';
import type { ID } from '../shared/types/common';
import type { Notification, NotificationFilters } from './types';

const SEED_AT = '2026-01-07T08:15:00.000Z';

const seedNotifications = (): Notification[] => [
  {
    id: 'alr_low_stock_aisle4',
    userId: 'usr_associate',
    storeId: 'store_001',
    type: 'INVENTORY',
    channel: 'IN_APP',
    status: 'SENT',
    title: 'Low stock flagged on aisle 4',
    body: 'Ambient shelf capacity below 20% — restocking activity raised.',
    createdAt: SEED_AT,
    readAt: null,
  },
  {
    id: 'alr_handover_late',
    userId: 'usr_lead',
    storeId: 'store_001',
    type: 'SHIFT_HANDOVER',
    channel: 'IN_APP',
    status: 'SENT',
    title: 'Late shift handover due',
    body: 'Complete the handover checklist before 21:00.',
    createdAt: SEED_AT,
    readAt: null,
  },
  {
    id: 'alr_sla_chiller',
    userId: 'usr_manager',
    storeId: 'store_001',
    type: 'SLA_BREACH',
    channel: 'EMAIL',
    status: 'PENDING',
    title: 'Compliance check overdue',
    body: 'Chiller temperature check passed its SLA window.',
    createdAt: SEED_AT,
    readAt: null,
  },
];

export class AlertRepository {
  private notifications = new Map<ID, Notification>();

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.notifications = new Map(
      seedNotifications().map((notification) => [notification.id, notification]),
    );
  }

  public findByUser(userId: ID, filters: NotificationFilters = {}): Notification[] {
    return [...this.notifications.values()].filter((notification) => {
      if (notification.userId !== userId) {
        return false;
      }
      if (filters.status !== undefined && notification.status !== filters.status) {
        return false;
      }
      if (filters.type !== undefined && notification.type !== filters.type) {
        return false;
      }
      return true;
    });
  }

  public findByStore(storeId: ID): Notification[] {
    return [...this.notifications.values()].filter(
      (notification) => notification.storeId === storeId,
    );
  }

  public findById(id: ID): Notification | undefined {
    return this.notifications.get(id);
  }

  public create(notification: Omit<Notification, 'id' | 'createdAt' | 'readAt'>): Notification {
    const created: Notification = {
      ...notification,
      id: newId('alr'),
      createdAt: nowIso(),
      readAt: null,
    };
    this.notifications.set(created.id, created);
    return created;
  }

  public update(
    id: ID,
    patch: Partial<Omit<Notification, 'id' | 'createdAt'>>,
  ): Notification | undefined {
    const existing = this.notifications.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: Notification = { ...existing, ...patch, id: existing.id };
    this.notifications.set(id, updated);
    return updated;
  }

  public count(): number {
    return this.notifications.size;
  }
}

export const alertRepository = new AlertRepository();
