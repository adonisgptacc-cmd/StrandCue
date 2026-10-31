import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { asUser, complete, database, USER_A, USER_B } from '../database/harness.ts';
import {
  CATALOGUE_TABLES, seedCatalogue, V_CONDITIONER, V_SHAMPOO_PLAIN, V_SHAMPOO_TRAVEL,
} from '../helpers/catalogue-fixture.ts';
import { flush, labelsOf, press, renderedText, type as typeInto } from '../helpers/native-render';
import { Shelf } from '../../apps/mobile/src/shelf';
import { getUserProduct, recordUserProduct } from '../../apps/mobile/src/shelf-api';

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    HostComponent.displayName = `Mock${tag}`;
    return HostComponent;
  };
  return {
    AccessibilityInfo: { announceForAccessibility: () => undefined },
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
/** When set, the named call runs in the database and then loses its answer, once. */
let loseAnswerOf: string | null = null;
const called: string[] = [];

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
    if (loseAnswerOf === name) {
      loseAnswerOf = null;
      return { data: null, error: new Error('Network request failed') };
    }
    return { data: rows[0].result, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

async function adminRows<T extends Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
  await db.exec('set session authorization postgres');
  const rows = (await db.query<T>(sql, values)).rows;
  await asUser(db, currentUser);
  return rows;
}

const productState = async (userProductId: string) => (await adminRows<{ version_id: string | null; revision: number; manual_name: string }>(
  'select version_id, revision, manual_name from public.user_products where id = $1', [userProductId]))[0];
const revisionKinds = async (userProductId: string) => (await adminRows<{ kind: string; match_version_id: string | null }>(
  'select kind, match_version_id from public.user_product_revisions where user_product_id = $1 order by sequence', [userProductId]));

async function addManualProduct(): Promise<string> {
  const userProductId = crypto.randomUUID();
  await recordUserProduct({
    operationId: crypto.randomUUID(), userProductId, effectiveDate: { precision: 'day', value: '2026-03-01' }, versionId: null,
    manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo', availability: 'available',
  });
  return userProductId;
}

async function mountShelf(owner: string): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(Shelf, { owner })); });
  await flush(8);
  return renderer;
}
async function startMatch(renderer: ReactTestRenderer, words = 'gentle shampoo') {
  press(renderer, 'View product entry: Gentle shampoo');
  await flush(8);
  press(renderer, 'Match to catalogue');
  await flush();
  typeInto(renderer, 'Search the catalogue', words);
  press(renderer, 'Search catalogue');
  await flush(8);
}

beforeAll(async () => {
  db = await database();
  bridge.run = run;
}, 60_000);
beforeEach(async () => {
  currentUser = USER_A; loseAnswerOf = null; called.length = 0; bridge.storage.clear(); bridge.ids = 0;
  await asUser(db, USER_A); await complete(db, 'user_a');
  await asUser(db, USER_B); await complete(db, 'user_b');
  await seedCatalogue(db);
  await asUser(db, USER_A);
});
afterEach(async () => {
  await db.exec('set session authorization postgres');
  await db.exec('truncate public.profiles cascade');
  for (const table of [...CATALOGUE_TABLES].reverse()) await db.exec(`delete from public.${table}`);
});
afterAll(async () => { await db?.close(); });

