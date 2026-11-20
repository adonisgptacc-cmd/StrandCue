import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { asUser, complete, database, USER_A, USER_B } from '../database/harness.ts';
import {
  T_SECRET_CLAIM, T_SECRET_REVIEWER, T_SECRET_SOURCE, TV_DRYER, TV_IRON, TV_STEAMER_NEW, TV_STEAMER_OLD, clearToolCatalogue, seedToolCatalogue,
} from '../helpers/tool-catalogue-fixture.ts';
import { flush, hasPressable, labelsOf, press, renderedText, type as typeInto } from '../helpers/native-render';
import { Tools } from '../../apps/mobile/src/tools';
import { getUserTool, recordUserTool } from '../../apps/mobile/src/tool-api';
import { getToolCatalogueDetail } from '../../apps/mobile/src/tool-catalogue-api';

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    HostComponent.displayName = `Mock${tag}`;
    return HostComponent;
  };
  return {
    AccessibilityInfo: { announceForAccessibility: () => undefined, setAccessibilityFocus: () => undefined },
    findNodeHandle: () => 1,
    Linking: { openURL: () => Promise.resolve() },
    Pressable: host('button'), ScrollView: host('main'), StyleSheet: { create: (value: unknown) => value },
    Text: host('span'), TextInput: host('input'), View: host('div'),
  };
});

