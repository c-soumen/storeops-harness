import type { ID, Timestamp } from '../types/common';
import type { StaffRole } from '../types/common';

/**
 * Cross-module side effects travel as events (architecture rule #3). A module
 * that wants something to happen elsewhere publishes; it never imports the
 * other module's service to do the work.
 */
export interface DomainEventPayloads {
  'task.created': {
    taskId: ID;
    programmeId: ID;
    storeId: ID;
    category: string;
    assigneeId: ID | null;
    actorId: ID;
  };
  'task.status_changed': {
    taskId: ID;
    storeId: ID;
    assigneeId: ID | null;
    previousStatus: string;
    status: string;
    actorId: ID;
  };
  'task.sla_breached': {
    taskId: ID;
    storeId: ID;
    assigneeId: ID | null;
    priority: string;
    reason: string;
  };
  'programme.member_added': {
    programmeId: ID;
    storeId: ID;
    userId: ID;
    role: StaffRole;
    actorId: ID;
  };
  'report.store_summary_requested': {
    storeId: ID;
    requestedBy: ID;
  };
}

export type DomainEventName = keyof DomainEventPayloads;

export interface DomainEvent<TName extends DomainEventName = DomainEventName> {
  name: TName;
  payload: DomainEventPayloads[TName];
  occurredAt: Timestamp;
}

export type EventHandler<TName extends DomainEventName> = (
  payload: DomainEventPayloads[TName],
  event: DomainEvent<TName>,
) => void | Promise<void>;

export type Unsubscribe = () => void;

export const DOMAIN_EVENT_NAMES = [
  'task.created',
  'task.status_changed',
  'task.sla_breached',
  'programme.member_added',
  'report.store_summary_requested',
] as const satisfies readonly DomainEventName[];
