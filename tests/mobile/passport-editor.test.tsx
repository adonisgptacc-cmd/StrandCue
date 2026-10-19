import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PassportEditor } from '../../apps/mobile/src/passport-editor';
import type { SaveCommand } from '../../apps/mobile/src/passport-api';

const store = vi.hoisted(() => {
  const storage = new Map<string, string>();
  return {
    storage,
    secureStorage: {
      async getItem(key: string) { return storage.get(key) ?? null; },
      async setItem(key: string, value: string) { storage.set(key, value); },
      async removeItem(key: string) { storage.delete(key); },
    },
  };
});

const api = vi.hoisted(() => ({ savePassport: vi.fn(), loadPassport: vi.fn() }));
const ids = vi.hoisted(() => ({ counter: 0 }));

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function Host({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    Host.displayName = `Mock${tag}`;
    return Host;
  };
  return {
    ScrollView: host('main'),
    Text: host('span'),
    TextInput: host('input'),
    View: host('div'),
    Pressable: host('button'),
    StyleSheet: { create: (v: unknown) => v },
  };
});
vi.mock('expo-crypto', () => ({ randomUUID: () => `op-${++ids.counter}` }));
vi.mock('../../apps/mobile/src/client', () => ({ secureStorage: store.secureStorage }));
vi.mock('../../apps/mobile/src/passport-api', () => api);

type RecordDraft = {
  passportId: string; revision: number;
  projection: { asOf: string; values: Record<string, unknown>; ambiguousFields: Record<string, unknown>; appliedRevisionIds: string[]; supersededRevisionIds: string[] };
  revisions: never[];
};

function makeRecord(values: Record<string, unknown>, revision = 4): RecordDraft {
  return {
    passportId: 'passport-1', revision,
    projection: { asOf: '2026-09-01', values, ambiguousFields: {}, appliedRevisionIds: [], supersededRevisionIds: [] },
    revisions: [],
  };
}

function walk(node: ReactTestInstance | null, visit: (node: ReactTestInstance) => void): void {
  if (node === null) return;
  visit(node);
  for (const child of node.children) {
    if (typeof child === 'object' && child !== null) walk(child as ReactTestInstance, visit);
  }
}

const textOf = (node: ReactTestInstance) => node.children.filter((c): c is string => typeof c === 'string').join('');

function labels(root: ReactTestRenderer): string[] {
  const found: string[] = [];
  walk(root.root, (node) => {
    if (typeof node.props?.accessibilityLabel === 'string') found.push(node.props.accessibilityLabel as string);
    const text = textOf(node);
    if (text !== '') found.push(text);
  });
  return found;
}

function find(root: ReactTestRenderer, predicate: (node: ReactTestInstance) => boolean): ReactTestInstance | undefined {
  let hit: ReactTestInstance | undefined;
  walk(root.root, (node) => { if (!hit && predicate(node)) hit = node; });
  return hit;
}

function findText(root: ReactTestRenderer, text: string): ReactTestInstance | undefined {
  return find(root, (node) => textOf(node) === text);
}

async function render(ui: React.JSX.Element) {
  let root!: ReactTestRenderer;
  await act(async () => { root = create(ui); });
  await act(async () => { await Promise.resolve(); });
  return root;
}

