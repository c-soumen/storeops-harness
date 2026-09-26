import { nowIso } from '../types/common';
import type {
  DomainEvent,
  DomainEventName,
  DomainEventPayloads,
  EventHandler,
  Unsubscribe,
} from './events.types';

/**
 * Handlers are kept in a loosely typed registry and narrowed at the public
 * boundary; the generic on/emit signatures are what keep callers type-safe.
 */
type AnyHandler = (payload: never, event: never) => void | Promise<void>;

/**
 * Minimal in-process, typed publish/subscribe bus.
 *
 * A failing subscriber must never break the publisher own transaction, so
 * handler errors are caught and logged rather than rethrown.
 */
export class EventBus {
  private readonly handlers = new Map<DomainEventName, Set<AnyHandler>>();
  private readonly published: DomainEvent[] = [];

  public on<TName extends DomainEventName>(name: TName, handler: EventHandler<TName>): Unsubscribe {
    const existing = this.handlers.get(name) ?? new Set<AnyHandler>();
    existing.add(handler as AnyHandler);
    this.handlers.set(name, existing);
    return () => this.off(name, handler);
  }

  public once<TName extends DomainEventName>(
    name: TName,
    handler: EventHandler<TName>,
  ): Unsubscribe {
    const wrapped: EventHandler<TName> = (payload, event) => {
      unsubscribe();
      return handler(payload, event);
    };
    const unsubscribe = this.on(name, wrapped);
    return unsubscribe;
  }

  public off<TName extends DomainEventName>(name: TName, handler: EventHandler<TName>): void {
    this.handlers.get(name)?.delete(handler as AnyHandler);
  }

  public emit<TName extends DomainEventName>(
    name: TName,
    payload: DomainEventPayloads[TName],
  ): DomainEvent<TName> {
    const event: DomainEvent<TName> = { name, payload, occurredAt: nowIso() };
    this.published.push(event as DomainEvent);

    const existing = this.handlers.get(name);
    if (!existing) {
      return event;
    }

    for (const handler of [...existing] as EventHandler<TName>[]) {
      try {
        const result = handler(payload, event);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.reportHandlerFailure(name, error));
        }
      } catch (error) {
        this.reportHandlerFailure(name, error);
      }
    }

    return event;
  }

  public listenerCount(name: DomainEventName): number {
    return this.handlers.get(name)?.size ?? 0;
  }

  /** Published-event log; used by tests and for a lightweight audit trail. */
  public history(name?: DomainEventName): readonly DomainEvent[] {
    return name === undefined
      ? [...this.published]
      : this.published.filter((event) => event.name === name);
  }

  public clear(): void {
    this.handlers.clear();
    this.published.length = 0;
  }

  private reportHandlerFailure(name: DomainEventName, error: unknown): void {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[storeops] event handler for ${name} failed:`, error);
    }
  }
}

/** Process-wide bus used by the running app. Tests may build their own. */
export const eventBus = new EventBus();
