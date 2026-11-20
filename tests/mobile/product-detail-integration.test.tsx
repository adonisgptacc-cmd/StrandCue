import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { asUser, complete, database, USER_A, USER_B } from '../database/harness.ts';
import {
  CATALOGUE_TABLES, SECRET_CLAIM, SECRET_DIRECTION, SECRET_INGREDIENT, SECRET_SOURCE, id, seedCatalogue,
  V_MASK_RETIRED, V_MASK_SUCCESSOR, V_SHAMPOO_PLAIN, V_SHAMPOO_TRAVEL,
} from '../helpers/catalogue-fixture.ts';
import { flush, hasPressable, labelsOf, press, renderedText, type as typeInto } from '../helpers/native-render';
import { Shelf } from '../../apps/mobile/src/shelf';
import { getUserProduct, recordUserProduct } from '../../apps/mobile/src/shelf-api';
import { getCatalogueProductDetail } from '../../apps/mobile/src/catalogue-detail-api';

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
let loseAnswerOf: string | null = null;
const called: string[] = [];
const REVIEWER = 'Reviewer Rita';
const CLAIM = id(41);
const SOURCE = id(51);

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

async function admin<T extends Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
  await db.exec('set session authorization postgres');
  const rows = (await db.query<T>(sql, values)).rows;
  await asUser(db, currentUser);
  return rows;
}
const writes = async () => (await admin<{ n: string }>(
  `select (select count(*) from public.user_product_revisions)::text || '/' || (select count(*) from strandcue_private.shelf_operations)::text n`))[0].n;

async function publish(version: string, subject: string, claim: string | null = null) {
  // A publication starts as a review of the content as it stands, then is published by a second person.
  await admin(`insert into public.product_publications(version_id, subject, claim_id, state, authored_by) values ($1, $2, $3, 'review', 'Author Ann')`, [version, subject, claim]);
  await admin(`update public.product_publications set state = 'published', reviewed_by = $4, reviewed_at = now(), published_at = now()
    where version_id = $1 and subject = $2 and claim_id is not distinct from $3`, [version, subject, claim, REVIEWER]);
}

async function addManualProduct(): Promise<string> {
  const userProductId = crypto.randomUUID();
  await recordUserProduct({
    operationId: crypto.randomUUID(), userProductId, effectiveDate: { precision: 'day', value: '2026-03-01' }, versionId: null,
    manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo', availability: 'available',
  });
  return userProductId;
}
async function matchTo(userProductId: string, versionId: string, revision = 1) {
  await run('shelf_match', { p_operation_id: crypto.randomUUID(), p_user_product_id: userProductId, p_expected_revision: revision, p_version_id: versionId, p_confirmed: true });
}
async function mountShelf(owner: string): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(Shelf, { owner })); });
  await flush(8);
  return renderer;
}
async function openMatchedDetail(renderer: ReactTestRenderer) {
  press(renderer, 'View product entry: Gentle shampoo');
  await flush(8);
  press(renderer, 'View product details');
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
  await db.exec('alter table public.product_publications disable trigger user; alter table public.product_claim_evidence disable trigger user');
  await db.exec('delete from public.product_claim_evidence; delete from public.product_publications');
  await db.exec('alter table public.product_publications enable trigger user; alter table public.product_claim_evidence enable trigger user');
  for (const table of [...CATALOGUE_TABLES].reverse()) await db.exec(`delete from public.${table}`);
});
afterAll(async () => { await db?.close(); });