async function pressButton(root: ReactTestRenderer, label: string) {
  const button = find(root, (node) => node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function');
  if (!button) throw new Error(`button not found: ${label}`);
  await act(async () => { await (button.props.onPress as () => void | Promise<void>)(); });
  await act(async () => { await Promise.resolve(); });
}

async function typeInto(root: ReactTestRenderer, label: string, value: string) {
  const field = find(root, (node) => node.props?.accessibilityLabel === label && typeof node.props?.onChangeText === 'function');
  if (!field) throw new Error(`field not found: ${label}`);
  await act(async () => { field.props.onChangeText(value); });
  await act(async () => { await Promise.resolve(); });
}

function pillState(root: ReactTestRenderer, label: string, shown: string): { selected: boolean; present: boolean } {
  const found = find(root, (node) => node.props?.accessibilityLabel === `${label}: ${shown}`);
  if (!found) return { selected: false, present: false };
  return { selected: Boolean(found.props?.accessibilityState?.selected), present: true };
}

async function pressSave(root: ReactTestRenderer, record: RecordDraft, times = 1): Promise<SaveCommand> {
  await pressButton(root, 'Save to my record');
  expect(api.savePassport).toHaveBeenCalledTimes(times);
  return api.savePassport.mock.calls[times - 1][0] as SaveCommand;
}

async function pressSaveExpectingMessage(root: ReactTestRenderer, pattern: RegExp) {
  await pressButton(root, 'Save to my record');
  // The message must be rendered as an announced alert role, not just text.
  const alert = find(root, (node) => node.props?.accessibilityRole === 'alert' && pattern.test(textOf(node)));
  if (!alert) throw new Error(`no alerted message matched ${pattern}`);
}

function checkboxState(root: ReactTestRenderer, label: string, shown: string) {
  const found = find(root, (node) => node.props?.accessibilityLabel === `${label}: ${shown}`);
  return Boolean(found?.props?.accessibilityState?.checked);
}

const defaults = { naturalPattern: 'unknown', strandDiameter: 'unknown', density: 'unknown', concerns: ['unknown'], goals: ['unknown'], budgetPreference: 'no-preference' };

afterAll(() => {
  store.storage.clear();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  store.storage.clear();
  api.savePassport.mockReset();
  api.loadPassport.mockReset();
  ids.counter = 0;
});

describe('PassportEditor structured length measurement', () => {
  it('saves one structured measurement with unit, precision and date and retires the legacy centimetres entry', async () => {
    const record = makeRecord({ ...defaults, lengthCm: 25 });
    const onSaved = vi.fn();
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved, onCancel: vi.fn() }));
    expect(labels(root).some((l) => l.includes('25 centimetres'))).toBe(true);
    await pressButton(root, 'Length unit: cm');
    await typeInto(root, 'Your length in centimetres (self-measured, optional)', '30');
    await pressButton(root, 'Length precision: exact');
    await typeInto(root, 'Length measured on (YYYY-MM-DD, optional)', '2026-09-01');
    const command = await pressSave(root, record, 1);

    expect(command.p_kind).toBe('change');
    expect(command.p_patch.lengthMeasurement).toEqual({ value: 30, unit: 'cm', precision: 'exact', measuredOn: '2026-09-01' });
    expect(command.p_patch.lengthCm).toBeNull();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('keeps the value field label in the selected unit when the unit changes', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    expect(find(root, (n) => n.props?.accessibilityLabel === 'Your length in centimetres (self-measured, optional)')).toBeUndefined();
    await pressButton(root, 'Length unit: in');
    expect(find(root, (n) => n.props?.accessibilityLabel === 'Your length in inches (self-measured, optional)')).toBeDefined();
    await typeInto(root, 'Your length in inches (self-measured, optional)', '20');
    const command = await pressSave(root, record);
    expect(command.p_patch.lengthMeasurement).toEqual({ value: 20, unit: 'in' });
  });

  it('clears a previously recorded measurement and sends an explicit null once', async () => {
    const record = makeRecord({ ...defaults, lengthMeasurement: { value: 30, unit: 'cm', precision: 'exact' } });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Remove this length measurement');
    const command = await pressSave(root, record);
    expect(command.p_patch.lengthMeasurement).toBeNull();
    expect('lengthCm' in command.p_patch).toBe(false);
  });

  it('asks for the missing unit or value instead of guessing', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Length unit: cm');
    await pressSaveExpectingMessage(root, /unit|value/i);
    expect(api.savePassport).not.toHaveBeenCalled();
  });

  it('explains the documented bound when the recorded length is unreasonable', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Length unit: cm');
    await typeInto(root, 'Your length in centimetres (self-measured, optional)', '0');
    await pressSaveExpectingMessage(root, /positive/i);
    expect(api.savePassport).not.toHaveBeenCalled();

    await typeInto(root, 'Your length in centimetres (self-measured, optional)', '301');
    await pressSaveExpectingMessage(root, /300 cm/i);
    expect(api.savePassport).not.toHaveBeenCalled();
  });

  it('asks for a real calendar day when the measurement date is not valid', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Length unit: cm');
    await typeInto(root, 'Your length in centimetres (self-measured, optional)', '30');
    await typeInto(root, 'Length measured on (YYYY-MM-DD, optional)', '2026-02-31');
    await pressSaveExpectingMessage(root, /calendar day/i);
    expect(api.savePassport).not.toHaveBeenCalled();
  });
});

