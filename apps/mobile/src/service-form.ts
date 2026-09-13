import { z } from 'zod';

import {
  CorrectServiceCommandSchema,
  CreateServiceCommandSchema,
  ObserveServiceCommandSchema,
  ServiceFactsSchema,
  type EffectiveDate,
  ServiceZoneSchema,
  type CorrectServiceCommand,
  type CreateServiceCommand,
  type ServiceZone,
} from '../../../packages/domain/src/index';

const zoneKey = (zone: ServiceZone): string => `${zone.region}:${zone.segment}`;

const ZoneCollectionSchema = z.array(ServiceZoneSchema).max(36)
  .superRefine((zones, context) => {
    const keys = zones.map(zoneKey);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', message: 'Service zone is already added' });
    }
  });

const ZonesSchema = ZoneCollectionSchema.min(1)
  .transform(zones => [...zones].sort((left, right) => zoneKey(left).localeCompare(zoneKey(right))));

const EditableZonesSchema = ZoneCollectionSchema
  .transform(zones => [...zones].sort((left, right) => zoneKey(left).localeCompare(zoneKey(right))));

function parseZones(zones: readonly ServiceZone[]): ServiceZone[] {
  return ZonesSchema.parse(zones);
}

export type ServiceEditorMode = 'add' | 'correction' | 'observation';
export function serviceEditorCopy(mode: ServiceEditorMode) {
  return {
    add: { title: 'Add a service', submit: 'Save service' },
    correction: { title: 'Correct this service entry', submit: 'Save correction' },
    observation: { title: 'Record whether the effect is still present', submit: 'Save observation' },
  }[mode];
}

export function serviceView(loading: boolean, items: readonly unknown[], detail: unknown) {
  return detail ? 'detail' : items.length ? 'list' : loading ? 'loading' : 'empty';
}

export function appendServicePage<T extends { serviceId: string }>(previous: readonly T[], page: readonly T[]): T[] {
  return [...previous, ...page.filter(item => !previous.some(existing => existing.serviceId === item.serviceId))];
}

export function serviceDateLabel(date: EffectiveDate): string {
  if (date.precision === 'unknown') return 'Date unknown';
  if (date.precision === 'year') return `Approximately ${date.value}`;
  const parsed = new Date(`${date.value}${date.precision === 'month' ? '-01' : ''}T12:00:00Z`);
  const formatted = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'UTC', year: 'numeric', month: 'long', ...(date.precision === 'day' ? { day: 'numeric' } : {}),
  }).format(parsed);
  return date.precision === 'month' ? `Approximately ${formatted}` : formatted;
}

export function servicePresenceLabel(status: 'present' | 'not-present' | 'unknown'): string {
  return { present: 'Effect reported present', 'not-present': 'Effect reported not present', unknown: 'Effect presence unknown' }[status];
}

export function retainCorrectionFacts(command: CorrectServiceCommand) {
  return ServiceFactsSchema.parse(command.facts);
}

export const ServiceDraftSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('add'), command: CreateServiceCommandSchema }).strict(),
  z.object({ mode: z.literal('correction'), command: CorrectServiceCommandSchema }).strict(),
  z.object({ mode: z.literal('observation'), command: ObserveServiceCommandSchema }).strict(),
]);
export type ServiceDraft = z.output<typeof ServiceDraftSchema>;
export async function loadServiceScreenData<T>(loadPage: () => Promise<T>, loadDrafts: () => Promise<ServiceDraft[]>) {
  const [page, drafts] = await Promise.allSettled([loadPage(), loadDrafts()]);
  return {
    page: page.status === 'fulfilled' ? page.value : null,
    drafts: drafts.status === 'fulfilled' ? drafts.value : null,
    error: drafts.status === 'rejected' ? 'Device drafts could not be loaded. Please retry before starting a new save.'
      : page.status === 'rejected' ? 'Services could not be loaded. Your device drafts are still available.' : '',
  };
}
export type ServiceDraftStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};
const uuid = z.string().uuid();
export const serviceDraftKey = (owner: string, serviceId: string) => `strandcue-service-draft-${uuid.parse(owner)}-${uuid.parse(serviceId)}`;
export const serviceDraftIndexKey = (owner: string) => `strandcue-service-drafts-${uuid.parse(owner)}`;
export const serviceDraftOwnerKey = 'strandcue-service-draft-owner';

