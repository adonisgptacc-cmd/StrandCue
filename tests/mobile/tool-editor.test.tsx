import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolEditor } from '../../apps/mobile/src/tool-editor';
import { saveToolDraft } from '../../apps/mobile/src/tool-drafts';
import { styles } from '../../apps/mobile/src/ui';
import { flush, hasPressable, inputValue, labelsOf, press, renderedText, type as typeInto } from '../helpers/native-render';

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    HostComponent.displayName = `Mock${tag}`;
    return HostComponent;
  };
  return {
    AccessibilityInfo: { announceForAccessibility: (text: string) => { spoken.push(text); } },
    Pressable: host('button'), ScrollView: host('main'), StyleSheet: { create: (value: unknown) => value },
    Text: host('span'), TextInput: host('input'), View: host('div'),
  };
});

const rpc = vi.hoisted(() => vi.fn());
const spoken = vi.hoisted(() => [] as string[]);
const deviceStorage = vi.hoisted(() => new Map<string, string>());
const ids = vi.hoisted(() => ({ counter: 0 }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++ids.counter).padStart(12, '0')}` }));
vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc },
  secureStorage: {
    getItem: async (key: string) => deviceStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => { deviceStorage.set(key, value); },
    removeItem: async (key: string) => { deviceStorage.delete(key); },
  },
}));

const owner = 'b0000000-0000-4000-8000-000000000001';
const toolId = 'a0000000-0000-4000-8000-000000000002';
const baselineId = 'c0000000-0000-4000-8000-000000000001';
const choose = (renderer: ReactTestRenderer, group: string, option: string) => press(renderer, `${group}: ${option}`);
const answer = (data: unknown) => Promise.resolve({ data, error: null });
const calls = (name: string) => rpc.mock.calls.filter(([called]) => called === name);
const receipt = { userToolId: toolId, revision: 1, revisions: [] };

const detail = (overrides: Record<string, unknown> = {}) => ({
  id: toolId, revision: 1, availability: 'available', matched: false, matchConfirmed: false, manualBrand: 'Salon', manualModel: 'Pro dryer', toolType: 'dryer',
  wattageWatts: null, adjustableTemp: null, settings: null, attachments: null, condition: null, heatMethods: null, notes: null, versionId: null,
  revisions: [{ id: baselineId, kind: 'baseline', correctsId: null, matchVersionId: null, patch: { manualBrand: 'Salon', manualModel: 'Pro dryer', toolType: 'dryer', availability: 'available' } }],
  ...overrides,
});

type Handlers = { onSaved: () => void; onCancel: () => void; onStale: () => void };
const handlers = (): Handlers => ({ onSaved: vi.fn(), onCancel: vi.fn(), onStale: vi.fn() });

async function open(mode: string, extra: Record<string, unknown> = {}, h: Handlers = handlers()): Promise<{ renderer: ReactTestRenderer; h: Handlers }> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(ToolEditor, { owner, mode, ...h, ...extra } as never)); });
  return { renderer, h };
}

beforeEach(() => { rpc.mockReset(); spoken.length = 0; deviceStorage.clear(); ids.counter = 0; });

describe('adding a tool', () => {
  it('opens unanswered, with a name on every control and no write', async () => {
    const { renderer } = await open('add');
    const labels = labelsOf(renderer);
    for (const label of ['Brand (as printed)', 'Model', 'Power in watts (optional, only if you know it)', 'Short notes (optional, avoid identifying details)', 'Save tool', 'Cancel without saving']) {
      expect(labels, label).toContain(label);
    }
    for (const group of ['Tool type', 'Availability', 'Adjustable temperature', 'Settings', 'Attachments', 'Condition', 'How it heats']) {
      expect(labels.some(label => label.startsWith(`${group}: `)), group).toBe(true);
    }
    expect(labels).toContain('Tool type: Not answered');
    expect(labels).toContain('Settings: Not answered');
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Add a tool');
  });

  it('refuses a tool with no model without calling the server', async () => {
    const { renderer } = await open('add');
    press(renderer, 'Save tool');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('A tool you add by hand needs a model.');
    expect(renderedText(renderer)).toContain('This tool was not saved. Check the field marked above and try again.');
  });

  it('saves a known wattage with an unknown temperature exactly that, then reports success once', async () => {
    rpc.mockImplementation(() => answer(receipt));
    const { renderer, h } = await open('add');
    typeInto(renderer, 'Model', 'Quiet dryer');
    typeInto(renderer, 'Power in watts (optional, only if you know it)', '1800');
    press(renderer, 'Save tool');
    await flush(6);
    const [name, params] = calls('tool_add')[0] as [string, { p_facts: Record<string, unknown>; p_effective_date: unknown }];
    expect(name).toBe('tool_add');
    expect(params.p_facts).toEqual({ manualBrand: null, manualModel: 'Quiet dryer', toolType: null, wattageWatts: 1800 });
    expect(h.onSaved).toHaveBeenCalledTimes(1);
    expect(spoken.filter(text => text === 'Tool saved.')).toHaveLength(1);
    expect([...deviceStorage.keys()].filter(key => key.startsWith('strandcue-tool-draft-'))).toEqual([]);
  });

  it('records settings with their own units and never fills a temperature from anything else', async () => {
    rpc.mockImplementation(() => answer(receipt));
    const { renderer } = await open('add');
    typeInto(renderer, 'Model', 'Ceramic 230C 2200W');
    typeInto(renderer, 'Power in watts (optional, only if you know it)', '2200');
    choose(renderer, 'Settings', 'I will list them');
    press(renderer, 'Add a setting');
    typeInto(renderer, 'Setting 1 name', 'High');
    expect(inputValue(renderer, 'Setting 1 temperature in degrees Celsius (optional)')).toBe('');
    press(renderer, 'Add a setting');
    typeInto(renderer, 'Setting 2 name', 'Plate 2');
    choose(renderer, 'Setting 2 unit', 'Fahrenheit');
    typeInto(renderer, 'Setting 2 temperature in degrees Fahrenheit (optional)', '350');
    press(renderer, 'Save tool');
    await flush(6);
    const facts = (calls('tool_add')[0][1] as { p_facts: Record<string, unknown> }).p_facts;
    expect(facts.settings).toEqual({ state: 'recorded', items: [{ label: 'High', temperature: null }, { label: 'Plate 2', temperature: { value: 350, unit: 'F' } }] });
    expect(facts.wattageWatts).toBe(2200);
  });

  it('can remove a setting and lets unknown be chosen', async () => {
    const { renderer } = await open('add');
    choose(renderer, 'Settings', 'I will list them');
    press(renderer, 'Add a setting');
    expect(hasPressable(renderer, 'Remove setting 1')).toBe(true);
    press(renderer, 'Remove setting 1');
    expect(hasPressable(renderer, 'Remove setting 1')).toBe(false);
    choose(renderer, 'Settings', 'Not sure');
    expect(labelsOf(renderer).some(label => label.startsWith('Setting 1 name'))).toBe(false);
  });

  it('says a temperature is out of range, in the unit that was chosen, and writes nothing', async () => {
    const { renderer } = await open('add');
    typeInto(renderer, 'Model', 'Iron');
    choose(renderer, 'Settings', 'I will list them');
    press(renderer, 'Add a setting');
    typeInto(renderer, 'Setting 1 name', 'Hot');
    typeInto(renderer, 'Setting 1 temperature in degrees Celsius (optional)', '900');
    press(renderer, 'Save tool');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('The temperature for "Hot" must be a whole number between 30 and 300 degrees Celsius.');
  });

  it('refuses an unheated tool that states a temperature and leaves both answers as typed', async () => {
    const { renderer } = await open('add');
    typeInto(renderer, 'Model', 'Comb');
    choose(renderer, 'How it heats', 'I will choose');
    press(renderer, 'Heat methods: Unheated');
    choose(renderer, 'Adjustable temperature', 'Yes');
    press(renderer, 'Save tool');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('A tool cannot be both unheated and have a temperature. Change one of those answers.');
    expect(labelsOf(renderer)).toContain('Adjustable temperature: Yes');
  });

  it('lets unheated stand alone and a heated method displace it, without a diffuser selecting any heat', async () => {
    rpc.mockImplementation(() => answer(receipt));
    const { renderer } = await open('add');
    typeInto(renderer, 'Model', 'Dryer');
    choose(renderer, 'How it heats', 'I will choose');
    press(renderer, 'Heat methods: Heated air');
    press(renderer, 'Heat methods: Steam');
    press(renderer, 'Heat methods: Unheated');
    const checked = () => renderer.root.findAll(node => typeof node.type === 'string' && node.props?.accessibilityRole === 'checkbox' && node.props?.accessibilityState?.checked)
      .map(node => node.props.accessibilityLabel as string);
    expect(checked()).toEqual(['Heat methods: Unheated']);
    press(renderer, 'Heat methods: Heated air');
    expect(checked()).toEqual(['Heat methods: Heated air']);
    choose(renderer, 'Attachments', 'I will list them');
    press(renderer, 'Attachments you have (these clip on and are not a way the tool heats): Diffuser');
    // The diffuser is ticked as an attachment, in the attachments list; the heat methods are unchanged.
    expect(checked()).toEqual(['Attachments you have (these clip on and are not a way the tool heats): Diffuser', 'Heat methods: Heated air']);
    press(renderer, 'Save tool');
    await flush(6);
    const facts = (calls('tool_add')[0][1] as { p_facts: Record<string, unknown> }).p_facts;
    expect(facts.heatMethods).toEqual({ state: 'recorded', methods: ['heated-air'] });
    expect(facts.attachments).toEqual({ state: 'recorded', items: [{ kind: 'diffuser' }] });
  });

  it('records other attachments in the owner words, condition, unknown answers and notes', async () => {
    rpc.mockImplementation(() => answer(receipt));
    const { renderer } = await open('add');
    typeInto(renderer, 'Model', 'Dryer');
    choose(renderer, 'Attachments', 'I will list them');
    press(renderer, 'Attachments you have (these clip on and are not a way the tool heats): Other');
    typeInto(renderer, 'Other attachment names, one per line', 'Travel pouch\nSection clips');
    choose(renderer, 'Condition', 'Damaged or faulty, as you recorded it');
    choose(renderer, 'Adjustable temperature', 'Not sure');
    choose(renderer, 'How it heats', 'Not sure');
    typeInto(renderer, 'Short notes (optional, avoid identifying details)', 'Cable frayed');
    press(renderer, 'Save tool');
    await flush(6);
    expect((calls('tool_add')[0][1] as { p_facts: Record<string, unknown> }).p_facts).toEqual({
      manualBrand: null, manualModel: 'Dryer', toolType: null, adjustableTemp: 'unknown', condition: 'damaged', heatMethods: { state: 'unknown' }, notes: 'Cable frayed',
      attachments: { state: 'recorded', items: [{ kind: 'other', other: 'Section clips' }, { kind: 'other', other: 'Travel pouch' }] },
    });
  });

  it('cancels with no write and no saved draft', async () => {
    const { renderer, h } = await open('add');
    typeInto(renderer, 'Model', 'Dryer');
    press(renderer, 'Cancel without saving');
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(deviceStorage.size).toBe(0);
  });
});

describe('saving honestly', () => {
  async function filled() {
    const view = await open('add');
    typeInto(view.renderer, 'Model', 'Dryer');
    return view;
  }

  it('keeps the primary action in place while saving, then locks the fields on a failed save', async () => {
    let release!: (value: unknown) => void;
    rpc.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const { renderer } = await filled();
    press(renderer, 'Save tool');
    await flush();
    expect(labelsOf(renderer)).toContain('Saving the tool');
    expect(labelsOf(renderer)).not.toContain('Cancel without saving');
    await act(async () => { release({ data: null, error: new Error('Network request failed') }); });
    await flush(6);
    expect(renderedText(renderer)).toContain('The tool could not be saved. Nothing was saved yet.');
    expect(labelsOf(renderer)).toContain('Try saving the tool again');
    // The failure is said once, by the message that takes the focus: not also announced.
    expect(spoken.filter(text => text.startsWith('The tool could not be saved'))).toEqual([]);
    expect([...deviceStorage.keys()].some(key => key.startsWith(`strandcue-tool-draft-${owner}-`))).toBe(true);
    const field = renderer.root.findAll(node => node.props?.accessibilityLabel === 'Model' && typeof node.props?.onChangeText === 'function')[0];
    expect(field.props.editable).toBe(false);
  });

  it('retries the identical command, so nothing is recorded twice', async () => {
    rpc.mockImplementationOnce(() => Promise.reject(new Error('Network request failed')));
    const { renderer, h } = await filled();
    press(renderer, 'Save tool');
    await flush(6);
    rpc.mockImplementation(() => answer(receipt));
    press(renderer, 'Try saving the tool again');
    await flush(6);
    const sent = calls('tool_add');
    expect(sent).toHaveLength(2);
    expect(sent[1][1]).toEqual(sent[0][1]);
    expect(h.onSaved).toHaveBeenCalledTimes(1);
  });

  it('refuses to retry a stale entry and offers the latest instead', async () => {
    rpc.mockImplementation(() => Promise.reject(new Error('revision-conflict')));
    const { renderer, h } = await open('edit', { userToolId: toolId, detail: detail() });
    choose(renderer, 'Condition', 'Some wear');
    press(renderer, 'Save changes');
    await flush(6);
    expect(renderedText(renderer)).toContain('This tool changed elsewhere');
    expect(hasPressable(renderer, 'Try saving the tool again')).toBe(false);
    expect(deviceStorage.size).toBe(0);
    press(renderer, 'Show the latest entry');
    expect(h.onStale).toHaveBeenCalledTimes(1);
  });

  it('answers a server refusal in plain words and unlocks the form', async () => {
    rpc.mockImplementation(() => Promise.reject(new Error('invalid-wattage')));
    const { renderer } = await filled();
    press(renderer, 'Save tool');
    await flush(6);
    expect(renderedText(renderer)).toContain('Power is a whole number of watts, from 1 to 10000.');
    expect(deviceStorage.size).toBe(0);
    expect(hasPressable(renderer, 'Save tool')).toBe(true);
  });

  it('lets the owner delete a failed attempt, or leave it for later', async () => {
    rpc.mockImplementation(() => Promise.reject(new Error('Network request failed')));
    const { renderer, h } = await filled();
    press(renderer, 'Save tool');
    await flush(6);
    press(renderer, 'Back to tools (keep for later)');
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    expect(deviceStorage.size).toBeGreaterThan(0);
    press(renderer, 'Delete the saved attempt');
    await flush(4);
    expect(deviceStorage.size).toBe(0);
    expect(renderedText(renderer)).toContain('The failed attempt was discarded. Nothing was saved.');
  });

  it('resumes a saved command and retries exactly it', async () => {
    const command = { operationId: 'e0000000-0000-4000-8000-000000000001', userToolId: toolId, effectiveDate: { precision: 'day', value: '2026-03-01' }, versionId: null, manualBrand: null, manualModel: 'Saved dryer', toolType: null, availability: 'available' };
    await saveToolDraft({ getItem: async k => deviceStorage.get(k) ?? null, setItem: async (k, v) => { deviceStorage.set(k, v); }, removeItem: async k => { deviceStorage.delete(k); } }, owner, { mode: 'add', command });
    rpc.mockImplementation(() => answer(receipt));
    const { renderer, h } = await open('add', { resume: { mode: 'add', command } });
    expect(renderedText(renderer)).toContain('A save is waiting. The fields are locked so a retry sends the same command.');
    press(renderer, 'Try saving the tool again');
    await flush(6);
    expect((calls('tool_add')[0][1] as { p_operation_id: string }).p_operation_id).toBe(command.operationId);
    expect(h.onSaved).toHaveBeenCalledTimes(1);
  });
});

describe('a resumed command that cannot be saved', () => {
  const command = { operationId: 'e0000000-0000-4000-8000-000000000001', userToolId: toolId, effectiveDate: { precision: 'day', value: '2026-03-01' }, versionId: null, manualBrand: null, manualModel: 'Saved dryer', toolType: null, availability: 'available' };
  const storage = { getItem: async (k: string) => deviceStorage.get(k) ?? null, setItem: async (k: string, v: string) => { deviceStorage.set(k, v); }, removeItem: async (k: string) => { deviceStorage.delete(k); } };

  it('is dropped with a plain reason and no empty form to press', async () => {
    await saveToolDraft(storage, owner, { mode: 'add', command });
    rpc.mockImplementation(() => Promise.reject(new Error('invalid-wattage')));
    const { renderer } = await open('add', { resume: { mode: 'add', command } });
    press(renderer, 'Try saving the tool again');
    await flush(6);
    expect(renderedText(renderer)).toContain('Power is a whole number of watts, from 1 to 10000.');
    expect(deviceStorage.size).toBe(0);
    // Nothing is left that would build a command from fields that are not on screen.
    expect(hasPressable(renderer, 'Save tool')).toBe(false);
    expect(hasPressable(renderer, 'Cancel without saving')).toBe(true);
  });

  it('offers no Save button after the owner deletes the resumed attempt', async () => {
    await saveToolDraft(storage, owner, { mode: 'add', command });
    const { renderer } = await open('add', { resume: { mode: 'add', command } });
    press(renderer, 'Delete the saved attempt');
    await flush(4);
    expect(renderedText(renderer)).toContain('The failed attempt was discarded. Nothing was saved.');
    expect(hasPressable(renderer, 'Save tool')).toBe(false);
    expect(hasPressable(renderer, 'Cancel without saving')).toBe(true);
  });

  it('keeps the command when the owner only needs to sign in again', async () => {
    await saveToolDraft(storage, owner, { mode: 'add', command });
    rpc.mockImplementation(() => Promise.reject(new Error('authentication-required')));
    const { renderer } = await open('add', { resume: { mode: 'add', command } });
    press(renderer, 'Try saving the tool again');
    await flush(6);
    expect(renderedText(renderer)).toContain('Sign in again to save this tool.');
    expect(deviceStorage.size).toBeGreaterThan(0);
    expect(hasPressable(renderer, 'Try saving the tool again')).toBe(true);
  });
});

describe('editing owner facts', () => {
  const stored = () => detail({ wattageWatts: 2200, condition: 'worn', settings: { state: 'unknown' }, notes: 'Mine' });

  it('starts from the stored record and refuses to save when nothing changed', async () => {
    const { renderer } = await open('edit', { userToolId: toolId, detail: stored() });
    expect(inputValue(renderer, 'Power in watts (optional, only if you know it)')).toBe('2200');
    expect(labelsOf(renderer)).toContain('Condition: Some wear');
    expect(labelsOf(renderer)).toContain('Settings: Not sure');
    expect(labelsOf(renderer)).not.toContain('Brand (as printed)');
    press(renderer, 'Save changes');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Nothing has changed, so there is nothing to save.');
    // The reason is said once, by the message that takes the focus: not also announced, and no summary about unmarked fields.
    expect(spoken).toEqual([]);
  });

  it('sends only what changed, keeping cleared, unknown and recorded apart', async () => {
    rpc.mockImplementation(() => answer({ ...receipt, revision: 2 }));
    const { renderer } = await open('edit', { userToolId: toolId, detail: stored() });
    typeInto(renderer, 'Power in watts (optional, only if you know it)', '');
    choose(renderer, 'Condition', 'Not sure');
    choose(renderer, 'Availability', 'Not available right now');
    press(renderer, 'Save changes');
    await flush(6);
    const [, params] = calls('tool_change')[0] as [string, Record<string, unknown>];
    expect(params).toMatchObject({ p_user_tool_id: toolId, p_expected_revision: 1, p_availability: 'out_of_stock', p_facts: { wattageWatts: null, condition: 'unknown' } });
    expect(Object.keys(params.p_facts as object).sort()).toEqual(['condition', 'wattageWatts']);
  });
});

describe('correcting the identity', () => {
  it('shows the entry being corrected and offers only the identity and a reason', async () => {
    const { renderer } = await open('correct', { userToolId: toolId, detail: detail() });
    const text = renderedText(renderer);
    expect(text).toContain('You are correcting the entry that recorded Salon, Pro dryer, Hair dryer.');
    const labels = labelsOf(renderer);
    for (const label of ['Brand (as printed)', 'Model', 'Reason for this correction (required)', 'Save correction']) expect(labels).toContain(label);
    expect(labels).not.toContain('Power in watts (optional, only if you know it)');
    expect(labels.some(label => label.startsWith('Condition: '))).toBe(false);
  });

  it('refuses a correction that changes nothing before calling the server', async () => {
    const { renderer } = await open('correct', { userToolId: toolId, detail: detail() });
    typeInto(renderer, 'Reason for this correction (required)', 'Typo');
    press(renderer, 'Save correction');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('The correction has to change the brand, the model or the tool type. These words are the same as before.');
    typeInto(renderer, 'Model', '  Pro dryer  ');
    press(renderer, 'Save correction');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('needs a reason, then appends a correction that points at the original entry', async () => {
    rpc.mockImplementation(() => answer({ ...receipt, revision: 2 }));
    const { renderer, h } = await open('correct', { userToolId: toolId, detail: detail() });
    typeInto(renderer, 'Model', 'Pro dryer 2');
    press(renderer, 'Save correction');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Say why you are correcting this tool.');
    typeInto(renderer, 'Reason for this correction (required)', 'Misread the label');
    press(renderer, 'Save correction');
    await flush(6);
    expect(calls('tool_correct')[0]).toEqual(['tool_correct', expect.objectContaining({
      p_corrects_id: baselineId, p_reason: 'Misread the label', p_expected_revision: 1, p_facts: { manualModel: 'Pro dryer 2' },
    })]);
    expect(h.onSaved).toHaveBeenCalledTimes(1);
  });

  it('fails closed when there is no readable entry to correct', async () => {
    const { renderer } = await open('correct', { userToolId: toolId, detail: detail({ revisions: [{ id: baselineId, kind: 'archive', correctsId: null, matchVersionId: null, patch: { availability: 'archived' } }] }) });
    typeInto(renderer, 'Model', 'x');
    typeInto(renderer, 'Reason for this correction (required)', 'why');
    press(renderer, 'Save correction');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('There is no entry to correct yet. Open the tool and try again.');
  });
});

describe('archiving', () => {
  it('needs an intentional yes, then appends an archive, and retries without a duplicate', async () => {
    rpc.mockImplementationOnce(() => Promise.reject(new Error('Network request failed')));
    const { renderer, h } = await open('archive', { userToolId: toolId, detail: detail() });
    press(renderer, 'Archive tool');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Confirm that you want to archive this tool. Its history stays in your record.');
    choose(renderer, 'I confirm I want to archive this tool', 'Yes, archive it');
    press(renderer, 'Archive tool');
    await flush(6);
    expect(renderedText(renderer)).toContain('The tool could not be saved.');
    rpc.mockImplementation(() => answer({ ...receipt, revision: 2 }));
    press(renderer, 'Try saving the tool again');
    await flush(6);
    const sent = calls('tool_archive');
    expect(sent).toHaveLength(2);
    expect(sent[1][1]).toEqual(sent[0][1]);
    expect(h.onSaved).toHaveBeenCalledTimes(1);
  });
});

describe('accessibility', () => {
  it('keeps every touch target at 48dp or more and never names a control by an id', async () => {
    const { renderer } = await open('add');
    for (const minHeight of [styles.button.minHeight, styles.input.minHeight, styles.pill.minHeight]) expect(minHeight).toBeGreaterThanOrEqual(48);
    expect(labelsOf(renderer).some(label => /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(label))).toBe(false);
    const unlabelled = renderer.root.findAll(node => typeof node.type === 'string' && typeof node.props?.onPress === 'function' && typeof node.props?.accessibilityLabel !== 'string');
    expect(unlabelled).toEqual([]);
    expect(renderer.root.findAll(node => typeof node.type === 'string' && node.props?.accessibilityRole === 'header' && node.children.join('') === 'Add a tool')).toHaveLength(1);
  });

  it('says units with their values and keeps unknown, none and not answered distinct without colour', async () => {
    const { renderer } = await open('add');
    choose(renderer, 'Settings', 'I will list them');
    press(renderer, 'Add a setting');
    choose(renderer, 'Setting 1 unit', 'Fahrenheit');
    expect(labelsOf(renderer)).toContain('Setting 1 temperature in degrees Fahrenheit (optional)');
    const attachmentLabels = [...new Set(labelsOf(renderer).filter(label => label.startsWith('Attachments: ')))];
    expect(attachmentLabels).toHaveLength(4);
    for (const word of ['Not answered', 'Not sure', 'None', 'I will list them']) expect(attachmentLabels.some(label => label.endsWith(word))).toBe(true);
  });

  it('announces a refusal once and never uses safety or verdict wording', async () => {
    const { renderer } = await open('add');
    press(renderer, 'Save tool');
    await flush();
    expect(spoken).toEqual(['This tool was not saved. Check the field marked above and try again.']);
    expect(renderedText(renderer)).not.toMatch(/\bsafe\b|unsafe|hazard|verified|recommend|effective/i);
  });
});