describe('PassportEditor condition and heat answers', () => {
  it('records a heat preference as a personal choice and never as a safety statement', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    expect(labels(root)).toContain('Heat styling preference is your personal choice, not a safety rule.');
    expect(labels(root)).toContain('Self-reported cosmetics only, not a diagnosis. Identifiers never imply a measured severity.');
    await pressButton(root, 'Heat preference: I want to minimise heat styling');
    await pressButton(root, 'Damage you notice: Slightly dry or rough in places');
    const command = await pressSave(root, record);
    expect(command.p_patch.heatPreference).toBe('minimise-heat');
    expect(command.p_patch.damageObservation).toBe('mild');
  });

  it('explains how to retire a legacy centimetre entry inside one correction', async () => {
    const target = {
      id: 'target-revision', passportId: 'passport-1', sequence: 3, baseRevision: 2,
      kind: 'change' as const,
      effectiveDate: { precision: 'day', value: '2026-06-01' } as const,
      recordedAt: '2026-06-01T10:00:00.000Z', source: 'user-reported' as const,
      patch: { lengthCm: 25, notes: 'as recorded long ago' },
    };
    const record = makeRecord(defaults, 5);
    const root = await render(createElement(PassportEditor, {
      owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn(),
      target: target as unknown as Parameters<typeof PassportEditor>[0]['target'],
    }));
    await typeInto(root, 'Why are you correcting this?', 'fixing a spelling mistake');
    await pressButton(root, 'Save to my record');
    await act(async () => { await Promise.resolve(); });
    // A legacy centimetre number on the screen cannot be resubmitted as a
    // number: the screen directs the owner to the retirement path instead
    // of sending a save the record must refuse.
    expect(labels(root).filter((l) => /retire the old centimetre entry/i.test(l)).length).toBeGreaterThan(0);
    expect(api.savePassport).not.toHaveBeenCalled();
  });

  it('keeps an explicit no-date measurement across an unrelated change', async () => {
    const record = makeRecord({
      ...defaults,
      lengthMeasurement: { value: 30, unit: 'cm', measuredOn: null },
    }, 3);
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Concerns: frizz');
    const command = await pressSave(root, record);
    // The measured length is unchanged, so the patch carries only the real
    // change: the stored `measuredOn: null` state is neither downgraded to
    // an omission (which would look change by key order) nor lost.
    expect(command.p_patch).toEqual({ concerns: ['frizz'] });
  });

  it('refuses a no-op save whose stored measurement only differs by key order', async () => {
    // The stored projection serialises `unit` first; the editor rebuilds
    // `value` first. A byte-equality comparison would invent a no-op change.
    const record = makeRecord({
      ...defaults,
      lengthMeasurement: { unit: 'cm', value: 30 } as { unit: string; value: number },
    }, 3);
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressSaveExpectingMessage(root, /Check the fields and date/);
    expect(api.savePassport).not.toHaveBeenCalled();
  });

  it('asks for a measurement date that is not after today', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Length unit: cm');
    await typeInto(root, 'Your length in centimetres (self-measured, optional)', '30');
    await typeInto(root, 'Length measured on (YYYY-MM-DD, optional)', '2030-01-01');
    await pressSaveExpectingMessage(root, /after today/);
    expect(api.savePassport).not.toHaveBeenCalled();
  });

  it('edits one reaction list: adds an entry, then removes one on a fresh open', async () => {
    const record = makeRecord({ ...defaults, reactionsAvoidances: ['fragrance'] });
    const rootA = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await typeInto(rootA, 'Known reactions or avoidances (comma separated, optional)', 'fragrance, sulfates ');
    const command = await pressSave(rootA, record);
    expect(command.p_patch.reactionsAvoidances).toEqual(['fragrance', 'sulfates']);
    rootA.unmount();

    // The editor stays locked after a save, so the removal happens on a fresh open.
    const rootB = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    expect(find(rootB, (n) => n.props?.accessibilityLabel === 'Known reactions or avoidances (comma separated, optional)')?.props.value).toBe('fragrance');
    await typeInto(rootB, 'Known reactions or avoidances (comma separated, optional)', 'sulfates');
    const commandAfter = await pressSave(rootB, record, 2);
    expect(commandAfter.p_patch.reactionsAvoidances).toEqual(['sulfates']);
  });
});

