import { describe, expect, it, vi } from 'vitest';
import { createReminderNotificationCoordinator } from '../../apps/mobile/src/reminder-notification-coordinator';

describe('reminder notification lifecycle coordinator', () => {
  it('serializes concurrent reconciliation so only one schedule pass runs at a time', async () => {
    let active = 0;
    let maxActive = 0;
    const reconcile = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
    });
    const coordinator = createReminderNotificationCoordinator({ reconcile, cancelAll: vi.fn(async () => undefined) });
    await coordinator.activate('owner-a');

    await Promise.all([
      coordinator.reconcile('owner-a', []),
      coordinator.reconcile('owner-a', []),
    ]);

    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });

  it('drops a stale settings snapshot when its queued reconciliation becomes current', async () => {
    const reconcile = vi.fn(async () => undefined);
    const coordinator = createReminderNotificationCoordinator({ reconcile, cancelAll: vi.fn(async () => undefined) });
    await coordinator.activate('owner-a');

    await coordinator.reconcile('owner-a', [], () => false);

    expect(reconcile).not.toHaveBeenCalled();
  });

  it('waits for an in-flight reconcile before cancellation resolves on owner departure', async () => {
    let finishReconcile: (() => void) | undefined;
    const events: string[] = [];
    const coordinator = createReminderNotificationCoordinator({
      reconcile: async () => {
        await new Promise<void>(resolve => { finishReconcile = resolve; });
        events.push('scheduled');
      },
      cancelAll: async () => { events.push('cancelled'); },
    });
    await coordinator.activate('owner-a');
    events.length = 0;
    const reconciliation = coordinator.reconcile('owner-a', []);
    await vi.waitFor(() => expect(finishReconcile).toBeTypeOf('function'));
    const departure = coordinator.deactivate('owner-a');

    expect(events).toEqual([]);
    finishReconcile?.();
    await Promise.all([reconciliation, departure]);

    expect(events).toEqual(['scheduled', 'cancelled']);
    await coordinator.reconcile('owner-a', []);
    expect(events).toEqual(['scheduled', 'cancelled']);
  });

  it('retries cancellation after a failed owner departure before permitting storage cleanup', async () => {
    const cancelAll = vi.fn(async () => undefined);
    const coordinator = createReminderNotificationCoordinator({
      reconcile: vi.fn(async () => undefined),
      cancelAll,
    });
    await coordinator.activate('owner-a');
    cancelAll.mockRejectedValueOnce(new Error('notification service unavailable')).mockResolvedValue(undefined);

    await expect(coordinator.deactivate('owner-a')).rejects.toThrow('notification service unavailable');
    await expect(coordinator.deactivate('owner-a')).resolves.toBeUndefined();

    expect(cancelAll).toHaveBeenCalledTimes(3); // initial owner activation plus two departure attempts
    await coordinator.reconcile('owner-a', []);
  });

  it('does not mark an owner active when activation cancellation fails, and retries on the next activation', async () => {
    const cancelAll = vi.fn()
      .mockRejectedValueOnce(new Error('notification service unavailable'))
      .mockResolvedValue(undefined);
    const reconcile = vi.fn(async () => undefined);
    const coordinator = createReminderNotificationCoordinator({ reconcile, cancelAll });

    await expect(coordinator.activate('owner-a')).rejects.toThrow('notification service unavailable');
    await coordinator.reconcile('owner-a', []);
    expect(reconcile).not.toHaveBeenCalled();
    await expect(coordinator.activate('owner-a')).resolves.toBeUndefined();
    await coordinator.reconcile('owner-a', []);

    expect(cancelAll).toHaveBeenCalledTimes(2);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });
});
