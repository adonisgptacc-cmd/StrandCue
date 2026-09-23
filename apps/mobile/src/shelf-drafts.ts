import { z } from 'zod';

import {
  ArchiveUserProductCommandSchema,
  CreateUserProductCommandSchema,
  MatchUserProductCommandSchema,
} from '../../../packages/domain/src/index';

export const ShelfDraftSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('add'), command: CreateUserProductCommandSchema }).strict(),
  z.object({ mode: z.literal('match'), command: MatchUserProductCommandSchema }).strict(),
  z.object({ mode: z.literal('archive'), command: ArchiveUserProductCommandSchema }).strict(),
]);
export type ShelfDraft = z.output<typeof ShelfDraftSchema>;

export type ShelfDraftStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

const uuid = z.string().uuid();
export const shelfDraftKey = (owner: string, userProductId: string) => `strandcue-shelf-draft-${uuid.parse(owner)}-${uuid.parse(userProductId)}`;
export const shelfDraftIndexKey = (owner: string) => `strandcue-shelf-drafts-${uuid.parse(owner)}`;

async function draftIndex(storage: ShelfDraftStorage, owner: string): Promise<string[]> {
  const raw = await storage.getItem(shelfDraftIndexKey(owner));
  const keys = z.array(z.string()).max(20).parse(raw ? JSON.parse(raw) : []);
  const prefix = `strandcue-shelf-draft-${owner}-`;
  if (keys.some(key => !key.startsWith(prefix) || !uuid.safeParse(key.slice(prefix.length)).success)) throw new Error('Invalid draft index');
  return [...new Set(keys)];
}

export async function saveShelfDraft(storage: ShelfDraftStorage, owner: string, value: unknown): Promise<void> {
  const draft = ShelfDraftSchema.parse(value);
  uuid.parse(owner);
  const key = shelfDraftKey(owner, draft.command.userProductId);
  const keys = await draftIndex(storage, owner);
  const next = keys.includes(key) ? [...keys] : [...keys, key];
  if (next.length > 20) throw new Error('Draft limit reached');
  // Index first: an interrupted draft write is still discoverable at logout.
  await storage.setItem(shelfDraftIndexKey(owner), JSON.stringify(next));
  await storage.setItem(key, JSON.stringify(draft));
}

export async function readShelfDrafts(storage: ShelfDraftStorage, owner: string): Promise<ShelfDraft[]> {
  const keys = await draftIndex(storage, owner);
  const results = await Promise.all(keys.map(async key => {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    const draft = ShelfDraftSchema.parse(JSON.parse(raw));
    if (shelfDraftKey(owner, draft.command.userProductId) !== key) throw new Error('Draft does not match product');
    return draft;
  }));
  return results.filter((draft): draft is ShelfDraft => draft !== null);
}

export async function removeShelfDraft(storage: ShelfDraftStorage, owner: string, userProductId: string): Promise<void> {
  const key = shelfDraftKey(owner, userProductId);
  const keys = await draftIndex(storage, owner);
  await storage.removeItem(key);
  const remaining = keys.filter(item => item !== key);
  if (remaining.length) await storage.setItem(shelfDraftIndexKey(owner), JSON.stringify(remaining));
  else await storage.removeItem(shelfDraftIndexKey(owner));
}

export async function clearShelfDrafts(storage: ShelfDraftStorage, owner: string): Promise<void> {
  const keys = await draftIndex(storage, owner);
  for (const key of keys) await storage.removeItem(key);
  await storage.removeItem(shelfDraftIndexKey(owner));
}

export async function submitShelfDraft(
  storage: ShelfDraftStorage, owner: string, value: unknown,
  dispatch: (draft: ShelfDraft) => Promise<unknown>, isActive: () => boolean,
): Promise<void> {
  const draft = ShelfDraftSchema.parse(value);
  if (!isActive()) throw new Error('Editor is no longer active');
  await saveShelfDraft(storage, owner, draft);
  if (!isActive()) throw new Error('Editor is no longer active');
  await dispatch(draft);
  await removeShelfDraft(storage, owner, draft.command.userProductId);
}