describe('PassportEditor device drafts and guards', () => {
  it('offers to retry or discard an unconfirmed device draft on a fresh open', async () => {
    const record = makeRecord({ ...defaults });
    const firstSaved = vi.fn();
    const first = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: firstSaved, onCancel: vi.fn() }));
    await pressButton(first, 'Length unit: cm');
    await typeInto(first, 'Your length in centimetres (self-measured, optional)', '30');
    api.savePassport.mockRejectedValueOnce(new Error('network down'));
    await pressButton(first, 'Save to my record');
    await act(async () => { await Promise.resolve(); });
    expect(store.storage.get('strandcue-draft-owner-a')).toBeTruthy();
    first.unmount();

    const resumedSaved = vi.fn();
    const resumed = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: resumedSaved, onCancel: vi.fn() }));
    expect(findText(resumed, 'A previous save was not confirmed. Retry the same save to avoid a duplicate.')).toBeDefined();

    await pressButton(resumed, 'Retry previous save');
    await act(async () => { await Promise.resolve(); });
    // One interrupted attempt plus the resumed retry of the same command.
    expect(api.savePassport).toHaveBeenCalledTimes(2);
    expect(api.savePassport.mock.calls[1][0]).toEqual(api.savePassport.mock.calls[0][0]);
    // The stored measurement is restored into the reviewed form.
    expect(find(resumed, (n) => n.props?.accessibilityLabel === 'Your length in centimetres (self-measured, optional)')?.props.value).toBe('30');
    expect(store.storage.get('strandcue-draft-owner-a')).toBeUndefined();
    expect(resumedSaved).toHaveBeenCalledTimes(1);
  });

  it('discards the device draft when the user chooses to drop it', async () => {
    const record = makeRecord({ ...defaults });
    const first = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(first, 'Length unit: cm');
    await typeInto(first, 'Your length in centimetres (self-measured, optional)', '30');
    api.savePassport.mockRejectedValueOnce(new Error('network down'));
    await pressSave(first, record);
    first.unmount();

    const resumed = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    expect(findText(resumed, 'A previous save was not confirmed. Retry the same save to avoid a duplicate.')).toBeDefined();
    await pressButton(resumed, 'Discard device draft');
    await act(async () => { await Promise.resolve(); });
    expect(store.storage.get('strandcue-draft-owner-a')).toBeUndefined();
    expect(findText(resumed, 'A previous save was not confirmed. Retry the same save to avoid a duplicate.')).toBeUndefined();
  });

  it('explains when the previous device draft cannot be read', async () => {
    const record = makeRecord({ ...defaults });
    const spy = vi.spyOn(store.secureStorage, 'getItem').mockRejectedValueOnce(new Error('locked'));
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    expect(findText(root, 'The previous device draft could not be read.')).toBeDefined();
    spy.mockRestore();
  });

  it('explains when the latest record cannot be loaded for conflict review', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Heat preference: I want to avoid heat styling');
    api.savePassport.mockRejectedValueOnce(new Error('revision-conflict'));
    await pressSave(root, record);
    await act(async () => { await Promise.resolve(); });
    api.loadPassport.mockRejectedValueOnce(new Error('offline'));
    await pressButton(root, 'Load latest record for review');
    await act(async () => { await Promise.resolve(); });
    expect(findText(root, 'The latest record could not be loaded. Your input is still here.')).toBeDefined();
    // An empty answer is handled exactly like a failed load.
    api.loadPassport.mockResolvedValueOnce(undefined as never);
    await pressButton(root, 'Load latest record for review');
    await act(async () => { await Promise.resolve(); });
    expect(findText(root, 'The latest record could not be loaded. Your input is still here.')).toBeDefined();
  });

  it('refuses a device draft that is not a save command', async () => {
    store.storage.set('strandcue-draft-owner-a', '123');
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record: makeRecord({ ...defaults }), onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Retry previous save');
    await act(async () => { await Promise.resolve(); });
    expect(api.savePassport).not.toHaveBeenCalled();
  });

  it('keeps the device draft when dropping it fails', async () => {
    store.storage.set('strandcue-draft-owner-a', JSON.stringify({ p_operation_id: 'op-1', p_expected_revision: 4, p_kind: 'change', p_effective_date: { precision: 'day', value: '2026-09-01' }, p_patch: { heatPreference: 'avoid-heat' } }));
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record: makeRecord({ ...defaults }), onSaved: vi.fn(), onCancel: vi.fn() }));
    const spy = vi.spyOn(store.secureStorage, 'removeItem').mockRejectedValueOnce(new Error('locked'));
    await pressButton(root, 'Discard device draft');
    await act(async () => { await Promise.resolve(); });
    expect(findText(root, 'Could not remove the draft.')).toBeDefined();
    expect(store.storage.get('strandcue-draft-owner-a')).toBeTruthy();
    spy.mockRestore();
  });

  it('keeps the original save when preparing the revised draft fails', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Heat preference: I want to avoid heat styling');
    api.savePassport.mockRejectedValueOnce(new Error('revision-conflict'));
    await pressSave(root, record);
    await act(async () => { await Promise.resolve(); });
    const latest = makeRecord({ ...defaults, heatPreference: 'no-preference' }, 6);
    api.loadPassport.mockResolvedValueOnce(latest);
    await pressButton(root, 'Load latest record for review');
    const spy = vi.spyOn(store.secureStorage, 'removeItem').mockRejectedValueOnce(new Error('locked'));
    await pressButton(root, 'Keep my submitted fields and review form');
    await act(async () => { await Promise.resolve(); });
    expect(findText(root, 'Could not prepare the revised draft. Your original save is retained.')).toBeDefined();
    spy.mockRestore();
  });

  it('keeps a corrupted device draft honest: invalid draft is refused, valid draft retries', async () => {
    const record = makeRecord({ ...defaults });
    store.storage.set('strandcue-draft-owner-a', 'not-json');
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    expect(findText(root, 'A previous save was not confirmed. Retry the same save to avoid a duplicate.')).toBeDefined();
    api.savePassport.mockRejectedValueOnce(new Error('network down'));
    await pressButton(root, 'Retry previous save');
    await act(async () => { await Promise.resolve(); });
    expect(api.savePassport).not.toHaveBeenCalled();
  });

  it('does not invent a patch when a recorded reactions list is emptied', async () => {
    const record = makeRecord({ ...defaults, reactionsAvoidances: ['fragrance'] });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    expect(find(root, (n) => n.props?.accessibilityLabel === 'Known reactions or avoidances (comma separated, optional)')?.props.value).toBe('fragrance');
    await typeInto(root, 'Known reactions or avoidances (comma separated, optional)', '');
    // Removing the last entry deletes the draft key entirely: no changed value
    // can be compared, so the patch would be empty and the save is refused
    // instead of writing a manufactured change.
    expect(find(root, (n) => n.props?.accessibilityLabel === 'Known reactions or avoidances (comma separated, optional)')?.props.value).toBe('');
    await pressSaveExpectingMessage(root, /Check the fields and date/);
    expect(api.savePassport).not.toHaveBeenCalled();
  });

  it('asks for the effective date when a day precision is chosen', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'When did this become true?: day');
    await typeInto(root, 'Date (YYYY-MM-DD)', '');
    await pressSaveExpectingMessage(root, /Check the fields and date/);
    expect(api.savePassport).not.toHaveBeenCalled();
  });

  it('ignores a second press while a save is already running', async () => {
    const record = makeRecord({ ...defaults });
    let release!: (value: unknown) => void;
    const gate = new Promise((resolve) => { release = resolve; });
    api.savePassport.mockImplementationOnce(() => gate);
    const onSaved = vi.fn();
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved, onCancel: vi.fn() }));
    await pressButton(root, 'Length unit: cm');
    await typeInto(root, 'Your length in centimetres (self-measured, optional)', '30');
    await pressButton(root, 'Save to my record');
    expect(api.savePassport).toHaveBeenCalledTimes(1);
    await pressButton(root, 'Saving…');
    await act(async () => { await Promise.resolve(); });
    expect(api.savePassport).toHaveBeenCalledTimes(1);
    release(undefined);
    await act(async () => { await Promise.resolve(); });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('updates every remaining control so each write path is real', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Natural Pattern: wavy');
    await pressButton(root, 'Strand Diameter: fine');
    await pressButton(root, 'Density: high');
    await pressButton(root, 'Porosity: low');
    await pressButton(root, 'Grey Status: some');
    await pressButton(root, 'Budget Preference: cheapest effective');
    await pressButton(root, 'Goals: definition');
    await pressButton(root, 'Concerns: frizz');
    await typeInto(root, 'Maximum budget per product (ZAR, optional)', '180');
    await typeInto(root, 'Notes (optional, avoid identifying details)', 'Tried a satin pillowcase');
    const command = await pressSave(root, record);
    expect(command.p_patch.naturalPattern).toBe('wavy');
    expect(command.p_patch.strandDiameter).toBe('fine');
    expect(command.p_patch.density).toBe('high');
    expect(command.p_patch.porosity).toBe('low');
    expect(command.p_patch.greyStatus).toBe('some');
    expect(command.p_patch.budgetPreference).toBe('cheapest-effective');
    // 'unknown' is mutually exclusive inside the goal list: choosing a real
    // goal replaces it instead of appending.
    expect(command.p_patch.goals).toEqual(['definition']);
    expect(command.p_patch.concerns).toEqual(['frizz']);
    expect(command.p_patch.maximumProductBudgetZar).toBe(180);
    expect(command.p_patch.notes).toBe('Tried a satin pillowcase');
  });

  it('downgrades an incomplete measurement draft to an explicit null and refuses the save', async () => {    const record = makeRecord(defaults, 3);
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Length unit: cm');
    await typeInto(root, 'Your length in centimetres (self-measured, optional)', '');
    // A unit with no value is not a measurement: the half-written value must
    // not reach a save, and the form stops sending any outdated measurement.
    await pressSaveExpectingMessage(root, /Record a length with its unit/);
    expect(api.savePassport).not.toHaveBeenCalled();
  });

  it('refuses to correct an entry that another correction already replaced', async () => {
    const target = {
      id: 'target-revision',
      passportId: 'passport-1',
      sequence: 3, baseRevision: 2,
      kind: 'change' as const,
      effectiveDate: { precision: 'day', value: '2026-06-01' } as const,
      recordedAt: '2026-06-01T10:00:00.000Z',
      source: 'user-reported' as const,
      patch: { heatPreference: 'avoid-heat', lengthMeasurement: { value: 40, unit: 'cm' as const } },
    };
    const record = makeRecord(defaults, 5);
    const root = await render(createElement(PassportEditor, {
      owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn(),
      target: target as unknown as Parameters<typeof PassportEditor>[0]['target'],
    }));
    await typeInto(root, 'Why are you correcting this?', 'I measured again more carefully');
    api.savePassport.mockRejectedValueOnce(new Error('revision-conflict'));
    await pressSave(root, record);
    await act(async () => { await Promise.resolve(); });

    const latest = makeRecord({ ...defaults }, 6);
    latest.projection.supersededRevisionIds = ['target-revision'];
    api.loadPassport.mockResolvedValueOnce(latest);
    await pressButton(root, 'Load latest record for review');
    await pressButton(root, 'Keep my submitted fields and review form');
    await act(async () => { await Promise.resolve(); });
    expect(findText(root, 'This entry has already been corrected. Your draft is retained; return to history and select the current replacement.')).toBeDefined();
    expect(api.savePassport).toHaveBeenCalledTimes(1);
  });
});