// Serialize index edits per storage backend and owner, including logout cleanup.
const storageQueues = new WeakMap<ServiceDraftStorage, Map<string, Promise<unknown>>>();
function withDraftLock<T>(storage: ServiceDraftStorage, owner: string, action: () => Promise<T>): Promise<T> {
  const queues = storageQueues.get(storage) ?? new Map<string, Promise<unknown>>();
  storageQueues.set(storage, queues);
  const next = (queues.get(owner) ?? Promise.resolve()).catch(() => undefined).then(action);
  queues.set(owner, next);
  void next.finally(() => { if (queues.get(owner) === next) queues.delete(owner); }).catch(() => undefined);
  return next;
}

async function transitionServiceDraftOwnerUnlocked(storage: ServiceDraftStorage, nextOwner: string | null): Promise<void> {
  const validatedNextOwner = nextOwner === null ? null : uuid.parse(nextOwner);
  const storedOwner = await storage.getItem(serviceDraftOwnerKey);
  const parsedOwner = uuid.safeParse(storedOwner);
  const previousOwner = parsedOwner.success ? parsedOwner.data : null;
  if (storedOwner && !parsedOwner.success) await storage.removeItem(serviceDraftOwnerKey);
  if (previousOwner && previousOwner !== validatedNextOwner) await clearServiceDrafts(storage, previousOwner);
  if (validatedNextOwner === previousOwner) return;
  if (validatedNextOwner) await storage.setItem(serviceDraftOwnerKey, validatedNextOwner);
  else await storage.removeItem(serviceDraftOwnerKey);
}

export function transitionServiceDraftOwner(
  storage: ServiceDraftStorage,
  nextOwner: string | null,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  return withDraftLock(storage, serviceDraftOwnerKey, async () => {
    if (!isCurrent()) return;
    await transitionServiceDraftOwnerUnlocked(storage, nextOwner);
  });
}

async function draftIndex(storage: ServiceDraftStorage, owner: string): Promise<string[]> {
  const raw = await storage.getItem(serviceDraftIndexKey(owner));
  const keys = z.array(z.string()).max(20).parse(raw ? JSON.parse(raw) : []);
  const prefix = `strandcue-service-draft-${owner}-`;
  if (keys.some(key => !key.startsWith(prefix) || !uuid.safeParse(key.slice(prefix.length)).success)) throw new Error('Invalid draft index');
  return [...new Set(keys)];
}

export async function saveServiceDraft(storage: ServiceDraftStorage, owner: string, value: unknown): Promise<void> {
  const draft = ServiceDraftSchema.parse(value);
  await withDraftLock(storage, serviceDraftOwnerKey, async () => {
    await transitionServiceDraftOwnerUnlocked(storage, owner);
    await withDraftLock(storage, owner, async () => {
      const key = serviceDraftKey(owner, draft.command.serviceId);
      const keys = await draftIndex(storage, owner);
      const next = keys.includes(key) ? [...keys] : [...keys, key];
      if (next.length > 20) throw new Error('Draft limit reached');
      const existing = await storage.getItem(key);
      if (existing && JSON.stringify(ServiceDraftSchema.parse(JSON.parse(existing))) !== JSON.stringify(draft)) throw new Error('A pending save already exists');
      // Index first: an interrupted draft write is still discoverable at logout.
      await storage.setItem(serviceDraftIndexKey(owner), JSON.stringify(next));
      await storage.setItem(key, JSON.stringify(draft));
    });
  });
}

export async function readServiceDrafts(storage: ServiceDraftStorage, owner: string): Promise<ServiceDraft[]> {
  const keys = await draftIndex(storage, owner);
  const results = await Promise.all(keys.map(async key => {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    const draft = ServiceDraftSchema.parse(JSON.parse(raw));
    if (serviceDraftKey(owner, draft.command.serviceId) !== key) throw new Error('Draft does not match service');
    return draft;
  }));
  return results.filter((draft): draft is ServiceDraft => draft !== null);
}

