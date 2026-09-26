import type { ID, Timestamp } from '../shared/types/common';

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'READ', 'FAILED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const ALERT_TYPES = ['INVENTORY', 'SLA_BREACH', 'SHIFT_HANDOVER', 'ESCALATION'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export interface Notification {
  id: ID;
  userId: ID;
  storeId: ID;
  type: AlertType;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  body: string;
  createdAt: Timestamp;
  readAt: Timestamp | null;
}

export interface CreateNotificationInput {
  userId: ID;
  storeId: ID;
  type: AlertType;
  title: string;
  body?: string;
  channel?: NotificationChannel;
}

export interface NotificationFilters {
  status?: NotificationStatus;
  type?: AlertType;
}

export const isAlertType = (value: unknown): value is AlertType =>
  typeof value === 'string' && (ALERT_TYPES as readonly string[]).includes(value);

export const isNotificationStatus = (value: unknown): value is NotificationStatus =>
  typeof value === 'string' && (NOTIFICATION_STATUSES as readonly string[]).includes(value);

export const isNotificationChannel = (value: unknown): value is NotificationChannel =>
  typeof value === 'string' && (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
