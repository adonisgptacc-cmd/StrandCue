import { createReminderNotificationCoordinator } from './reminder-notification-coordinator';

export interface ReminderNotificationsGateway {
  setNotificationChannelAsync(channelId: string, options: Record<string, unknown>): Promise<unknown>;
  getPermissionsAsync(): Promise<{ granted: boolean }>;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  getAllScheduledNotificationsAsync(): Promise<{
    identifier: string;
    content: { data?: Record<string, unknown> | null };
  }[]>;
  cancelScheduledNotificationAsync(identifier: string): Promise<unknown>;
  scheduleNotificationAsync(request: Record<string, unknown>): Promise<string>;
}

export interface ReminderSchedule {
  id: string;
  scheduledFor: Date;
}

const channelId = 'strandcue-reminders';
const marker = 'strandcue-reminder';

function scheduleKey(reminderId: string, scheduledFor: string): string {
  return `${reminderId}\u0000${scheduledFor}`;
}

export function createReminderNotifications(
  gateway: ReminderNotificationsGateway,
  platform: 'android' | 'ios' | 'web',
) {
  async function ensureChannel(): Promise<void> {
    if (platform !== 'android') return;
    await gateway.setNotificationChannelAsync(channelId, {
      name: 'Reminders',
      importance: 3,
      sound: null,
      vibrationPattern: [],
    });
  }

  async function permissionGranted(): Promise<boolean> {
    return (await gateway.getPermissionsAsync()).granted;
  }

  return {
    async requestPermissionAfterExplanation(): Promise<boolean> {
      if (platform === 'web') return false;
      await ensureChannel();
      if (await permissionGranted()) return true;
      return (await gateway.requestPermissionsAsync()).granted;
    },

    async reconcile(desired: readonly ReminderSchedule[]): Promise<void> {
      if (platform === 'web') return;
      const pending = await gateway.getAllScheduledNotificationsAsync();
      const desiredByKey = new Map<string, ReminderSchedule>();
      for (const schedule of desired) {
        if (!Number.isNaN(schedule.scheduledFor.getTime()) && schedule.scheduledFor.getTime() > Date.now()) {
          const scheduledFor = schedule.scheduledFor.toISOString();
          desiredByKey.set(scheduleKey(schedule.id, scheduledFor), { ...schedule, scheduledFor: new Date(scheduledFor) });
        }
      }

      const existing = new Map<string, string>();
      for (const notification of pending) {
        const data = notification.content.data;
        if (data?.kind !== marker || typeof data.reminderId !== 'string' || typeof data.scheduledFor !== 'string') continue;
        const key = scheduleKey(data.reminderId, data.scheduledFor);
        if (desiredByKey.has(key) && !existing.has(key)) existing.set(key, notification.identifier);
        else await gateway.cancelScheduledNotificationAsync(notification.identifier);
      }

      if (!(await permissionGranted())) return;
      for (const [key, schedule] of desiredByKey) {
        if (existing.has(key)) continue;
        const scheduledFor = schedule.scheduledFor.toISOString();
        await gateway.scheduleNotificationAsync({
          content: {
            title: 'A StrandCue reminder',
            body: 'Open the app when convenient.',
            sound: false,
            data: { kind: marker, reminderId: schedule.id, scheduledFor },
          },
          trigger: {
            type: 'date',
            date: schedule.scheduledFor,
            ...(platform === 'android' ? { channelId } : {}),
          },
        });
      }
    },

    async cancelAll(): Promise<void> {
      if (platform === 'web') return;
      const pending = await gateway.getAllScheduledNotificationsAsync();
      for (const notification of pending) {
        if (notification.content.data?.kind === marker) {
          await gateway.cancelScheduledNotificationAsync(notification.identifier);
        }
      }
    },
  };
}

export async function requestReminderPermissionAfterExplanation(): Promise<boolean> {
  const platform = await import('react-native').then(module => module.Platform.OS);
  if (platform !== 'android' && platform !== 'ios') return false;
  const Notifications = await import('expo-notifications');
  const gateway = Notifications as unknown as ReminderNotificationsGateway;
  return createReminderNotifications(gateway, platform).requestPermissionAfterExplanation();
}

type ReminderCoordinator = ReturnType<typeof createReminderNotificationCoordinator>;
let reminderCoordinator: Promise<ReminderCoordinator> | null = null;

async function getReminderCoordinator(): Promise<ReminderCoordinator> {
  if (reminderCoordinator === null) {
    reminderCoordinator = (async () => {
      const Notifications = await import('expo-notifications');
      const gateway = Notifications as unknown as ReminderNotificationsGateway;
      const platform = await import('react-native').then(module => module.Platform.OS);
      if (platform !== 'android' && platform !== 'ios' && platform !== 'web') {
        return createReminderNotificationCoordinator({ reconcile: async () => undefined, cancelAll: async () => undefined });
      }
      return createReminderNotificationCoordinator(createReminderNotifications(gateway, platform));
    })();
  }
  return reminderCoordinator;
}

export async function activateReminderOwner(ownerKey: string): Promise<void> {
  await (await getReminderCoordinator()).activate(ownerKey);
}

export async function reconcileDeviceReminders(
  ownerKey: string,
  desired: readonly ReminderSchedule[],
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const coordinator = await getReminderCoordinator();
  const platform = await import('react-native').then(module => module.Platform.OS);
  if (platform !== 'android' && platform !== 'ios' && platform !== 'web') return;
  await coordinator.reconcile(ownerKey, desired, isCurrent);
}

export async function deactivateReminderOwner(ownerKey: string): Promise<void> {
  await (await getReminderCoordinator()).deactivate(ownerKey);
}