export async function removeServiceDraft(storage: ServiceDraftStorage, owner: string, serviceId: string): Promise<void> {
  await withDraftLock(storage, owner, async () => {
    const key = serviceDraftKey(owner, serviceId);
    const keys = await draftIndex(storage, owner);
    await storage.removeItem(key);
    const remaining = keys.filter(item => item !== key);
    if (remaining.length) await storage.setItem(serviceDraftIndexKey(owner), JSON.stringify(remaining));
    else await storage.removeItem(serviceDraftIndexKey(owner));
  });
}

export async function clearServiceDrafts(storage: ServiceDraftStorage, owner: string): Promise<void> {
  await withDraftLock(storage, owner, async () => {
    const keys = await draftIndex(storage, owner);
    for (const key of keys) await storage.removeItem(key);
    await storage.removeItem(serviceDraftIndexKey(owner));
  });
}

export async function submitServiceDraft(
  storage: ServiceDraftStorage, owner: string, value: unknown,
  dispatch: (draft: ServiceDraft) => Promise<unknown>, isActive: () => boolean,
): Promise<void> {
  const draft = ServiceDraftSchema.parse(value);
  if (!isActive()) throw new Error('Editor is no longer active');
  await saveServiceDraft(storage, owner, draft);
  if (!isActive()) throw new Error('Editor is no longer active');
  await dispatch(draft);
  await removeServiceDraft(storage, owner, draft.command.serviceId);
}

function requireZone(zones: readonly ServiceZone[], zone: ServiceZone): ServiceZone[] {
  const parsedZones = parseZones(zones);
  if (!parsedZones.some(item => zoneKey(item) === zoneKey(zone))) {
    throw new Error('Service zone is not added');
  }
  return parsedZones;
}

export function addZone(zones: readonly ServiceZone[], zone: ServiceZone): readonly ServiceZone[] {
  const parsedZone = ServiceZoneSchema.parse(zone);
  const parsedZones = EditableZonesSchema.parse(zones);
  if (parsedZones.some(item => zoneKey(item) === zoneKey(parsedZone))) {
    throw new Error('Service zone is already added');
  }
  return ZonesSchema.parse([...parsedZones, parsedZone]);
}

export function removeZone(zones: readonly ServiceZone[], zone: ServiceZone): readonly ServiceZone[] {
  const parsedZone = ServiceZoneSchema.parse(zone);
  const parsedZones = requireZone(zones, parsedZone);
  return ZonesSchema.parse(parsedZones.filter(item => zoneKey(item) !== zoneKey(parsedZone)));
}

export function replaceZone(
  zones: readonly ServiceZone[],
  currentZone: ServiceZone,
  replacementZone: ServiceZone,
): readonly ServiceZone[] {
  const parsedCurrentZone = ServiceZoneSchema.parse(currentZone);
  const parsedReplacementZone = ServiceZoneSchema.parse(replacementZone);
  const parsedZones = requireZone(zones, parsedCurrentZone);
  if (zoneKey(parsedCurrentZone) === zoneKey(parsedReplacementZone)) return parsedZones;
  if (parsedZones.some(item => zoneKey(item) === zoneKey(parsedReplacementZone))) {
    throw new Error('Service zone is already added');
  }
  return ZonesSchema.parse(parsedZones.map(item =>
    zoneKey(item) === zoneKey(parsedCurrentZone) ? parsedReplacementZone : item,
  ));
}

export function buildCreateServiceCommand(
  operationId: string,
  serviceId: string,
  facts: unknown,
  initialObservation?: unknown,
): CreateServiceCommand {
  return CreateServiceCommandSchema.parse({ operationId, serviceId, facts, initialObservation });
}

export function buildCorrectionCommand(
  operationId: string,
  serviceId: string,
  expectedRevision: number,
  correctsId: string,
  reason: string,
  facts: unknown,
): CorrectServiceCommand {
  return CorrectServiceCommandSchema.parse({
    operationId,
    serviceId,
    expectedRevision,
    correctsId,
    reason,
    facts,
  });
}
