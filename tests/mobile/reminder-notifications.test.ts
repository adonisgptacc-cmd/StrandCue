import { describe, expect, it, vi } from 'vitest';
import { createReminderNotifications } from '../../apps/mobile/src/reminder-notifications';

function gateway() {
  return {
    setNotificationChannelAsync: vi.fn(async () => undefined),
    getPermissionsAsync: vi.fn(async () => ({ granted: true })),
    requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
    getAllScheduledNotificationsAsync: vi.fn(async () => [] as {
      identifier: string;
      content: { data?: Record<string, unknown> };
    }[]),
    cancelScheduledNotificationAsync: vi.fn(async (_id: string) => undefined),
    scheduleNotificationAsync: vi.fn(async (_request: unknown) => 'scheduled-id'),
  };
}

describe('reminder notifications', () => {
  it('creates the Android channel before asking for permission', async () => {
    const api = gateway();
    const adapter = createReminderNotifications(api, 'android');

    await expect(adapter.requestPermissionAfterExplanation()).resolves.toBe(true);

    const channelCall = api.setNotificationChannelAsync.mock.invocationCallOrder[0];
    const permissionCall = api.getPermissionsAsync.mock.invocationCallOrder[0];
    expect(channelCall).toBeLessThan(permissionCall);
    expect(api.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not schedule when permission is denied', async () => {
    const api = gateway();
    api.getPermissionsAsync.mockResolvedValue({ granted: false });
    api.requestPermissionsAsync.mockResolvedValue({ granted: false });
    const adapter = createReminderNotifications(api, 'android');

    await expect(adapter.requestPermissionAfterExplanation()).resolves.toBe(false);
    await adapter.reconcile([{ id: 'p1', scheduledFor: new Date('2030-01-01T10:00:00.000Z') }]);

    expect(api.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('uses generic lock-screen copy and stores no owner, category or event detail', async () => {
    const api = gateway();
    const adapter = createReminderNotifications(api, 'ios');

    await adapter.reconcile([{ id: 'plan-private-1', scheduledFor: new Date('2030-01-01T10:00:00.000Z') }]);

    const request = api.scheduleNotificationAsync.mock.calls[0]?.[0] as {
      content: { title: string; body: string; data: Record<string, unknown> };
    };
    expect(request.content.title).toBe('A StrandCue reminder');
    expect(request.content.body).toBe('Open the app when convenient.');
    expect(request.content.data).toEqual({
      kind: 'strandcue-reminder',
      reminderId: 'plan-private-1',
      scheduledFor: '2030-01-01T10:00:00.000Z',
    });
    expect(JSON.stringify(request.content)).not.toMatch(/owner|category|product|treatment/i);
  });

  it('is idempotent and cancels only stale StrandCue reminders', async () => {
    const api = gateway();
    api.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: 'keep', content: { data: { kind: 'strandcue-reminder', reminderId: 'same', scheduledFor: '2030-01-01T10:00:00.000Z' } } },
      { identifier: 'stale', content: { data: { kind: 'strandcue-reminder', reminderId: 'old', scheduledFor: '2030-01-01T10:00:00.000Z' } } },
      { identifier: 'other-app', content: { data: { kind: 'other' } } },
    ]).mockResolvedValueOnce([
      { identifier: 'keep', content: { data: { kind: 'strandcue-reminder', reminderId: 'same', scheduledFor: '2030-01-01T10:00:00.000Z' } } },
      { identifier: 'other-app', content: { data: { kind: 'other' } } },
    ]);
    const adapter = createReminderNotifications(api, 'ios');
    const desired = [{ id: 'same', scheduledFor: new Date('2030-01-01T10:00:00.000Z') }];

    await adapter.reconcile(desired);
    await adapter.reconcile(desired);

    expect(api.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(api.cancelScheduledNotificationAsync).toHaveBeenCalledWith('stale');
    expect(api.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
