import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';
import { clearToolCatalogue, seedToolCatalogue, TV_DRYER, TV_IRON, TV_STEAMER_OLD, tid } from '../helpers/tool-catalogue-fixture.ts';

const DAY = { precision: 'day', value: '2026-03-01' };
const HEAT_AIR = { state: 'recorded', methods: ['heated-air'] };
const UNHEATED = { state: 'recorded', methods: ['unheated'] };
const SETTINGS = { state: 'recorded', items: [{ label: 'Low', temperature: null }, { label: 'Plate 2', temperature: { value: 350, unit: 'F' } }] };

const call = async (db: PGlite, sql: string, values: unknown[]) => (await db.query<{ result: any }>(sql, values)).rows[0].result;
const toolAdd = (db: PGlite, o: { operationId?: string; userToolId?: string; availability?: string; facts?: unknown } = {}) => call(db,
  `select public.tool_add($1, $2, $3, $4::jsonb, $5::jsonb) result`,
  [o.operationId ?? crypto.randomUUID(), o.userToolId ?? crypto.randomUUID(), o.availability ?? 'available', JSON.stringify(DAY),
    JSON.stringify(o.facts ?? { manualBrand: 'Salon Brand', manualModel: 'Pro Dryer', toolType: 'dryer' })]);
const toolChange = (db: PGlite, o: { operationId?: string; userToolId: string; expectedRevision: number; availability?: string | null; facts?: unknown }) => call(db,
  `select public.tool_change($1, $2, $3, $4, $5::jsonb, $6::jsonb) result`,
  [o.operationId ?? crypto.randomUUID(), o.userToolId, o.expectedRevision, o.availability ?? null, JSON.stringify(DAY), JSON.stringify(o.facts ?? {})]);
const toolCorrect = (db: PGlite, o: { operationId?: string; userToolId: string; expectedRevision: number; correctsId: string; reason?: string | null; facts?: unknown }) => call(db,
  `select public.tool_correct($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb) result`,
  [o.operationId ?? crypto.randomUUID(), o.userToolId, o.expectedRevision, o.correctsId, o.reason === undefined ? 'typo' : o.reason, JSON.stringify(DAY), JSON.stringify(o.facts ?? {})]);
const toolMatch = (db: PGlite, operationId: string, userToolId: string, revision: number, versionId: string, confirmed = true) => call(db,
  `select public.tool_match($1, $2, $3, $4, $5) result`, [operationId, userToolId, revision, versionId, confirmed]);
const toolHistory = (db: PGlite, userToolId: string) => call(db, `select public.tool_history($1, true) result`, [userToolId]);

// The caller the test is acting as, restored after every administrative read.
const acting = { user: USER_A };
async function admin<T extends Record<string, any>>(db: PGlite, sql: string, values: unknown[] = []): Promise<T[]> {
  await db.exec('set session authorization postgres');
  try { return (await db.query<T>(sql, values)).rows; } finally { await asUser(db, acting.user); }
}
const counts = async (db: PGlite) => (await admin<{ n: string }>(db,
  `select (select count(*) from public.user_tools)::text || '/' || (select count(*) from public.user_tool_revisions)::text || '/' || (select count(*) from strandcue_private.tool_operations)::text n`))[0].n;
const row = async (db: PGlite, id: string) => (await admin<Record<string, any>>(db, 'select * from public.user_tools where id = $1', [id]))[0];

