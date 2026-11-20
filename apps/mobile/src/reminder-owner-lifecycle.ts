import { secureStorage } from './client';
import { deactivateReminderOwner } from './reminder-notifications';
import { createReminderStore } from './reminder-store';

const reminderStore = createReminderStore(secureStorage);

export async function clearReminderOwnerState(ownerKey: string): Promise<void> {
  await deactivateReminderOwner(ownerKey);
  await reminderStore.clear(ownerKey);
}
