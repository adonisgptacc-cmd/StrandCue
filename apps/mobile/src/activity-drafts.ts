import { z } from 'zod';

import {
  CorrectActivityCommandSchema,
  CreateActivityCommandSchema,
  VoidActivityCommandSchema,
} from '../../../packages/domain/src/index';

export const ActivityDraftSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('add'), command: CreateActivityCommandSchema }).strict(),
  z.object({ mode: z.literal('correction'), command: CorrectActivityCommandSchema }).strict(),
  z.object({ mode: z.literal('void'), command: VoidActivityCommandSchema }).strict(),
]);
export type ActivityDraft = z.output<typeof ActivityDraftSchema>;

export type ActivityDraftStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

const uuid = z.string().uuid();
export const activityDraftKey = (owner: string, activityId: string) => `strandcue-activity-draft-${uuid.parse(owner)}-${uuid.parse(activityId)}`;
export const activityDraftIndexKey = (owner: string) => `strandcue-activity-drafts-${uuid.parse(owner)}`;

function draftActivityId(draft: ActivityDraft): string {
  return draft.command.activityId;
}

async function draftIndex(storage: ActivityDraftStorage, owner: string): Promise<string[]> {
  const raw = await storage.getItem(activityDraftIndexKey(owner));
  const keys = z.array(z.string()).max(20).parse(raw ? JSON.parse(raw) : []);
  const prefix = `strandcue-activity-draft-${owner}-`;
  if (keys.some(key => !key.startsWith(prefix) || !uuid.safeParse(key.slice(prefix.length)).success)) throw new Error('Invalid draft index');
  return [...new Set(keys)];
}

export async function saveActivityDraft(storage: ActivityDraftStorage, owner: string, value: unknown): Promise<void> {
  const draft = ActivityDraftSchema.parse(value);
  uuid.parse(owner);
  const key = activityDraftKey(owner, draftActivityId(draft));
  const keys = await draftIndex(storage, owner);
  const next = keys.includes(key) ? [...keys] : [...keys, key];
  if (next.length > 20) throw new Error('Draft limit reached');
  // Index first: an interrupted draft write is still discoverable at logout.
  await storage.setItem(activityDraftIndexKey(owner), JSON.stringify(next));
  await storage.setItem(key, JSON.stringify(draft));
}

export async function readActivityDrafts(storage: ActivityDraftStorage, owner: string): Promise<ActivityDraft[]> {
  const keys = await draftIndex(storage, owner);
  const results = await Promise.all(keys.map(async key => {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    const draft = ActivityDraftSchema.parse(JSON.parse(raw));
    if (activityDraftKey(owner, draftActivityId(draft)) !== key) throw new Error('Draft does not match activity');
    return draft;
  }));
  return results.filter((draft): draft is ActivityDraft => draft !== null);
}

export async function removeActivityDraft(storage: ActivityDraftStorage, owner: string, activityId: string): Promise<void> {
  const key = activityDraftKey(owner, activityId);
  const keys = await draftIndex(storage, owner);
  await storage.removeItem(key);
  const remaining = keys.filter(item => item !== key);
  if (remaining.length) await storage.setItem(activityDraftIndexKey(owner), JSON.stringify(remaining));
  else await storage.removeItem(activityDraftIndexKey(owner));
}

export async function clearActivityDrafts(storage: ActivityDraftStorage, owner: string): Promise<void> {
  const keys = await draftIndex(storage, owner);
  for (const key of keys) await storage.removeItem(key);
  await storage.removeItem(activityDraftIndexKey(owner));
}

export async function submitActivityDraft(
  storage: ActivityDraftStorage, owner: string, value: unknown,
  dispatch: (draft: ActivityDraft) => Promise<unknown>, isActive: () => boolean,
): Promise<void> {
  const draft = ActivityDraftSchema.parse(value);
  if (!isActive()) throw new Error('Editor is no longer active');
  await saveActivityDraft(storage, owner, draft);
  if (!isActive()) throw new Error('Editor is no longer active');
  await dispatch(draft);
  await removeActivityDraft(storage, owner, draftActivityId(draft));
}

export type PossibleDuplicateCandidate = {
  id: string;
  occurredAt: string;
  kind: string;
};

export type DuplicateCheckCandidate = {
  occurredAt: string;
  kind: string;
};

/**
 * Surfaces independently entered events that may duplicate each other for
 * human review. Never merges — the caller presents matches and the user
 * decides. Matches require the same activity kind within the time window.
 */
export function findPossibleDuplicates(
  existing: readonly PossibleDuplicateCandidate[],
  candidate: DuplicateCheckCandidate,
  windowMs = 60 * 60 * 1000,
): PossibleDuplicateCandidate[] {
  const candidateTime = Date.parse(candidate.occurredAt);
  if (Number.isNaN(candidateTime)) return [];
  return existing.filter(item => {
    if (item.kind !== candidate.kind) return false;
    const itemTime = Date.parse(item.occurredAt);
    if (Number.isNaN(itemTime)) return false;
    return Math.abs(itemTime - candidateTime) <= windowMs;
  });
}
