import type { ReminderSchedule } from './reminder-notifications';

export interface ReminderNotificationOperations {
  reconcile(schedules: readonly ReminderSchedule[]): Promise<void>;
  cancelAll(): Promise<void>;
}

export function createReminderNotificationCoordinator(operations: ReminderNotificationOperations) {
  let activeOwner: string | null = null;
  let requestedOwner: string | null = null;
  let lifecycleEpoch = 0;
  let queue: Promise<void> = Promise.resolve();

  const serialize = (operation: () => Promise<void>): Promise<void> => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  };

  return {
    async activate(ownerKey: string): Promise<void> {
      if (activeOwner === ownerKey && requestedOwner === ownerKey) return;
      const request = ++lifecycleEpoch;
      requestedOwner = ownerKey;
      activeOwner = null;
      await serialize(() => operations.cancelAll());
      if (request === lifecycleEpoch) activeOwner = ownerKey;
    },

    async reconcile(ownerKey: string, schedules: readonly ReminderSchedule[], isCurrent: () => boolean = () => true): Promise<void> {
      await serialize(async () => {
        if (activeOwner !== ownerKey || !isCurrent()) return;
        await operations.reconcile(schedules);
      });
    },

    async deactivate(ownerKey: string): Promise<void> {
      if (activeOwner !== ownerKey && requestedOwner !== ownerKey && (activeOwner !== null || requestedOwner !== null)) return;
      lifecycleEpoch += 1;
      if (activeOwner === ownerKey) activeOwner = null;
      if (requestedOwner === ownerKey) requestedOwner = null;
      await serialize(() => operations.cancelAll());
    },
  };
}