describe('owner tool facts and the append-only boundary', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { acting.user = USER_A; await asUser(db, USER_A); await complete(db, 'user_a'); await seedToolCatalogue(db); await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await clearToolCatalogue(db);
  });
  afterAll(async () => { await db?.close(); });

  describe('recording', () => {
    it('records identity and every owner fact exactly as entered, in the unit entered', async () => {
      const receipt = await toolAdd(db, { facts: {
        manualBrand: 'Salon Brand', manualModel: 'Pro Dryer', toolType: 'dryer', wattageWatts: 2200, adjustableTemp: 'unknown', settings: SETTINGS,
        attachments: { state: 'recorded', items: [{ kind: 'diffuser' }, { kind: 'other', other: 'Travel pouch' }] }, condition: 'worn', heatMethods: HEAT_AIR, notes: 'Mine',
      } });
      expect(receipt.revision).toBe(1);
      const detail = await toolHistory(db, receipt.userToolId);
      expect(detail).toMatchObject({ manualBrand: 'Salon Brand', manualModel: 'Pro Dryer', toolType: 'dryer', wattageWatts: 2200, adjustableTemp: 'unknown', condition: 'worn', notes: 'Mine', matched: false });
      // The owner's unit is kept: 350 F is stored as 350 F, never converted.
      expect(detail.settings).toEqual(SETTINGS);
      expect(detail.heatMethods).toEqual(HEAT_AIR);
      expect(detail.attachments.items).toEqual([{ kind: 'diffuser' }, { kind: 'other', other: 'Travel pouch' }]);
      expect(detail.revisions).toHaveLength(1);
      expect(detail.revisions[0]).toMatchObject({ kind: 'baseline' });
      expect(detail.revisions[0].patch).toMatchObject({ manualModel: 'Pro Dryer', wattageWatts: 2200, condition: 'worn' });
    });

    it('keeps a known wattage with an unknown temperature exactly that', async () => {
      const receipt = await toolAdd(db, { facts: { manualModel: 'Quiet dryer', wattageWatts: 1800, adjustableTemp: 'unknown', heatMethods: HEAT_AIR } });
      const detail = await toolHistory(db, receipt.userToolId);
      expect(detail.wattageWatts).toBe(1800);
      expect(detail.settings).toBeNull();
      expect(detail.adjustableTemp).toBe('unknown');
      expect(JSON.stringify(detail)).not.toMatch(/temperature|celsius|°/i);
    });

    it('keeps unknown, none, absent and cleared apart', async () => {
      const receipt = await toolAdd(db, { facts: { manualModel: 'M', attachments: { state: 'none' }, settings: { state: 'unknown' }, heatMethods: { state: 'unknown' }, condition: 'unknown' } });
      let detail = await toolHistory(db, receipt.userToolId);
      expect(detail).toMatchObject({ attachments: { state: 'none' }, settings: { state: 'unknown' }, heatMethods: { state: 'unknown' }, condition: 'unknown', wattageWatts: null });
      // Absent keeps, null clears, a value replaces.
      await toolChange(db, { userToolId: receipt.userToolId, expectedRevision: 1, facts: { condition: 'good' } });
      detail = await toolHistory(db, receipt.userToolId);
      expect(detail).toMatchObject({ condition: 'good', attachments: { state: 'none' } });
      await toolChange(db, { userToolId: receipt.userToolId, expectedRevision: 2, facts: { attachments: null } });
      detail = await toolHistory(db, receipt.userToolId);
      expect(detail.attachments).toBeNull();
      expect(detail.condition).toBe('good');
      const change = detail.revisions.at(-1);
      expect(change.kind).toBe('change');
      expect(change.patch).toEqual({ attachments: null });
    });

    it('stores a whole wattage written with a trailing zero, instead of failing with a raw cast error', async () => {
      const userToolId = crypto.randomUUID();
      const receipt = await call(db, `select public.tool_add($1, $2, 'available', $3::jsonb, '{"manualModel":"Raw","wattageWatts":1500.0}'::jsonb) result`,
        [crypto.randomUUID(), userToolId, JSON.stringify(DAY)]);
      expect(receipt.revision).toBe(1);
      expect((await toolHistory(db, userToolId)).wattageWatts).toBe(1500);
    });

    it('refuses invalid answers with stable codes, and writes nothing', async () => {
      const bad: [string, unknown][] = [
        ['invalid-wattage', { wattageWatts: 0 }], ['invalid-wattage', { wattageWatts: 10001 }], ['invalid-wattage', { wattageWatts: 2200.5 }], ['invalid-wattage', { wattageWatts: '2200' }],
        ['invalid-adjustable-temperature', { adjustableTemp: 'maybe' }], ['invalid-condition', { condition: 'safe' }], ['invalid-condition', { condition: 'certified' }],
        ['invalid-settings', { settings: { state: 'recorded', items: [{ label: 'High', temperature: { value: 180, unit: 'K' } }] } }],
        ['invalid-settings', { settings: { state: 'recorded', items: [{ label: 'High', temperature: { value: 301, unit: 'C' } }] } }],
        ['invalid-settings', { settings: { state: 'recorded', items: [{ label: 'High', temperature: { value: 85, unit: 'F' } }] } }],
        ['invalid-settings', { settings: { state: 'recorded', items: [{ label: 'High', temperature: { value: 180.5, unit: 'C' } }] } }],
        ['invalid-settings', { settings: { state: 'recorded', items: [{ label: 'High', temperature: { value: 180 } }] } }],
        ['invalid-settings', { settings: { state: 'recorded', items: [{ label: 'Low', temperature: null }, { label: 'Low', temperature: null }] } }],
        ['invalid-settings', { settings: { state: 'recorded', items: Array.from({ length: 11 }, (_, n) => ({ label: `S${n}`, temperature: null })) } }],
        ['invalid-settings', { settings: { state: 'recorded', items: [{ label: 'x'.repeat(61), temperature: null }] } }],
        ['invalid-settings', { settings: { state: 'unknown', items: [] } }],
        ['invalid-attachments', { attachments: { state: 'recorded', items: [{ kind: 'comb' }, { kind: 'diffuser' }] } }],
        ['invalid-attachments', { attachments: { state: 'recorded', items: [{ kind: 'comb' }, { kind: 'comb' }] } }],
        ['invalid-attachments', { attachments: { state: 'recorded', items: [{ kind: 'other' }] } }],
        ['invalid-attachments', { attachments: { state: 'recorded', items: [{ kind: 'diffuser', other: 'finger' }] } }],
        ['invalid-attachments', { attachments: { state: 'recorded', items: [{ kind: 'heater' }] } }],
        ['invalid-attachments', { attachments: { state: 'none', items: [] } }],
        ['invalid-heat-methods', { heatMethods: { state: 'recorded', methods: ['steam', 'heated-air'] } }],
        ['invalid-heat-methods', { heatMethods: { state: 'recorded', methods: ['heated-air', 'unheated'] } }],
        ['invalid-heat-methods', { heatMethods: { state: 'recorded', methods: ['diffuser'] } }],
        ['invalid-heat-methods', { heatMethods: { state: 'recorded', methods: [] } }],
        ['invalid-heat-methods', { heatMethods: { state: 'unknown', methods: ['steam'] } }],
        ['invalid-facts', { temperature: 200 }], ['invalid-facts', { contactHeat: 'yes' }], ['invalid-facts', { safeTemperature: 180 }],
        ['invalid-notes', { notes: 'x'.repeat(2001) }], ['invalid-tool-type', { toolType: 'toaster' }], ['invalid-brand', { manualBrand: ' ' }],
      ];
      const before = await counts(db);
      for (const [code, facts] of bad) {
        await expect(toolAdd(db, { facts: { manualModel: 'M', ...(facts as object) } }), code).rejects.toThrow(new RegExp(code));
      }
      expect(await counts(db)).toBe(before);
    });

    it('refuses an unheated tool that states a temperature, from both sides, and never repairs it', async () => {
      await expect(toolAdd(db, { facts: { manualModel: 'M', heatMethods: UNHEATED, adjustableTemp: 'yes' } })).rejects.toThrow(/invalid-heat-combination/);
      await expect(toolAdd(db, { facts: { manualModel: 'M', heatMethods: UNHEATED, settings: SETTINGS } })).rejects.toThrow(/invalid-heat-combination/);
      const unheated = await toolAdd(db, { facts: { manualModel: 'Comb', heatMethods: UNHEATED, settings: { state: 'recorded', items: [{ label: 'Wide', temperature: null }] }, adjustableTemp: 'no' } });
      await expect(toolChange(db, { userToolId: unheated.userToolId, expectedRevision: 1, facts: { adjustableTemp: 'yes' } })).rejects.toThrow(/invalid-heat-combination/);
      await expect(toolChange(db, { userToolId: unheated.userToolId, expectedRevision: 1, facts: { settings: SETTINGS } })).rejects.toThrow(/invalid-heat-combination/);
      const heated = await toolAdd(db, { facts: { manualModel: 'Iron', heatMethods: HEAT_AIR, adjustableTemp: 'yes', settings: SETTINGS } });
      await expect(toolChange(db, { userToolId: heated.userToolId, expectedRevision: 1, facts: { heatMethods: UNHEATED } })).rejects.toThrow(/invalid-heat-combination/);
      expect((await row(db, heated.userToolId)).revision).toBe(1);
      expect((await row(db, unheated.userToolId)).heat_methods).toEqual(UNHEATED);
    });

    it('treats a diffuser as an attachment and steam, hooded and air as distinct methods', async () => {
      const receipt = await toolAdd(db, { facts: { manualModel: 'Diffuser', toolType: 'diffuser', attachments: { state: 'recorded', items: [{ kind: 'diffuser' }] } } });
      const detail = await toolHistory(db, receipt.userToolId);
      expect(detail.heatMethods).toBeNull();
      expect(detail.toolType).toBe('diffuser');
      const multi = await toolAdd(db, { facts: { manualModel: 'Steamer dryer', heatMethods: { state: 'recorded', methods: ['heated-air', 'hooded', 'steam'] } } });
      expect((await toolHistory(db, multi.userToolId)).heatMethods.methods).toEqual(['heated-air', 'hooded', 'steam']);
    });

    it('treats injection-shaped text as data', async () => {
      const text = "x'); drop table public.user_tools; --";
      const receipt = await toolAdd(db, { facts: { manualBrand: text, manualModel: text, notes: text, settings: { state: 'recorded', items: [{ label: text.slice(0, 40), temperature: null }] } } });
      expect((await toolHistory(db, receipt.userToolId)).manualModel).toBe(text);
      expect((await admin(db, 'select count(*)::int n from public.user_tools'))[0].n).toBe(1);
    });

    it('needs a model for a manual tool and writes the facts as one revision', async () => {
      await expect(toolAdd(db, { facts: { manualBrand: 'Only a brand' } })).rejects.toThrow(/invalid-tool/);
      await expect(toolAdd(db, { facts: { manualModel: null } })).rejects.toThrow(/invalid-tool/);
      const receipt = await toolAdd(db, { facts: { manualModel: 'M', condition: 'good' } });
      expect((await admin(db, 'select count(*)::int n from public.user_tool_revisions where user_tool_id = $1', [receipt.userToolId]))[0].n).toBe(1);
    });

    it('refuses availability states outside the contract', async () => {
      await expect(toolAdd(db, { availability: 'sold' })).rejects.toThrow(/invalid-availability/);
      const receipt = await toolAdd(db, { availability: 'out_of_stock' });
      expect((await toolHistory(db, receipt.userToolId)).availability).toBe('out_of_stock');
    });
  });

  describe('editing owner facts', () => {
    it('appends a change, keeps the identity, and refuses identity through a change', async () => {
      const receipt = await toolAdd(db);
      const changed = await toolChange(db, { userToolId: receipt.userToolId, expectedRevision: 1, availability: 'out_of_stock', facts: { condition: 'damaged', notes: 'Cable frayed' } });
      expect(changed.revision).toBe(2);
      const detail = await toolHistory(db, receipt.userToolId);
      expect(detail).toMatchObject({ manualModel: 'Pro Dryer', condition: 'damaged', notes: 'Cable frayed', availability: 'out_of_stock' });
      expect(detail.revisions.map((r: any) => r.kind)).toEqual(['baseline', 'change']);
      // The original entry is untouched in the history.
      expect(detail.revisions[0].patch).toMatchObject({ manualModel: 'Pro Dryer', availability: 'available' });
      for (const facts of [{ manualBrand: 'x' }, { manualModel: 'x' }, { toolType: 'flat-iron' }]) {
        await expect(toolChange(db, { userToolId: receipt.userToolId, expectedRevision: 2, facts })).rejects.toThrow(/invalid-identity/);
      }
    });

    it('records an archive change as the archive event', async () => {
      const receipt = await toolAdd(db);
      await toolChange(db, { userToolId: receipt.userToolId, expectedRevision: 1, availability: 'archived' });
      expect((await toolHistory(db, receipt.userToolId)).revisions.map((r: any) => r.kind)).toEqual(['baseline', 'archive']);
    });

    it('is idempotent for an identical retry and conflicts on a reused operation id with another payload', async () => {
      const receipt = await toolAdd(db);
      const operationId = crypto.randomUUID();
      const first = await toolChange(db, { operationId, userToolId: receipt.userToolId, expectedRevision: 1, facts: { condition: 'worn' } });
      expect(await toolChange(db, { operationId, userToolId: receipt.userToolId, expectedRevision: 1, facts: { condition: 'worn' } })).toEqual(first);
      expect((await row(db, receipt.userToolId)).revision).toBe(2);
      await expect(toolChange(db, { operationId, userToolId: receipt.userToolId, expectedRevision: 1, facts: { condition: 'damaged' } })).rejects.toThrow(/operation-conflict/);
      const before = await counts(db);
      await expect(toolChange(db, { userToolId: receipt.userToolId, expectedRevision: 1, facts: { condition: 'good' } })).rejects.toThrow(/revision-conflict/);
      expect(await counts(db)).toBe(before);
    });

    it('does not consume an operation id when the operation is refused', async () => {
      const receipt = await toolAdd(db);
      const operationId = crypto.randomUUID();
      await expect(toolChange(db, { operationId, userToolId: receipt.userToolId, expectedRevision: 1, facts: { condition: 'safe' } })).rejects.toThrow(/invalid-condition/);
      expect((await admin(db, 'select count(*)::int n from strandcue_private.tool_operations where operation_id = $1', [operationId]))[0].n).toBe(0);
      const ok = await toolChange(db, { operationId, userToolId: receipt.userToolId, expectedRevision: 1, facts: { condition: 'worn' } });
      expect(ok.revision).toBe(2);
    });
  });

  describe('identity corrections', () => {
    it('appends a correction that replaces the identity, and the original stays readable', async () => {
      const receipt = await toolAdd(db, { facts: { manualBrand: 'Salon Brnad', manualModel: 'Pro Dryer', toolType: 'dryer', condition: 'good' } });
      const target = (await toolHistory(db, receipt.userToolId)).revisions[0].id;
      const corrected = await toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 1, correctsId: target, reason: 'Misspelled the brand', facts: { manualBrand: 'Salon Brand' } });
      expect(corrected.revision).toBe(2);
      const detail = await toolHistory(db, receipt.userToolId);
      expect(detail.manualBrand).toBe('Salon Brand');
      expect(detail.condition).toBe('good');
      expect(detail.revisions.map((r: any) => r.kind)).toEqual(['baseline', 'correction']);
      expect(detail.revisions[0].patch).toMatchObject({ manualBrand: 'Salon Brnad' });
      expect(detail.revisions[1]).toMatchObject({ correctsId: target, correctionReason: 'Misspelled the brand' });
      expect(detail.revisions[1].patch).toEqual({ manualBrand: 'Salon Brand' });
    });

    it('refuses a no-op, trims words, never folds case, and writes nothing for a refusal', async () => {
      const receipt = await toolAdd(db);
      const target = (await toolHistory(db, receipt.userToolId)).revisions[0].id;
      const before = await counts(db);
      for (const facts of [{ manualModel: 'Pro Dryer' }, { manualModel: '  Pro Dryer ' }, { manualBrand: 'Salon Brand', toolType: 'dryer' }]) {
        await expect(toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 1, correctsId: target, facts })).rejects.toThrow(/invalid-correction-noop/);
      }
      expect(await counts(db)).toBe(before);
      await toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 1, correctsId: target, facts: { manualModel: 'pro dryer' } });
      expect((await row(db, receipt.userToolId)).manual_model).toBe('pro dryer');
    });

    it('cannot be made valid by an unrelated fact, and needs an identity key and a reason', async () => {
      const receipt = await toolAdd(db);
      const target = (await toolHistory(db, receipt.userToolId)).revisions[0].id;
      await expect(toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 1, correctsId: target, facts: { condition: 'worn', notes: 'x' } })).rejects.toThrow(/invalid-correction/);
      await expect(toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 1, correctsId: target, facts: { manualModel: 'x', condition: 'worn' }, reason: '  ' })).rejects.toThrow(/invalid-correction/);
      await expect(toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 1, correctsId: target, facts: { manualModel: 'x' }, reason: null })).rejects.toThrow(/invalid-correction/);
      expect((await row(db, receipt.userToolId)).revision).toBe(1);
    });

    it('may carry related facts along with a real identity change', async () => {
      const receipt = await toolAdd(db);
      const target = (await toolHistory(db, receipt.userToolId)).revisions[0].id;
      await toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 1, correctsId: target, facts: { toolType: 'flat-iron', condition: 'worn' } });
      expect(await row(db, receipt.userToolId)).toMatchObject({ tool_type: 'flat-iron', condition: 'worn' });
    });

    it('names only the revision that carries the identity, and only once', async () => {
      const receipt = await toolAdd(db);
      const baseline = (await toolHistory(db, receipt.userToolId)).revisions[0].id;
      await toolChange(db, { userToolId: receipt.userToolId, expectedRevision: 1, facts: { condition: 'worn' } });
      await toolMatch(db, crypto.randomUUID(), receipt.userToolId, 2, TV_DRYER);
      const history = (await toolHistory(db, receipt.userToolId)).revisions;
      for (const revision of history.slice(1)) {
        await expect(toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 3, correctsId: revision.id, facts: { manualModel: 'x' } })).rejects.toThrow(/invalid-correction-target/);
      }
      await expect(toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 3, correctsId: crypto.randomUUID(), facts: { manualModel: 'x' } })).rejects.toThrow(/correction-target-not-found/);
      await toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 3, correctsId: baseline, facts: { manualModel: 'Pro Dryer 2' } });
      await expect(toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 4, correctsId: baseline, facts: { manualModel: 'Pro Dryer 3' } })).rejects.toThrow(/already-corrected/);
    });

    it('refuses an availability change and a version link through a correction', async () => {
      const receipt = await toolAdd(db);
      const target = (await toolHistory(db, receipt.userToolId)).revisions[0].id;
      await expect(db.query(`select public.tool_correct($1, $2, 1, $3, 'r', $4::jsonb, $5::jsonb)`, [crypto.randomUUID(), receipt.userToolId, target, JSON.stringify(DAY), JSON.stringify({ manualModel: 'x', availability: 'archived' })])).rejects.toThrow(/invalid-facts/);
      await expect(db.query(`select strandcue_private.mutate_user_tool($1, $2, 1, 'correction', $3, null, $4::jsonb, $5, 'r', null, $6::jsonb)`, [crypto.randomUUID(), receipt.userToolId, TV_DRYER, JSON.stringify(DAY), target, JSON.stringify({ manualModel: 'x' })])).rejects.toThrow(/invalid-correction/);
      await expect(db.query(`select strandcue_private.mutate_user_tool($1, $2, 1, 'correction', null, 'archived', $3::jsonb, $4, 'r', null, $5::jsonb)`, [crypto.randomUUID(), receipt.userToolId, JSON.stringify(DAY), target, JSON.stringify({ manualModel: 'x' })])).rejects.toThrow(/invalid-correction/);
    });

    it('can clear an identity part that was recorded, but not leave a manual tool with no model', async () => {
      const receipt = await toolAdd(db);
      const target = (await toolHistory(db, receipt.userToolId)).revisions[0].id;
      await toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 1, correctsId: target, facts: { manualBrand: null } });
      expect((await row(db, receipt.userToolId)).manual_brand).toBeNull();
      const second = (await toolHistory(db, receipt.userToolId)).revisions[1].id;
      await expect(toolCorrect(db, { userToolId: receipt.userToolId, expectedRevision: 2, correctsId: second, facts: { manualModel: null } })).rejects.toThrow(/invalid-tool/);
    });
  });

  describe('matching and archiving', () => {
    it('needs explicit confirmation, appends a match and keeps the manual identity and facts', async () => {
      const receipt = await toolAdd(db, { facts: { manualBrand: 'Mine', manualModel: 'My guess', toolType: 'dryer', wattageWatts: 2000, condition: 'worn' } });
      const before = await counts(db);
      await expect(toolMatch(db, crypto.randomUUID(), receipt.userToolId, 1, TV_DRYER, false)).rejects.toThrow(/confirmation-required/);
      await expect(toolMatch(db, crypto.randomUUID(), receipt.userToolId, 1, tid(999))).rejects.toThrow(/version-not-found/);
      expect(await counts(db)).toBe(before);
      const matched = await toolMatch(db, crypto.randomUUID(), receipt.userToolId, 1, TV_DRYER);
      expect(matched.revision).toBe(2);
      const detail = await toolHistory(db, receipt.userToolId);
      expect(detail).toMatchObject({ matched: true, matchConfirmed: true, versionId: TV_DRYER, manualBrand: 'Mine', manualModel: 'My guess', wattageWatts: 2000, condition: 'worn' });
      expect(detail.revisions.map((r: any) => r.kind)).toEqual(['baseline', 'match']);
      expect(detail.revisions[0].patch).toMatchObject({ manualModel: 'My guess' });
      // Selecting a version never gives the tool a catalogue capability or temperature.
      expect(detail.settings).toBeNull();
      expect(detail.heatMethods).toBeNull();
      expect(detail.adjustableTemp).toBeNull();
    });

    it('replays an identical match, conflicts on another payload, and fails on a stale revision', async () => {
      const receipt = await toolAdd(db);
      const operationId = crypto.randomUUID();
      const first = await toolMatch(db, operationId, receipt.userToolId, 1, TV_DRYER);
      expect(await toolMatch(db, operationId, receipt.userToolId, 1, TV_DRYER)).toEqual(first);
      expect((await toolHistory(db, receipt.userToolId)).revisions).toHaveLength(2);
      await expect(toolMatch(db, operationId, receipt.userToolId, 1, TV_IRON)).rejects.toThrow(/operation-conflict/);
      const before = await counts(db);
      await expect(toolMatch(db, crypto.randomUUID(), receipt.userToolId, 1, TV_IRON)).rejects.toThrow(/revision-conflict/);
      expect(await counts(db)).toBe(before);
    });

    it('lets the owner rematch later, appending, and a retired exact version stays matchable', async () => {
      const receipt = await toolAdd(db);
      await toolMatch(db, crypto.randomUUID(), receipt.userToolId, 1, TV_STEAMER_OLD);
      await toolMatch(db, crypto.randomUUID(), receipt.userToolId, 2, TV_DRYER);
      const detail = await toolHistory(db, receipt.userToolId);
      expect(detail.revisions.map((r: any) => [r.kind, r.matchVersionId])).toEqual([['baseline', null], ['match', TV_STEAMER_OLD], ['match', TV_DRYER]]);
      expect(detail.versionId).toBe(TV_DRYER);
      expect(detail.manualModel).toBe('Pro Dryer');
    });

    it('refuses facts and a link anywhere but the match, from the core as well', async () => {
      const receipt = await toolAdd(db);
      await expect(db.query(`select strandcue_private.mutate_user_tool($1, $2, 1, 'match', $3, null, $4::jsonb, null, null, true, $5::jsonb)`, [crypto.randomUUID(), receipt.userToolId, TV_DRYER, JSON.stringify(DAY), JSON.stringify({ condition: 'good' })])).rejects.toThrow(/invalid-facts/);
      for (const kind of ['change', 'archive']) {
        await expect(db.query(`select strandcue_private.mutate_user_tool($1, $2, 1, $3, $4, null, $5::jsonb, null, null, null, '{}'::jsonb)`, [crypto.randomUUID(), receipt.userToolId, kind, TV_DRYER, JSON.stringify(DAY)])).rejects.toThrow(/invalid-(change|archive)/);
      }
      await expect(db.query(`select strandcue_private.mutate_user_tool($1, $2, 0, 'baseline', $3, null, $4::jsonb, null, null, null, $5::jsonb)`, [crypto.randomUUID(), crypto.randomUUID(), TV_DRYER, JSON.stringify(DAY), JSON.stringify({ manualModel: 'x' })])).rejects.toThrow(/invalid-tool/);
      expect((await toolHistory(db, receipt.userToolId)).matched).toBe(false);
    });

    it('archives rather than deleting, and the history stays readable', async () => {
      const receipt = await toolAdd(db);
      const archived = await call(db, `select public.tool_archive($1, $2, 1) result`, [crypto.randomUUID(), receipt.userToolId]);
      expect(archived.revision).toBe(2);
      const detail = await toolHistory(db, receipt.userToolId);
      expect(detail.availability).toBe('archived');
      expect(detail.revisions.map((r: any) => r.kind)).toEqual(['baseline', 'archive']);
      expect((await call(db, `select public.tool_list(25, null) result`, [])).items).toEqual([]);
      await expect(db.query('select 1 from public.user_tool_revisions where false')).resolves.toBeTruthy();
    });
  });

  describe('listing and isolation', () => {
    it('lists the owner tools newest first with a small summary and a cursor', async () => {
      const first = await toolAdd(db, { facts: { manualBrand: 'A', manualModel: 'First', toolType: 'dryer', condition: 'good', heatMethods: HEAT_AIR } });
      await toolAdd(db, { facts: { manualModel: 'Second' } });
      const page = await call(db, `select public.tool_list(1, null) result`, []);
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeTruthy();
      const next = await call(db, `select public.tool_list(5, $1::jsonb) result`, [JSON.stringify(page.nextCursor)]);
      expect(next.items[0]).toMatchObject({ id: first.userToolId, manualModel: 'First', manualBrand: 'A', toolType: 'dryer', condition: 'good', heatMethods: HEAT_AIR, matched: false });
      expect(Object.keys(next.items[0]).sort()).toEqual(['availability', 'catalogueLifecycle', 'condition', 'heatMethods', 'id', 'manualBrand', 'manualModel', 'matched', 'revision', 'toolType']);
      expect(next.items[0].catalogueLifecycle).toBeNull();
      await expect(call(db, `select public.tool_list(0, null) result`, [])).rejects.toThrow(/invalid-page/);
      await expect(call(db, `select public.tool_list(5, '{"id":1}'::jsonb) result`, [])).rejects.toThrow(/invalid-cursor/);
    });

    it('tells the list whether a matched version is retired, and nothing else about the catalogue', async () => {
      const retired = await toolAdd(db, { facts: { manualModel: 'Old steamer' } });
      await toolMatch(db, crypto.randomUUID(), retired.userToolId, 1, TV_STEAMER_OLD);
      const current = await toolAdd(db, { facts: { manualModel: 'New dryer' } });
      await toolMatch(db, crypto.randomUUID(), current.userToolId, 1, TV_DRYER);
      const { items } = await call(db, `select public.tool_list(25, null) result`, []);
      const byId = Object.fromEntries(items.map((item: any) => [item.id, item]));
      expect(byId[retired.userToolId]).toMatchObject({ matched: true, catalogueLifecycle: 'retired' });
      expect(byId[current.userToolId]).toMatchObject({ matched: true, catalogueLifecycle: 'active' });
      const text = JSON.stringify(items);
      for (const draft of ['wattage', 'temperature', 'contact', '2200', 'successor']) expect(text).not.toContain(draft);
    });

    it('keeps one owner away from another owner tool for every command', async () => {
      const mine = await toolAdd(db, { facts: { manualModel: 'Mine' } });
      const target = (await toolHistory(db, mine.userToolId)).revisions[0].id;
      await asUser(db, USER_B);
      acting.user = USER_B;
      await complete(db, 'user_b');
      const before = await counts(db);
      await expect(toolHistory(db, mine.userToolId)).rejects.toThrow(/not-found/);
      await expect(toolChange(db, { userToolId: mine.userToolId, expectedRevision: 1, facts: { condition: 'worn' } })).rejects.toThrow(/not-found|revision-conflict/);
      await expect(toolCorrect(db, { userToolId: mine.userToolId, expectedRevision: 1, correctsId: target, facts: { manualModel: 'x' } })).rejects.toThrow(/not-found|revision-conflict/);
      await expect(toolMatch(db, crypto.randomUUID(), mine.userToolId, 1, TV_DRYER)).rejects.toThrow(/not-found|revision-conflict/);
      await expect(call(db, `select public.tool_archive($1, $2, 1) result`, [crypto.randomUUID(), mine.userToolId])).rejects.toThrow(/not-found|revision-conflict/);
      expect((await call(db, `select public.tool_list(25, null) result`, [])).items).toEqual([]);
      // Taking another owner's id for a new tool is answered as not found, and discloses nothing.
      await expect(toolAdd(db, { userToolId: mine.userToolId })).rejects.toThrow(/not-found|revision-conflict/);
      expect(await counts(db)).toBe(before);
      acting.user = USER_A;
      await asUser(db, USER_A);
      expect(await row(db, mine.userToolId)).toMatchObject({ manual_model: 'Mine', revision: 1 });
    });
  });

  describe('table and function guards', () => {
    it('holds the same rules in the table, so a direct write cannot slip a bad answer in', async () => {
      const receipt = await toolAdd(db);
      for (const [column, value] of [
        ['wattage_watts', '0'], ['adjustable_temp', "'maybe'"], ['condition', "'safe'"],
        ['settings', `'{"state":"recorded","items":[{"label":"A","temperature":{"value":10,"unit":"C"}}]}'::jsonb`],
        ['attachments', `'{"state":"recorded","items":[{"kind":"diffuser"},{"kind":"diffuser"}]}'::jsonb`],
        ['heat_methods', `'{"state":"recorded","methods":["heated-air","unheated"]}'::jsonb`],
      ]) {
        await expect(admin(db, `update public.user_tools set ${column} = ${value} where id = $1`, [receipt.userToolId]), column).rejects.toThrow(/violates check constraint/);
      }
    });

    it('verifies grants and function metadata', async () => {
      const meta = await admin<{ proname: string; prosecdef: boolean; owner: string; anon: boolean; authed: boolean; config: string[] }>(db,
        `select p.proname, p.prosecdef, pg_get_userbyid(p.proowner) owner, has_function_privilege('anon', p.oid, 'execute') anon,
                has_function_privilege('authenticated', p.oid, 'execute') authed, p.proconfig config
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where (n.nspname = 'public' and p.proname in ('tool_add','tool_change','tool_correct','tool_match','tool_archive','tool_history','tool_list'))
             or (n.nspname = 'strandcue_private' and p.proname in ('mutate_user_tool','get_user_tool_core','list_user_tools_core'))`);
      expect(meta).toHaveLength(10);
      for (const fn of meta) {
        expect(fn.anon, fn.proname).toBe(false);
        expect(fn.authed, fn.proname).toBe(true);
        expect(fn.config).toContain('search_path=""');
        if (fn.proname.endsWith('_core') || fn.proname === 'mutate_user_tool') expect(fn).toMatchObject({ prosecdef: true, owner: 'strandcue_mutator' });
        else expect(fn.prosecdef, fn.proname).toBe(false);
      }
      // The old overloads that could not carry facts are gone.
      const old = await admin<{ n: number }>(db, `select count(*)::int n from pg_proc where proname = 'mutate_user_tool' and pronargs = 14`);
      expect(old[0].n).toBe(0);
      await asUser(db, null);
      await expect(toolAdd(db)).rejects.toThrow(/permission denied/i);
    });
  });
});