// The mobile client talks to a real PostgreSQL (PGlite) holding the real migrations.
const bridge = vi.hoisted(() => ({
  run: null as null | ((name: string, params: Record<string, unknown>) => Promise<unknown>),
  storage: new Map<string, string>(),
  ids: 0,
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++bridge.ids).padStart(12, '0')}` }));
vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc: (name: string, params: Record<string, unknown>) => bridge.run!(name, params) },
  secureStorage: {
    getItem: async (key: string) => bridge.storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { bridge.storage.set(key, value); },
    removeItem: async (key: string) => { bridge.storage.delete(key); },
  },
}));

let db: PGlite;
let currentUser = USER_A;
const called: string[] = [];
const REVIEWER = 'Reviewer Rita';
const AUTHOR = 'Author Ann';

async function run(name: string, params: Record<string, unknown>): Promise<unknown> {
  called.push(name);
  await asUser(db, currentUser);
  const keys = Object.keys(params);
  const values = keys.map(key => {
    const value = params[key];
    return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
  });
  try {
    const { rows } = await db.query<{ result: unknown }>(
      `select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(', ')}) result`, values);
    return { data: rows[0].result, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

async function admin<T extends Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
  await db.exec('set session authorization postgres');
  const rows = (await db.query<T>(sql, values)).rows;
  await asUser(db, currentUser);
  return rows;
}
const writes = async () => (await admin<{ n: string }>(
  `select (select count(*) from public.user_tool_revisions)::text || '/' || (select count(*) from strandcue_private.tool_operations)::text n`))[0].n;
const kinds = async (userToolId: string) => (await admin<{ kind: string }>('select kind from public.user_tool_revisions where user_tool_id = $1 order by sequence', [userToolId])).map(row => row.kind);

async function publish(version: string, subject: string) {
  // A publication starts as a review of the content as it stands, then is published by a second person.
  await admin(`insert into public.tool_publications(version_id, subject, claim_id, state, authored_by) values ($1, $2, null, 'review', $3)`, [version, subject, AUTHOR]);
  await admin(`update public.tool_publications set state = 'published', reviewed_by = $3, reviewed_at = now(), published_at = now()
    where version_id = $1 and subject = $2 and claim_id is null`, [version, subject, REVIEWER]);
}

async function addTool(brand: string | null = 'Salon brand', model = 'Pro dryer'): Promise<string> {
  const userToolId = crypto.randomUUID();
  await recordUserTool({
    operationId: crypto.randomUUID(), userToolId, effectiveDate: { precision: 'day', value: '2026-03-01' }, versionId: null,
    manualBrand: brand, manualModel: model, toolType: 'dryer', availability: 'available', notes: null,
  });
  return userToolId;
}
async function mountTools(owner: string): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(Tools, { owner })); });
  await flush(10);
  return renderer;
}
const tap = async (renderer: ReactTestRenderer, label: string) => { press(renderer, label); await flush(10); };
const openTool = (renderer: ReactTestRenderer, name = 'Salon brand Pro dryer') => tap(renderer, `View tool entry: ${name}`);

async function search(renderer: ReactTestRenderer, words: string) {
  typeInto(renderer, 'Search the tool catalogue', words);
  press(renderer, 'Search tool catalogue');
  await flush(10);
}

beforeAll(async () => {
  db = await database();
  bridge.run = run;
}, 60_000);
beforeEach(async () => {
  currentUser = USER_A; called.length = 0; bridge.storage.clear(); bridge.ids = 0;
  await asUser(db, USER_A); await complete(db, 'user_a');
  await asUser(db, USER_B); await complete(db, 'user_b');
  await seedToolCatalogue(db);
  await asUser(db, USER_A);
});
afterEach(async () => {
  await db.exec('set session authorization postgres');
  await db.exec('truncate public.profiles cascade');
  await db.exec('alter table public.tool_publications disable trigger user; alter table public.tool_claim_evidence disable trigger user');
  await db.exec('delete from public.tool_claim_evidence; delete from public.tool_publications');
  await db.exec('alter table public.tool_publications enable trigger user; alter table public.tool_claim_evidence enable trigger user');
  await clearToolCatalogue(db);
});
afterAll(async () => { await db?.close(); });

describe('owning a tool, against the real database', () => {
  it('goes from empty to add to list to detail, and keeps a wattage and an unknown temperature exactly', async () => {
    const renderer = await mountTools(USER_A);
    expect(renderedText(renderer)).toContain('No tools recorded yet.');
    await tap(renderer, 'Add a tool');
    typeInto(renderer, 'Brand (as printed)', 'Salon brand');
    typeInto(renderer, 'Model', 'Pro dryer');
    typeInto(renderer, 'Power in watts (optional, only if you know it)', '1900');
    press(renderer, 'Tool type: Hair dryer');
    await tap(renderer, 'Save tool');
    expect(renderedText(renderer)).toContain('Salon brand Pro dryer');
    expect(renderedText(renderer)).not.toContain('No tools recorded yet.');
    await openTool(renderer);
    const text = renderedText(renderer);
    for (const line of ['Brand: Salon brand', 'Model: Pro dryer', 'Type: Hair dryer', 'Power: 1900 watts', 'Temperature: Not recorded', 'How it heats: Not answered', 'Manual entry, not linked to the catalogue.']) expect(text, line).toContain(line);
    const [row] = await admin<{ wattage_watts: number; settings: unknown; heat_methods: unknown; adjustable_temp: unknown }>('select wattage_watts, settings, heat_methods, adjustable_temp from public.user_tools');
    // A wattage is stored as a wattage: it never becomes a temperature, and nothing unanswered is invented.
    expect(row).toEqual({ wattage_watts: 1900, settings: null, heat_methods: null, adjustable_temp: null });
  });

  it('edits a fact and shows the change in the history, with the original entry still there', async () => {
    const userToolId = await addTool();
    const renderer = await mountTools(USER_A);
    await openTool(renderer);
    await tap(renderer, 'Edit this tool');
    typeInto(renderer, 'Power in watts (optional, only if you know it)', '2100');
    press(renderer, 'Condition: Some wear');
    await tap(renderer, 'Save changes');
    await openTool(renderer);
    expect(renderedText(renderer)).toContain('Power: 2100 watts');
    press(renderer, 'Show tool history');
    const text = renderedText(renderer);
    for (const line of ['Original entry', 'Change', 'Power: 2100 watts', 'Condition: Some wear']) expect(text, line).toContain(line);
    expect(await kinds(userToolId)).toEqual(['baseline', 'change']);
  });

  it('corrects the identity by appending, so the original wording stays readable', async () => {
    const userToolId = await addTool('Saln brand', 'Pro drier');
    const renderer = await mountTools(USER_A);
    await openTool(renderer, 'Saln brand Pro drier');
    await tap(renderer, 'Correct this tool\'s identity');
    typeInto(renderer, 'Brand (as printed)', 'Salon brand');
    typeInto(renderer, 'Model', 'Pro dryer');
    typeInto(renderer, 'Reason for this correction (required)', 'Fixed my spelling');
    await tap(renderer, 'Save correction');
    await openTool(renderer);
    press(renderer, 'Show tool history');
    const text = renderedText(renderer);
    for (const line of ['Brand: Saln brand', 'Model: Pro drier', 'Replaces the earlier entry that recorded Saln brand, Pro drier, Hair dryer.', 'Reason: Fixed my spelling', 'Brand: Salon brand', 'Model: Pro dryer']) expect(text, line).toContain(line);
    expect(await kinds(userToolId)).toEqual(['baseline', 'correction']);
    const [baseline] = await admin<{ patch: Record<string, unknown> }>(`select patch from public.user_tool_revisions where user_tool_id = $1 and kind = 'baseline'`, [userToolId]);
    expect(baseline.patch).toMatchObject({ manualBrand: 'Saln brand', manualModel: 'Pro drier' });
  });

  it('refuses a correction that changes nothing before any write', async () => {
    await addTool();
    const renderer = await mountTools(USER_A);
    await openTool(renderer);
    await tap(renderer, 'Correct this tool\'s identity');
    typeInto(renderer, 'Reason for this correction (required)', 'No change really');
    const before = await writes();
    press(renderer, 'Save correction');
    await flush(10);
    expect(called).not.toContain('tool_correct');
    expect(await writes()).toBe(before);
  });
});

describe('matching to the catalogue, against the real database', () => {
  it('searches, compares and matches only on explicit confirmation, then reloads the authoritative record', async () => {
    const userToolId = await addTool();
    const renderer = await mountTools(USER_A);
    await openTool(renderer);
    await tap(renderer, 'Match to catalogue');
    const before = await writes();
    await search(renderer, 'pro dryer');
    expect(renderedText(renderer)).toContain('Salon Brand: Pro Dryer');
    await tap(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    expect(renderedText(renderer)).toContain('Brand: the same wording in both.');
    // Searching, choosing and comparing wrote nothing.
    expect(await writes()).toBe(before);
    await tap(renderer, 'Confirm match to this catalogue version');
    expect(renderedText(renderer)).toContain('Linked to a catalogue version. Your own brand, model and type are kept as you recorded them.');
    expect(await kinds(userToolId)).toEqual(['baseline', 'match']);
    const [row] = await admin<{ manual_brand: string; manual_model: string; version_id: string; matched: boolean }>('select manual_brand, manual_model, version_id, matched from public.user_tools');
    expect(row).toEqual({ manual_brand: 'Salon brand', manual_model: 'Pro dryer', version_id: TV_DRYER, matched: true });
    press(renderer, 'Show tool history');
    expect(renderedText(renderer)).toContain('Matched to an exact catalogue version.');
  });

  it('lets a wrong candidate be backed out of and another chosen, with nothing written in between', async () => {
    const userToolId = await addTool();
    const renderer = await mountTools(USER_A);
    await openTool(renderer);
    await tap(renderer, 'Match to catalogue');
    await search(renderer, 'salon brand');
    const before = await writes();
    await tap(renderer, 'Compare with my tool: Salon Brand: Smooth Iron');
    await tap(renderer, 'Back to search results');
    await tap(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    expect(await writes()).toBe(before);
    await tap(renderer, 'Confirm match to this catalogue version');
    const [row] = await admin<{ version_id: string }>('select version_id from public.user_tools where id = $1', [userToolId]);
    expect(row.version_id).toBe(TV_DRYER);
    expect(await kinds(userToolId)).toEqual(['baseline', 'match']);
  });

  it('shows what is published for the matched version and nothing that is not, and never the draft or the reviewer', async () => {
    await addTool();
    const renderer = await mountTools(USER_A);
    await openTool(renderer);
    await tap(renderer, 'Match to catalogue');
    await search(renderer, 'pro dryer');
    await tap(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    await tap(renderer, 'Confirm match to this catalogue version');
    await tap(renderer, 'View catalogue details');
    let text = renderedText(renderer);
    expect(text).toContain('No capabilities are published for this exact version. Nothing is assumed.');
    expect(text).toContain('Your private record (only you can see this)');
    expect(text).toContain('Brand: Salon brand');
    for (const secret of [T_SECRET_CLAIM, T_SECRET_SOURCE, T_SECRET_REVIEWER, REVIEWER, AUTHOR, '2200']) expect(text, secret).not.toContain(secret);
    await tap(renderer, 'Back to your tool');
    await publish(TV_DRYER, 'capabilities');
    await tap(renderer, 'View catalogue details');
    text = renderedText(renderer);
    expect(text).toContain('Power: 2200 watts');
    expect(text).toContain('Highest temperature: Not recorded in the catalogue');
    expect(text).toContain('Heated air: Yes');
    expect(text).not.toContain(T_SECRET_CLAIM);
    expect(text).not.toContain(REVIEWER);
  });

  it('labels a retired match on the list and in the detail, with no successor swapped in', async () => {
    const userToolId = await addTool('Other Co', 'Old press');
    await run('tool_match', { p_operation_id: crypto.randomUUID(), p_user_tool_id: userToolId, p_expected_revision: 1, p_version_id: TV_STEAMER_OLD, p_confirmed: true });
    await publish(TV_STEAMER_OLD, 'successor');
    const renderer = await mountTools(USER_A);
    expect(renderedText(renderer)).toContain('Linked to a retired catalogue version.');
    await openTool(renderer, 'Other Co Old press');
    await tap(renderer, 'View catalogue details');
    const text = renderedText(renderer);
    expect(text).toContain('Version status: retired version. This is an older version, not the current one.');
    expect(text).toContain('A reviewed newer version is listed: Other Co: Steam Press (Reformulated). Your tool stays linked to this version.');
    expect(text).toContain('Version: Original');
    const [row] = await admin<{ version_id: string }>('select version_id from public.user_tools where id = $1', [userToolId]);
    expect(row.version_id).toBe(TV_STEAMER_OLD);
    expect(row.version_id).not.toBe(TV_STEAMER_NEW);
  });
});

describe('archiving and isolation, against the real database', () => {
  it('archives on an explicit choice, appends to the history and never changes an earlier entry', async () => {
    const userToolId = await addTool();
    const renderer = await mountTools(USER_A);
    await openTool(renderer);
    await tap(renderer, 'Archive this tool');
    await tap(renderer, 'Archive tool');
    expect(called).not.toContain('tool_archive');
    press(renderer, 'I confirm I want to archive this tool: Yes, archive it');
    await tap(renderer, 'Archive tool');
    expect(renderedText(renderer)).toContain('No tools recorded yet.');
    expect(await kinds(userToolId)).toEqual(['baseline', 'archive']);
    const detail = await getUserTool(userToolId, true);
    expect(detail).toMatchObject({ availability: 'archived' });
    // The owner holds no write privilege on the history: an entry is only ever appended through the trusted commands.
    await expect(db.query(`update public.user_tool_revisions set kind = 'change' where user_tool_id = $1`, [userToolId])).rejects.toThrow(/permission denied/);
    await expect(db.query(`delete from public.user_tool_revisions where user_tool_id = $1`, [userToolId])).rejects.toThrow(/permission denied/);
    expect(await kinds(userToolId)).toEqual(['baseline', 'archive']);
  });

  it('never gives one owner another owner\'s tool, in the list, the detail or the catalogue context', async () => {
    currentUser = USER_B;
    const theirs = await addTool('Their brand', 'Their dryer');
    currentUser = USER_A;
    const mine = await addTool();
    const renderer = await mountTools(USER_A);
    expect(renderedText(renderer)).toContain('Salon brand Pro dryer');
    expect(renderedText(renderer)).not.toContain('Their dryer');
    const outcome = await getUserTool(theirs, true).then(value => value, (error: Error) => error.message);
    expect(outcome === null || /not-found/.test(String(outcome))).toBe(true);
    await expect(getToolCatalogueDetail({ versionId: TV_DRYER, userToolId: theirs })).rejects.toThrow(/not-found/);
    const general = await getToolCatalogueDetail({ versionId: TV_DRYER });
    expect(general.owner).toBeNull();
    expect(JSON.stringify(general)).not.toContain(mine);
    // The owner switch shows the other owner's tools only.
    currentUser = USER_B;
    await act(async () => { renderer.update(createElement(Tools, { owner: USER_B })); });
    await flush(10);
    expect(renderedText(renderer)).toContain('Their brand Their dryer');
    expect(renderedText(renderer)).not.toContain('Salon brand Pro dryer');
  });

  it('keeps a failed first answer on the device and sends the same command again without a second entry', async () => {
    const renderer = await mountTools(USER_A);
    await tap(renderer, 'Add a tool');
    typeInto(renderer, 'Model', 'Travel iron');
    // The first attempt is lost on the way back: the device keeps the command, and the retry reuses it.
    const original = bridge.run!;
    let lose = true;
    bridge.run = async (name, params) => {
      const result = await original(name, params) as { data: unknown };
      if (lose && name === 'tool_add') { lose = false; return { data: null, error: new Error('Network request failed') }; }
      return result;
    };
    try {
      await tap(renderer, 'Save tool');
      expect(renderedText(renderer)).toContain('The tool could not be saved. Nothing was saved yet.');
      expect(hasPressable(renderer, 'Try saving the tool again')).toBe(true);
      await tap(renderer, 'Try saving the tool again');
    } finally { bridge.run = original; }
    expect((await admin<{ n: string }>('select count(*)::text n from public.user_tools'))[0].n).toBe('1');
    expect((await admin<{ n: string }>('select count(*)::text n from public.user_tool_revisions'))[0].n).toBe('1');
    expect(labelsOf(renderer).some(label => /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(label))).toBe(false);
  });

  it('keeps an unrelated iron out of a dryer\'s match results by name only', async () => {
    await addTool();
    const renderer = await mountTools(USER_A);
    await openTool(renderer);
    await tap(renderer, 'Match to catalogue');
    await search(renderer, 'smooth iron');
    expect(renderedText(renderer)).toContain('Salon Brand: Smooth Iron');
    expect(renderedText(renderer)).not.toContain('Pro Dryer');
    expect(TV_IRON).toBeTruthy();
  });
});