describe('product detail against the real database', () => {
  it('lets the owner read a draft-only version, back out, and still match explicitly', async () => {
    const userProductId = await addManualProduct();
    const renderer = await mountShelf(USER_A);
    press(renderer, 'View product entry: Gentle shampoo');
    await flush(8);
    press(renderer, 'Match to catalogue');
    await flush();
    typeInto(renderer, 'Search the catalogue', 'gentle shampoo');
    press(renderer, 'Search catalogue');
    await flush(8);
    press(renderer, 'View product details: House Brand: Gentle Shampoo, barcode 6001234567890');
    await flush(8);
    const text = renderedText(renderer);
    // Identity is shown; every draft section is honestly unpublished, and no draft text leaks.
    expect(text).toContain('Brand: House Brand');
    expect(text).toContain('No published directions are available for this exact version.');
    expect(text).toContain('No reviewed claims are published for this exact version.');
    expect(text).toContain('Ingredients are not published for this exact version.');
    expect(text).not.toContain('Your private record');
    for (const secret of [SECRET_CLAIM, SECRET_INGREDIENT, SECRET_DIRECTION, SECRET_SOURCE]) expect(text).not.toContain(secret);
    expect(await admin('select 1 from public.user_product_revisions')).toHaveLength(1);
    press(renderer, 'Back to search results');
    await flush();
    expect(renderedText(renderer)).toContain('2 catalogue versions found.');
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo, barcode 6001234567890');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(10);
    expect(renderedText(renderer)).toContain('Matched to a catalogue entry (confirmed).');
    expect((await admin<{ kind: string }>('select kind from public.user_product_revisions where user_product_id = $1 order by sequence', [userProductId])).map(row => row.kind)).toEqual(['baseline', 'match']);
  });

  it('shows a matched product its published facts and its own private record, separately', async () => {
    const userProductId = await addManualProduct();
    await matchTo(userProductId, V_SHAMPOO_PLAIN);
    await admin('update public.product_versions set structured_directions = $2::jsonb, ingredients = $3::jsonb where id = $1', [V_SHAMPOO_PLAIN,
      JSON.stringify({ instructions: 'Apply to wet hair.', rinseMode: 'rinse-out', waitMinutes: 2, internalNote: SECRET_DIRECTION }), JSON.stringify({ text: 'Aqua, Keratin' })]);
    await publish(V_SHAMPOO_PLAIN, 'directions');
    await publish(V_SHAMPOO_PLAIN, 'ingredients');
    await publish(V_SHAMPOO_PLAIN, 'claim', CLAIM);
    await admin(`insert into public.product_claim_evidence(claim_id, version_id, source_id, title, publisher, applicability, limitations, state, authored_by)
      values ($1, $2, $3, 'Launch page', 'House Brand', 'This exact version.', 'A promotional statement.', 'review', 'Author Ann')`, [CLAIM, V_SHAMPOO_PLAIN, SOURCE]);
    await admin(`update public.product_claim_evidence set state = 'published', reviewed_by = $1, reviewed_at = now(), published_at = now() where claim_id = $2`, [REVIEWER, CLAIM]);
    const renderer = await mountShelf(USER_A);
    await openMatchedDetail(renderer);
    let text = renderedText(renderer);
    for (const line of ['Directions: Apply to wet hair.', 'Rinse-out or leave-in: Rinse-out', 'Wait time: 2 minutes', 'Aqua, Keratin', 'Your private record', 'Size you recorded: Not provided by you']) expect(text).toContain(line);
    expect(text).not.toContain(SECRET_DIRECTION);
    expect(text).not.toContain(REVIEWER);
    expect(text).not.toContain('Author Ann');
    press(renderer, 'Show evidence and limitations for: Repairs split ends overnight');
    text = renderedText(renderer);
    expect(text).toContain('Kind of source: Marketing statement, not independent evidence');
    expect(text).toContain('Source: Launch page');
    press(renderer, 'Back to your product');
    await flush();
    expect(renderedText(renderer)).toContain('Matched to a catalogue entry (confirmed).');
  });

  it('shows a retired owned version as the historical version it is, with no successor swapped in', async () => {
    const userProductId = await addManualProduct();
    await matchTo(userProductId, V_MASK_RETIRED);
    await publish(V_MASK_RETIRED, 'successor');
    const renderer = await mountShelf(USER_A);
    await openMatchedDetail(renderer);
    const text = renderedText(renderer);
    expect(text).toContain('Version status: retired version. This is a historical version, not the current formulation.');
    expect(text).toContain('A reviewed newer version is listed: Other Co: Deep Mask (Reformulated). Your product stays linked to this version.');
    expect(text).toContain(`Reference code (last 8 characters): ${V_MASK_RETIRED.slice(-8)}`);
    expect(text).not.toContain(`last 8 characters): ${V_MASK_SUCCESSOR.slice(-8)}`);
    expect(hasPressable(renderer, 'Open the newer version')).toBe(false);
  });

  it('never gives one owner another owner’s Shelf facts, nor any stale content', async () => {
    currentUser = USER_B;
    const theirs = await addManualProduct();
    await matchTo(theirs, V_SHAMPOO_PLAIN);
    currentUser = USER_A;
    await expect(getCatalogueProductDetail({ versionId: V_SHAMPOO_PLAIN, userProductId: theirs })).rejects.toThrow(/not-found/);
    const general = await getCatalogueProductDetail({ versionId: V_SHAMPOO_PLAIN });
    expect(general.owner).toBeNull();
    expect(JSON.stringify(general)).not.toContain('Gentle shampoo');
    await expect(getUserProduct(theirs, true)).rejects.toThrow(/not-found/);
    // Owner B still sees their own, and a switch on screen drops everything of owner A.
    currentUser = USER_A;
    const mine = await addManualProduct();
    await matchTo(mine, V_SHAMPOO_PLAIN);
    const renderer = await mountShelf(USER_A);
    await openMatchedDetail(renderer);
    expect(renderedText(renderer)).toContain('Your private record');
    currentUser = USER_B;
    await act(async () => { renderer.update(createElement(Shelf, { owner: USER_B })); });
    await flush(8);
    const text = renderedText(renderer);
    expect(text).not.toContain('Exact catalogue identity');
    expect(text).not.toContain('Your private record');
  });

  it('retries a failed read without changing the Shelf', async () => {
    const userProductId = await addManualProduct();
    await matchTo(userProductId, V_SHAMPOO_PLAIN);
    const before = await writes();
    const renderer = await mountShelf(USER_A);
    press(renderer, 'View product entry: Gentle shampoo');
    await flush(8);
    const mark = called.length;
    loseAnswerOf = 'catalogue_product_detail';
    press(renderer, 'View product details');
    await flush(8);
    expect(renderedText(renderer)).toContain('The product details could not be loaded. Nothing was changed. Try again.');
    expect(renderedText(renderer)).not.toContain('Exact catalogue identity');
    press(renderer, 'Try loading the product details again');
    await flush(8);
    expect(renderedText(renderer)).toContain('Exact catalogue identity');
    expect(await writes()).toBe(before);
    // Every call since the first read was a read: two detail reads, and nothing that writes.
    expect(called.slice(mark)).toEqual(['catalogue_product_detail', 'catalogue_product_detail']);
    expect(labelsOf(renderer)).toContain('Back to your product');
  });

  it('fails safely for a version that does not exist, offering no retry', async () => {
    await expect(getCatalogueProductDetail({ versionId: crypto.randomUUID() })).rejects.toThrow(/not-found/);
    expect((await getCatalogueProductDetail({ versionId: V_SHAMPOO_TRAVEL })).identity.variant).toBe('Travel 50 ml');
  });
});