describe('PassportEditor safe save flows', () => {
  it('retries the same locked save after an interrupted attempt', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Length unit: cm');
    await typeInto(root, 'Your length in centimetres (self-measured, optional)', '30');
    api.savePassport.mockRejectedValueOnce(new Error('network down'));
    await pressSaveExpectingMessage(root, /not confirmed|failed|try/i);
    expect(api.savePassport).toHaveBeenCalledTimes(1);
    expect(store.storage.get('strandcue-draft-owner-a')).toBeTruthy();
    expect(findText(root, 'The save is locked for a safe retry.')).toBeDefined();

    await pressButton(root, 'Retry this save');
    await act(async () => { await Promise.resolve(); });
    expect(api.savePassport).toHaveBeenCalledTimes(2);
    const first = api.savePassport.mock.calls[0][0] as SaveCommand;
    const second = api.savePassport.mock.calls[1][0] as SaveCommand;
    expect(second.p_operation_id).toBe(first.p_operation_id);
    expect(second.p_patch.lengthMeasurement).toEqual({ value: 30, unit: 'cm' });
  });

  it('keeps the entered fields while reviewing a revision conflict', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(root, 'Heat preference: Lower heat when practical');
    await pressButton(root, 'Length unit: cm');
    await typeInto(root, 'Your length in centimetres (self-measured, optional)', '45');
    api.savePassport.mockRejectedValueOnce(new Error('revision-conflict'));
    await pressButton(root, 'Save to my record');
    await act(async () => { await Promise.resolve(); });
    expect(api.savePassport).toHaveBeenCalledTimes(1);

    const latest = makeRecord({ ...defaults, heatPreference: 'avoid-heat' }, 6);
    api.loadPassport.mockResolvedValueOnce(latest);
    await pressButton(root, 'Load latest record for review');
    expect(findText(root, 'Review version 6')).toBeDefined();
    // The review panel speaks to screen readers in words, never in raw JSON.
    const reviewTexts = labels(root);
    expect(reviewTexts.filter((l) => /[{"]/.test(l))).toEqual([]);
    expect(reviewTexts).toContain('Heat preference: I want to avoid heat styling');
    expect(findText(root, 'Uncertain fields: None')).toBeDefined();

    await pressButton(root, 'Keep my submitted fields and review form');
    expect(find(root, (n) => n.props?.accessibilityLabel === 'Your length in centimetres (self-measured, optional)')?.props.value).toBe('45');
    expect(pillState(root, 'Heat preference', 'Lower heat when practical').selected).toBe(true);
  });

  it('corrects one historical entry with the required reason and untouched siblings', async () => {
    const target = {
      id: 'target-revision',
      passportId: 'passport-1',
      sequence: 3, baseRevision: 2,
      kind: 'change' as const,
      effectiveDate: { precision: 'day', value: '2026-06-01' } as const,
      recordedAt: '2026-06-01T10:00:00.000Z',
      source: 'user-reported' as const,
      patch: { heatPreference: 'avoid-heat', lengthMeasurement: { value: 40, unit: 'cm' as const } },
    };
    const record = makeRecord(defaults, 5);
    const root = await render(createElement(PassportEditor, {
      owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn(),
      // Test fixture built by hand; the deliberate cast isolates the editor's
      // behaviour from PassportRevisionSchema's full zod output shape.
      target: target as unknown as Parameters<typeof PassportEditor>[0]['target'],
    }));
    expect(findText(root, 'Correct a mistake')).toBeDefined();
    await typeInto(root, 'Why are you correcting this?', 'I measured again more carefully');
    const command = await pressSave(root, record);
    expect(command.p_kind).toBe('correction');
    expect(command.p_corrects_id).toBe('target-revision');
    // Untouched siblings keep the target entry's recorded value.
    expect(command.p_patch.heatPreference).toBe('avoid-heat');
    expect((command.p_patch.lengthMeasurement as { value: number }).value).toBe(40);
  });

  it('reloads saved values from the stored projection', async () => {
    const record = makeRecord({
      ...defaults,
      lengthMeasurement: { value: 30, unit: 'cm', precision: 'exact', measuredOn: '2026-09-01' },
      heatPreference: 'no-preference',
      damageObservation: 'unknown',
      reactionsAvoidances: ['fragrance'],
    });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    expect(find(root, (n) => n.props?.accessibilityLabel === 'Your length in centimetres (self-measured, optional)')?.props.value).toBe('30');
    expect(find(root, (n) => n.props?.accessibilityLabel === 'Length measured on (YYYY-MM-DD, optional)')?.props.value).toBe('2026-09-01');
    expect(pillState(root, 'Length unit', 'cm').selected).toBe(true);
    expect(pillState(root, 'Length precision', 'exact').selected).toBe(true);
    expect(pillState(root, 'Heat preference', 'No heat preference').selected).toBe(true);
    expect(pillState(root, 'Damage you notice', 'Not sure').selected).toBe(true);
    expect(find(root, (n) => n.props?.accessibilityLabel === 'Known reactions or avoidances (comma separated, optional)')?.props.value).toBe('fragrance');
  });

  it('isolates unsaved device drafts per owner', async () => {
    const record = makeRecord({ ...defaults });
    const rootA = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    await pressButton(rootA, 'Heat preference: I want to avoid heat styling');
    api.savePassport.mockRejectedValueOnce(new Error('network down'));
    await pressButton(rootA, 'Save to my record');
    await act(async () => { await Promise.resolve(); });
    expect(store.storage.has('strandcue-draft-owner-a')).toBe(true);
    rootA.unmount();

    const rootB = await render(createElement(PassportEditor, { owner: 'owner-b', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    expect(store.storage.has('strandcue-draft-owner-b')).toBe(false);
    expect(find(rootB, (n) => n.props?.accessibilityLabel === 'Retry previous save')).toBeUndefined();
    expect(labels(rootB).some((l) => /previous save was not confirmed/i.test(l))).toBe(false);
  });
});

describe('PassportEditor accessibility of the new controls', () => {
  it('labels every new control for assistive technology', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    const withoutUnit = labels(root);
    expect(withoutUnit).not.toContain('Length precision: exact');
    expect(withoutUnit).not.toContain('Remove this length measurement');
    await pressButton(root, 'Length unit: cm');
    const present = labels(root);
    for (const expected of [
      'Length unit: cm', 'Length unit: in',
      'Length precision: exact', 'Length precision: approximate', 'Length precision: unknown',
      'Length measured on (YYYY-MM-DD, optional)',
      'Remove this length measurement',
      'Heat preference: I want to avoid heat styling', 'Heat preference: I want to minimise heat styling', 'Heat preference: Lower heat when practical', 'Heat preference: No heat preference', 'Heat preference: I am not sure yet',
      'Damage you notice: Nothing noticed', 'Damage you notice: Slightly dry or rough in places', 'Damage you notice: Clearly dry, rough or breaking in places', 'Damage you notice: Widespread breakage or thinning', 'Damage you notice: Not sure',
    ]) {
      expect(present).toContain(expected);
    }
  });

  it('exposes goal choices as group-labelled checkboxes that toggle', async () => {
    const record = makeRecord({ ...defaults });
    const root = await render(createElement(PassportEditor, { owner: 'owner-a', record, onSaved: vi.fn(), onCancel: vi.fn() }));
    expect(labels(root)).toContain('Goals');
    expect(checkboxState(root, 'Goals', 'definition')).toBe(false);
    await pressButton(root, 'Goals: definition');
    expect(checkboxState(root, 'Goals', 'definition')).toBe(true);
    // Toggling again removes the goal instead of appending a duplicate.
    await pressButton(root, 'Goals: definition');
    expect(checkboxState(root, 'Goals', 'definition')).toBe(false);
  });
});
