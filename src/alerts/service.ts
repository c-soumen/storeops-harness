import { ForbiddenError } from '../shared/errors/ForbiddenError';
import { NotFoundError } from '../shared/errors/NotFoundError';
import { ValidationError } from '../shared/errors/ValidationError';
import { EventBus, eventBus } from '../shared/events/EventBus';
import type { Unsubscribe } from '../shared/events/events.types';
import { nowIso } from '../shared/types/common';
import type { AuthenticatedUser, ID } from '../shared/types/common';
import { AlertRepository, alertRepository } from './repository';
import { isAlertType, isNotificationChannel, isNotificationStatus } from './types';
import type { CreateNotificationInput, Notification, NotificationFilters } from './types';

export class AlertService {
  constructor(
    private readonly repository: AlertRepository = alertRepository,
    private readonly bus: EventBus = eventBus,
  ) {}

  public async listForUser(
    caller: AuthenticatedUser,
    filters: NotificationFilters = {},
  ): Promise<Notification[]> {
    if (filters.status !== undefined && !isNotificationStatus(filters.status)) {
      throw new ValidationError(`Unknown status ${String(filters.status)}`, { field: 'status' });
    }
    if (filters.type !== undefined && !isAlertType(filters.type)) {
      throw new ValidationError(`Unknown type ${String(filters.type)}`, { field: 'type' });
    }
    return this.repository.findByUser(caller.id, filters);
  }

  public async getNotification(caller: AuthenticatedUser, id: ID): Promise<Notification> {
    const notification = this.repository.findById(id);
    if (!notification) {
      throw new NotFoundError('Alert', id);
    }
    if (notification.userId !== caller.id) {
      throw new ForbiddenError('Alerts can only be read by their recipient');
    }
    return notification;
  }

  public async createNotification(input: CreateNotificationInput): Promise<Notification> {
    const userId = typeof input.userId === 'string' ? input.userId.trim() : '';
    if (userId.length === 0) {
      throw new ValidationError('userId is required', { field: 'userId' });
    }
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (title.length === 0) {
      throw new ValidationError('title is required', { field: 'title' });
    }
    if (!isAlertType(input.type)) {
      throw new ValidationError(`Unknown type ${String(input.type)}`, { field: 'type' });
    }
    if (input.channel !== undefined && !isNotificationChannel(input.channel)) {
      throw new ValidationError(`Unknown channel ${String(input.channel)}`, { field: 'channel' });
    }

    return this.repository.create({
      userId,
      storeId: input.storeId,
      type: input.type,
      channel: input.channel ?? 'IN_APP',
      status: 'PENDING',
      title,
      body: input.body?.trim() ?? '',
    });
  }

  public async markRead(caller: AuthenticatedUser, id: ID): Promise<Notification> {
    await this.getNotification(caller, id);
    const updated = this.repository.update(id, { status: 'READ', readAt: nowIso() });
    if (!updated) {
      throw new NotFoundError('Alert', id);
    }
    return updated;
  }

  /**
   * Cross-module side effects arrive as events (rule #3) — alerts never
   * imports activities or programmes to find out that something happened.
   */
  public registerSubscribers(): Unsubscribe[] {
    return [
      this.bus.on('task.sla_breached', async (payload) => {
        if (!payload.assigneeId) {
          return;
        }
        await this.createNotification({
          userId: payload.assigneeId,
          storeId: payload.storeId,
          type: 'SLA_BREACH',
          title: `SLA breach on activity ${payload.taskId}`,
          body: `${payload.reason} (priority ${payload.priority}).`,
          channel: payload.priority === 'CRITICAL' ? 'EMAIL' : 'IN_APP',
        });
      }),

      this.bus.on('task.created', async (payload) => {
        if (payload.category !== 'RESTOCKING' || !payload.assigneeId) {
          return;
        }
        await this.createNotification({
          userId: payload.assigneeId,
          storeId: payload.storeId,
          type: 'INVENTORY',
          title: 'Restocking activity assigned to you',
          body: `Activity ${payload.taskId} on programme ${payload.programmeId}.`,
        });
      }),

      this.bus.on('programme.member_added', async (payload) => {
        await this.createNotification({
          userId: payload.userId,
          storeId: payload.storeId,
          type: 'SHIFT_HANDOVER',
          title: 'You were added to a programme',
          body: `Programme ${payload.programmeId} — role ${payload.role}.`,
        });
      }),
    ];
  }
}

export const alertService = new AlertService();
