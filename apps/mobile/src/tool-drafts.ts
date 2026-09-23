import { z } from 'zod';

import {
  ArchiveUserToolCommandSchema,
  CreateUserToolCommandSchema,
  MatchUserToolCommandSchema,
} from '../../../packages/domain/src/index';

export const ToolDraftSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('add'), command: CreateUserToolCommandSchema }).strict(),
  z.object({ mode: z.literal('match'), command: MatchUserToolCommandSchema }).strict(),
  z.object({ mode: z.literal('archive'), command: ArchiveUserToolCommandSchema }).strict(),
]);
export type ToolDraft = z.output<typeof ToolDraftSchema>;

export type ToolDraftStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

const uuid = z.string().uuid();
export const toolDraftKey = (owner: string, userToolId: string) => `strandcue-tool-draft-${uuid.parse(owner)}-${uuid.parse(userToolId)}`;
export const toolDraftIndexKey = (owner: string) => `strandcue-tool-drafts-${uuid.parse(owner)}`;

async function draftIndex(storage: ToolDraftStorage, owner: string): Promise<string[]> {
  const raw = await storage.getItem(toolDraftIndexKey(owner));
  const keys = z.array(z.string()).max(20).parse(raw ? JSON.parse(raw) : []);
  const prefix = `strandcue-tool-draft-${owner}-`;
  if (keys.some(key => !key.startsWith(prefix) || !uuid.safeParse(key.slice(prefix.length)).success)) throw new Error('Invalid draft index');
  return [...new Set(keys)];
}

export async function saveToolDraft(storage: ToolDraftStorage, owner: string, value: unknown): Promise<void> {
  const draft = ToolDraftSchema.parse(value);
  uuid.parse(owner);
  const key = toolDraftKey(owner, draft.command.userToolId);
  const keys = await draftIndex(storage, owner);
  const next = keys.includes(key) ? [...keys] : [...keys, key];
  if (next.length > 20) throw new Error('Draft limit reached');
  // Index first: an interrupted draft write is still discoverable at logout.
  await storage.setItem(toolDraftIndexKey(owner), JSON.stringify(next));
  await storage.setItem(key, JSON.stringify(draft));
}

export async function readToolDrafts(storage: ToolDraftStorage, owner: string): Promise<ToolDraft[]> {
  const keys = await draftIndex(storage, owner);
  const results = await Promise.all(keys.map(async key => {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    const draft = ToolDraftSchema.parse(JSON.parse(raw));
    if (toolDraftKey(owner, draft.command.userToolId) !== key) throw new Error('Draft does not match tool');
    return draft;
  }));
  return results.filter((draft): draft is ToolDraft => draft !== null);
}

export async function removeToolDraft(storage: ToolDraftStorage, owner: string, userToolId: string): Promise<void> {
  const key = toolDraftKey(owner, userToolId);
  const keys = await draftIndex(storage, owner);
  await storage.removeItem(key);
  const remaining = keys.filter(item => item !== key);
  if (remaining.length) await storage.setItem(toolDraftIndexKey(owner), JSON.stringify(remaining));
  else await storage.removeItem(toolDraftIndexKey(owner));
}

export async function clearToolDrafts(storage: ToolDraftStorage, owner: string): Promise<void> {
  const keys = await draftIndex(storage, owner);
  for (const key of keys) await storage.removeItem(key);
  await storage.removeItem(toolDraftIndexKey(owner));
}

export async function submitToolDraft(
  storage: ToolDraftStorage, owner: string, value: unknown,
  dispatch: (draft: ToolDraft) => Promise<unknown>, isActive: () => boolean,
): Promise<void> {
  const draft = ToolDraftSchema.parse(value);
  if (!isActive()) throw new Error('Editor is no longer active');
  await saveToolDraft(storage, owner, draft);
  if (!isActive()) throw new Error('Editor is no longer active');
  await dispatch(draft);
  await removeToolDraft(storage, owner, draft.command.userToolId);
}
