import { EventBus } from '../../src/shared/events/EventBus';
import { DOMAIN_EVENT_NAMES } from '../../src/shared/events/events.types';

const payload = {
  taskId: 'act_1',
  storeId: 'store_001',
  assigneeId: 'usr_associate',
  priority: 'HIGH',
  reason: 'blocked',
};

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('delivers a published event to every subscriber', () => {
    const first = jest.fn();
    const second = jest.fn();
    bus.on('task.sla_breached', first);
    bus.on('task.sla_breached', second);

    const event = bus.emit('task.sla_breached', payload);

    expect(first).toHaveBeenCalledWith(payload, event);
    expect(second).toHaveBeenCalledTimes(1);
    expect(event.name).toBe('task.sla_breached');
    expect(Date.parse(event.occurredAt)).not.toBeNaN();
  });

  it('does not deliver to subscribers of other events', () => {
    const handler = jest.fn();
    bus.on('task.created', handler);
    bus.emit('task.sla_breached', payload);
    expect(handler).not.toHaveBeenCalled();
  });

  it('stops delivery after unsubscribe', () => {
    const handler = jest.fn();
    const unsubscribe = bus.on('task.sla_breached', handler);

    unsubscribe();
    bus.emit('task.sla_breached', payload);

    expect(handler).not.toHaveBeenCalled();
    expect(bus.listenerCount('task.sla_breached')).toBe(0);
  });

  it('supports off as well as the returned unsubscribe', () => {
    const handler = jest.fn();
    bus.on('task.sla_breached', handler);
    bus.off('task.sla_breached', handler);
    bus.off('task.created', handler);
    bus.emit('task.sla_breached', payload);
    expect(handler).not.toHaveBeenCalled();
  });

  it('delivers a once subscription exactly one time', () => {
    const handler = jest.fn();
    bus.once('task.sla_breached', handler);

    bus.emit('task.sla_breached', payload);
    bus.emit('task.sla_breached', payload);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('isolates the publisher from a throwing subscriber', () => {
    const failing = jest.fn(() => {
      throw new Error('subscriber exploded');
    });
    const healthy = jest.fn();
    bus.on('task.sla_breached', failing);
    bus.on('task.sla_breached', healthy);

    expect(() => bus.emit('task.sla_breached', payload)).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it('isolates the publisher from a rejecting async subscriber', async () => {
    bus.on('task.sla_breached', async () => {
      throw new Error('async subscriber exploded');
    });

    expect(() => bus.emit('task.sla_breached', payload)).not.toThrow();
    await Promise.resolve();
  });

  it('records history and can be filtered by event name', () => {
    bus.emit('task.sla_breached', payload);
    bus.emit('report.store_summary_requested', {
      storeId: 'store_001',
      requestedBy: 'usr_manager',
    });

    expect(bus.history()).toHaveLength(2);
    expect(bus.history('task.sla_breached')).toHaveLength(1);
  });

  it('clears handlers and history', () => {
    const handler = jest.fn();
    bus.on('task.sla_breached', handler);
    bus.emit('task.sla_breached', payload);

    bus.clear();

    expect(bus.history()).toHaveLength(0);
    expect(bus.listenerCount('task.sla_breached')).toBe(0);
  });

  it('emits safely when nobody is listening', () => {
    expect(() => bus.emit('task.sla_breached', payload)).not.toThrow();
  });

  it('declares every event name used by the modules', () => {
    expect(DOMAIN_EVENT_NAMES).toContain('task.created');
    expect(DOMAIN_EVENT_NAMES).toContain('task.status_changed');
    expect(DOMAIN_EVENT_NAMES).toContain('task.sla_breached');
    expect(DOMAIN_EVENT_NAMES).toContain('programme.member_added');
    expect(DOMAIN_EVENT_NAMES).toContain('report.store_summary_requested');
  });
});
