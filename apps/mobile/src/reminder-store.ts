import { z } from 'zod';

import { localDateTime } from '../../../packages/domain/src/calendar.ts';

export const ReminderCategorySchema = z.enum([
  'planned_routine',
  'delayed_cue_check',
  'product_review',
]);

const ownerKeySchema = z.string().min(1).max(200);
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ReminderPlanSchema = z.object({
  id: z.string().min(1).max(100),
  ownerKey: ownerKeySchema,
  category: ReminderCategorySchema,
  localDate: localDateSchema,
  localTime: clockTimeSchema,
  dismissed: z.boolean(),
}).strict().superRefine((plan, context) => {
  if (localDateTime(plan.localDate, plan.localTime) === null) {
    context.addIssue({ code: 'custom', path: ['localDate'], message: 'Reminder date and time must exist in the local timezone' });
  }
});

const QuietHoursSchema = z.object({
  start: clockTimeSchema,
  end: clockTimeSchema,
}).strict();

export const ReminderPreferencesSchema = z.object({
  ownerKey: ownerKeySchema,
  enabled: z.record(ReminderCategorySchema, z.boolean()),
  quietHours: QuietHoursSchema.nullable(),
}).strict();

export const ReminderStateSchema = z.object({
  version: z.literal(1),
  ownerKey: ownerKeySchema,
  preferences: ReminderPreferencesSchema,
  plans: z.array(ReminderPlanSchema).max(500),
}).strict().superRefine((state, context) => {
  if (state.preferences.ownerKey !== state.ownerKey) {
    context.addIssue({ code: 'custom', path: ['preferences', 'ownerKey'], message: 'Reminder preference owner must match its state owner' });
  }
  for (const [index, plan] of state.plans.entries()) {
    if (plan.ownerKey !== state.ownerKey) {
      context.addIssue({ code: 'custom', path: ['plans', index, 'ownerKey'], message: 'Reminder plan owner must match its state owner' });
    }
  }
});

export type ReminderCategory = z.output<typeof ReminderCategorySchema>;
export type ReminderPlan = z.output<typeof ReminderPlanSchema>;
export type ReminderPreferences = z.output<typeof ReminderPreferencesSchema>;
export type ReminderState = z.output<typeof ReminderStateSchema>;

export interface ReminderKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const ownerRevisions = new Map<string, number>();
const ownerQueues = new Map<string, Promise<void>>();

function revisionFor(ownerKey: string): number {
  return ownerRevisions.get(ownerKey) ?? 0;
}

function advanceRevision(ownerKey: string): number {
  const next = revisionFor(ownerKey) + 1;
  ownerRevisions.set(ownerKey, next);
  return next;
}

function serializeOwnerMutation<T>(ownerKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = ownerQueues.get(ownerKey) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  ownerQueues.set(ownerKey, result.then(() => undefined, () => undefined));
  return result;
}

export function emptyReminderState(ownerKey: string): ReminderState {
  return ReminderStateSchema.parse({
    version: 1,
    ownerKey,
    preferences: {
      ownerKey,
      enabled: {
        planned_routine: false,
        delayed_cue_check: false,
        product_review: false,
      },
      quietHours: null,
    },
    plans: [],
  });
}

export function createReminderStore(storage: ReminderKeyValueStorage) {
  // SecureStore keys accept only alphanumerics, '.', '-' and '_'.
  const keyFor = (ownerKey: string) => `strandcue-reminders-v1-${ownerKey}`;

  async function read(ownerKey: string): Promise<ReminderState> {
    const stored = await storage.getItem(keyFor(ownerKey));
    if (stored === null) return emptyReminderState(ownerKey);

    try {
      const parsed = ReminderStateSchema.parse(JSON.parse(stored) as unknown);
      if (parsed.ownerKey !== ownerKey) throw new Error('owner-mismatch');
      return parsed;
    } catch {
      throw new Error('Reminder settings could not be read.');
    }
  }

  async function saveVersioned(ownerKey: string, input: unknown): Promise<{ state: ReminderState; revision: number }> {
    let parsed: ReminderState;
    try {
      parsed = ReminderStateSchema.parse(input);
    } catch {
      throw new Error('Reminder settings are invalid.');
    }
    if (parsed.ownerKey !== ownerKey) throw new Error('Reminder settings are invalid.');
    const revision = advanceRevision(ownerKey);
    await serializeOwnerMutation(ownerKey, () => storage.setItem(keyFor(ownerKey), JSON.stringify(parsed)));
    return { state: parsed, revision };
  }

  async function loadVersioned(ownerKey: string): Promise<{ state: ReminderState; revision: number }> {
    const revision = revisionFor(ownerKey);
    const state = await serializeOwnerMutation(ownerKey, () => read(ownerKey));
    return { state, revision };
  }

  return {
    async load(ownerKey: string): Promise<ReminderState> {
      return (await loadVersioned(ownerKey)).state;
    },

    loadVersioned,

    isCurrent(ownerKey: string, revision: number): boolean {
      return revisionFor(ownerKey) === revision;
    },

    async save(ownerKey: string, input: unknown): Promise<ReminderState> {
      return (await saveVersioned(ownerKey, input)).state;
    },

    saveVersioned,

    async clear(ownerKey: string): Promise<void> {
      advanceRevision(ownerKey);
      await serializeOwnerMutation(ownerKey, () => storage.removeItem(keyFor(ownerKey)));
    },
  };
}