describe('catalogue matching against the real database', () => {
  it('takes a manual item through search, comparison and explicit confirmation to an auditable match', async () => {
    const userProductId = await addManualProduct();
    const renderer = await mountShelf(USER_A);
    await startMatch(renderer);
    expect(renderedText(renderer)).toContain('House Brand: Gentle Shampoo');
    // Searching changes nothing.
    expect(await productState(userProductId)).toMatchObject({ version_id: null, revision: 1 });
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo, barcode 6001234567890');
    await flush();
    expect(renderedText(renderer)).toContain('Size: Not answered');
    expect(await revisionKinds(userProductId)).toHaveLength(1);
    press(renderer, 'Confirm match to this catalogue version');
    await flush(10);
    const text = renderedText(renderer);
    expect(text).toContain('Matched to a catalogue entry (confirmed). Original manual details kept.');
    expect(await productState(userProductId)).toMatchObject({ version_id: V_SHAMPOO_PLAIN, revision: 2, manual_name: 'Gentle shampoo' });
    expect(await revisionKinds(userProductId)).toEqual([{ kind: 'baseline', match_version_id: null }, { kind: 'match', match_version_id: V_SHAMPOO_PLAIN }]);
    // The audit keeps the original manual record next to the match.
    press(renderer, 'Show product audit');
    expect(renderedText(renderer)).toContain('Original entry');
    expect(renderedText(renderer)).toContain('Catalogue match');
    const detail = await getUserProduct(userProductId, true);
    expect(detail?.revisions[0].patch).toMatchObject({ manualName: 'Gentle shampoo', manualBrand: 'House brand' });
    // No catalogue text, claim or ingredient reached the owner's record.
    const stored = JSON.stringify(await adminRows('select * from public.user_products'));
    for (const canary of ['Repairs split ends overnight', 'secret-ingredient-xyz', 'secret-direction-xyz']) expect(stored).not.toContain(canary);
    expect(bridge.storage.size).toBe(0);
  });

  it('lets the owner pick another candidate after a wrong one, with no mutation in between', async () => {
    const userProductId = await addManualProduct();
    const renderer = await mountShelf(USER_A);
    await startMatch(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo, barcode 6001234567890');
    await flush();
    press(renderer, 'Back to search results');
    await flush();
    expect(await revisionKinds(userProductId)).toHaveLength(1);
    expect(called.filter(name => name === 'shelf_match')).toHaveLength(0);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo (Travel 50 ml)');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(10);
    expect(await revisionKinds(userProductId)).toEqual([{ kind: 'baseline', match_version_id: null }, { kind: 'match', match_version_id: V_SHAMPOO_TRAVEL }]);
  });

  it('retries a match whose answer was lost without a duplicate revision', async () => {
    const userProductId = await addManualProduct();
    const renderer = await mountShelf(USER_A);
    await startMatch(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo, barcode 6001234567890');
    await flush();
    loseAnswerOf = 'shelf_match';
    press(renderer, 'Confirm match to this catalogue version');
    await flush(10);
    expect(renderedText(renderer)).toContain('The match could not be saved. Nothing was linked yet.');
    // The write happened but the answer was lost: the retry replays the same operation.
    expect(await revisionKinds(userProductId)).toHaveLength(2);
    press(renderer, 'Try saving the match again');
    await flush(10);
    expect(await revisionKinds(userProductId)).toHaveLength(2);
    // One ledger row for the manual entry and one for the match, however often it was sent.
    const operations = await adminRows<{ n: string }>('select count(*)::text n from strandcue_private.shelf_operations where user_id = $1', [USER_A]);
    expect(operations[0].n).toBe('2');
    expect(renderedText(renderer)).toContain('Matched to a catalogue entry (confirmed).');
  });

  it('shows the latest entry instead of retrying when the product changed elsewhere', async () => {
    const userProductId = await addManualProduct();
    const renderer = await mountShelf(USER_A);
    await startMatch(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo, barcode 6001234567890');
    await flush();
    // Another device changes the product while the owner is comparing.
    await run('shelf_change', {
      p_operation_id: crypto.randomUUID(), p_user_product_id: userProductId, p_expected_revision: 1,
      p_manual_brand: null, p_manual_name: null, p_manual_category: null, p_availability: 'low', p_notes: null,
      p_effective_date: { precision: 'day', value: '2026-03-02' }, p_facts: {},
    });
    press(renderer, 'Confirm match to this catalogue version');
    await flush(10);
    expect(renderedText(renderer)).toContain('This product changed elsewhere');
    expect(labelsOf(renderer)).not.toContain('Try saving the match again');
    expect(await productState(userProductId)).toMatchObject({ version_id: null, revision: 2 });
    press(renderer, 'Show the latest entry');
    await flush(10);
    expect(renderedText(renderer)).toContain('Manual entry — not matched to the catalogue.');
  });

  it('can rematch later; the earlier match stays in the append-only history', async () => {
    const userProductId = await addManualProduct();
    let renderer = await mountShelf(USER_A);
    await startMatch(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo, barcode 6001234567890');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(10);
    press(renderer, 'Choose a different catalogue match');
    await flush();
    typeInto(renderer, 'Search the catalogue', 'gentle conditioner');
    press(renderer, 'Search catalogue');
    await flush(8);
    press(renderer, 'Compare with my record: House Brand: Gentle Conditioner (Dry hair)');
    await flush();
    expect(renderedText(renderer)).toContain('Category: different. You recorded "Shampoo"; the catalogue lists "Conditioner".');
    press(renderer, 'Confirm match to this catalogue version');
    await flush(10);
    expect(await revisionKinds(userProductId)).toEqual([
      { kind: 'baseline', match_version_id: null },
      { kind: 'match', match_version_id: V_SHAMPOO_PLAIN },
      { kind: 'match', match_version_id: V_CONDITIONER },
    ]);
    expect(await productState(userProductId)).toMatchObject({ manual_name: 'Gentle shampoo', version_id: V_CONDITIONER });
    renderer.unmount();
    renderer = await mountShelf(USER_A);
    expect(renderedText(renderer)).toContain('Gentle shampoo');
  });

  it('keeps one owner away from another owner’s product', async () => {
    currentUser = USER_B;
    const foreignProduct = await addManualProduct();
    currentUser = USER_A;
    const renderer = await mountShelf(USER_A);
    expect(renderedText(renderer)).toContain('Your shelf is empty.');
    expect(renderedText(renderer)).not.toContain('Gentle shampoo');
    await expect(getUserProduct(foreignProduct, true)).rejects.toThrow(/not-found/);
    // A foreign id sent straight to the trusted match command changes nothing.
    const before = await revisionKinds(foreignProduct);
    const refused = await run('shelf_match', {
      p_operation_id: crypto.randomUUID(), p_user_product_id: foreignProduct, p_expected_revision: 1,
      p_version_id: V_SHAMPOO_PLAIN, p_confirmed: true,
    }) as { error: Error | null };
    expect(refused.error?.message).toMatch(/not-found|revision-conflict/);
    expect(await revisionKinds(foreignProduct)).toEqual(before);
    expect(await productState(foreignProduct)).toMatchObject({ version_id: null, revision: 1 });
    // The owner of the product still sees only their own record.
    currentUser = USER_B;
    const own = await mountShelf(USER_B);
    expect(renderedText(own)).toContain('Gentle shampoo');
  });

  it('clears the search and the pending selection when the owner switches', async () => {
    await addManualProduct();
    const renderer = await mountShelf(USER_A);
    await startMatch(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo, barcode 6001234567890');
    await flush();
    currentUser = USER_B;
    await act(async () => { renderer.update(createElement(Shelf, { owner: USER_B })); });
    await flush(8);
    const text = renderedText(renderer);
    expect(text).not.toContain('House Brand: Gentle Shampoo');
    expect(text).not.toContain('Compare with your record');
    expect(text).toContain('Your shelf is empty.');
    expect(called.filter(name => name === 'shelf_match')).toHaveLength(0);
  });
});
