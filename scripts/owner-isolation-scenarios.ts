import { z } from 'zod';

import { CatalogueSearchResultSchema } from '../packages/domain/src/catalogue-search.ts';
import { ProductDetailSchema } from '../packages/domain/src/product-detail.ts';
import { ToolDetailSchema, ToolSearchResultSchema } from '../packages/domain/src/tool-catalogue.ts';

/**
 * The live two-owner scenarios: Passport, Shelf, My Tools, both catalogues, direct-write denial, anonymous access,
 * the owner export and idempotency. They talk to any transport that speaks the PostgREST paths, so the same suite
 * runs against PGlite in unit tests (SQL boundary only) and against a real Postgres/PostgREST/Auth stack live.
 *
 * Every read is parsed as JSON and validated; a body that is not JSON, or not the expected shape, is a FAIL and never
 * a pass. A refused write must change no row and consume no operation id, which needs a privileged probe: without
 * one those scenarios are BLOCKED, never PASS.
 */

export type ScenarioStatus = 'PASS' | 'FAIL' | 'BLOCKED';

export interface ScenarioResult {
  readonly id: string;
  readonly area: string;
  readonly status: ScenarioStatus;
  readonly detail: string;
}

export interface HttpResult { readonly status: number; readonly text: string }

export interface Principal {
  readonly name: 'owner-a' | 'owner-b' | 'anonymous';
  readonly id: string | null;
  readonly token: string | null;
}

export interface ScenarioTransport {
  send(principal: Principal, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<HttpResult>;
}

/** Privileged, test-only access to the target: seeding synthetic catalogue rows and counting rows. Never used for reads under test. */
export interface PrivilegedProbe {
  exec(sql: string): Promise<void>;
  counts(): Promise<Record<string, number>>;
}

export interface ScenarioInput {
  readonly transport: ScenarioTransport;
  readonly a: Principal;
  readonly b: Principal;
  readonly anonymous: Principal;
  readonly probe: PrivilegedProbe | null;
}

export const OWNER_ISOLATION_REQUIRED_AREAS = [
  'passport', 'shelf', 'shelf-catalogue', 'tools', 'tool-catalogue', 'direct-write', 'anonymous', 'export', 'idempotency', 'cue-check',
] as const;

class ScenarioFailure extends Error {}
class ScenarioBlocked extends Error {}

const fail = (message: string): never => { throw new ScenarioFailure(message); };
const check = (condition: boolean, message: string): void => { if (!condition) fail(message); };

// --- Synthetic catalogue fixtures -------------------------------------------------------------

const sid = (n: number): string => `c5000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FX = {
  brand: sid(11), productShampoo: sid(21), productMask: sid(22),
  vShampoo: sid(31), vMaskRetired: sid(32), vMaskCurrent: sid(33),
  toolBrand: sid(41), toolDryer: sid(51), toolSteamer: sid(52),
  tvDryer: sid(61), tvSteamerRetired: sid(62), tvSteamerCurrent: sid(63),
  claim: sid(71), source: sid(72), event: sid(73), toolClaim: sid(74), toolSource: sid(75), toolEvent: sid(76),
} as const;

/** Text and numbers that exist only in draft catalogue content. None of it may reach a consumer answer. */
const CANARY = {
  claim: 'SC-T5-CANARY-CLAIM-xq81', direction: 'SC-T5-CANARY-DIRECTION-xq82', ingredient: 'SC-T5-CANARY-INGREDIENT-xq83',
  source: 'https://example.test/sc-t5-canary-source', reviewer: 'SC-T5-CANARY-REVIEWER',
} as const;
const DRAFT_WATTAGE = 2347;
const DRAFT_TEMPERATURE = 241;
const LEAK_PATTERNS = [CANARY.claim, CANARY.direction, CANARY.ingredient, CANARY.source, CANARY.reviewer, `"wattage_watts":${DRAFT_WATTAGE}`, `"wattageWatts":${DRAFT_WATTAGE}`,
  `"temperature_max_celsius":${DRAFT_TEMPERATURE}`, `"temperatureMaxCelsius":${DRAFT_TEMPERATURE}`];

const SEED_SQL = `
insert into public.brands(id, name) values ('${FX.brand}', 'Fixture House');
insert into public.products(id, brand_id, name, category, market) values
  ('${FX.productShampoo}', '${FX.brand}', 'Calm Shampoo', 'shampoo', 'ZA'),
  ('${FX.productMask}', '${FX.brand}', 'Quiet Mask', 'mask', 'ZA');
insert into public.product_versions(id, product_id, variant, market, barcode, structured_directions, ingredients, lifecycle, successor_version_id) values
  ('${FX.vShampoo}', '${FX.productShampoo}', null, 'ZA', null, '{"note":"${CANARY.direction}"}', '{"list":"${CANARY.ingredient}"}', 'active', null),
  ('${FX.vMaskCurrent}', '${FX.productMask}', 'Reformulated', 'ZA', null, '{}', null, 'active', null),
  ('${FX.vMaskRetired}', '${FX.productMask}', 'Original', 'ZA', null, '{}', null, 'retired', '${FX.vMaskCurrent}');
insert into public.product_claims(id, version_id, claim_key, statement) values ('${FX.claim}', '${FX.vShampoo}', 'repair', '${CANARY.claim}');
insert into public.product_sources(id, version_id, source_url, source_type, trust_tier, market, first_seen, last_checked) values
  ('${FX.source}', '${FX.vShampoo}', '${CANARY.source}', 'marketing', 'T10', 'ZA', '2024-01-01', '2024-06-01');
insert into public.product_verification_events(id, version_id, reviewer, reviewed_fields, status, reason, source_ids) values
  ('${FX.event}', '${FX.vShampoo}', '${CANARY.reviewer}', '{claims}', 'verified', 'Draft review', '{${FX.source}}');
insert into public.tool_brands(id, name) values ('${FX.toolBrand}', 'Fixture Tools');
insert into public.tools(id, brand_id, name, tool_type) values
  ('${FX.toolDryer}', '${FX.toolBrand}', 'Probe Dryer', 'dryer'),
  ('${FX.toolSteamer}', '${FX.toolBrand}', 'Probe Steamer', 'steam-straightener');
insert into public.tool_versions(id, tool_id, version_label, market, wattage_watts, temperature_max_celsius, adjustable_temp, contact_heat, air_heat, lifecycle, successor_version_id) values
  ('${FX.tvDryer}', '${FX.toolDryer}', '2024', 'ZA', ${DRAFT_WATTAGE}, ${DRAFT_TEMPERATURE}, 'yes', 'no', 'yes', 'active', null),
  ('${FX.tvSteamerCurrent}', '${FX.toolSteamer}', 'Reformulated', 'ZA', 1800, null, 'unknown', 'yes', 'unknown', 'active', null),
  ('${FX.tvSteamerRetired}', '${FX.toolSteamer}', 'Original', 'ZA', 1500, null, 'unknown', 'yes', 'unknown', 'retired', '${FX.tvSteamerCurrent}');
insert into public.tool_claims(id, version_id, claim_key, statement) values ('${FX.toolClaim}', '${FX.tvDryer}', 'even-heat', '${CANARY.claim}');
insert into public.tool_sources(id, version_id, source_url, source_type, trust_tier, market, first_seen, last_checked) values
  ('${FX.toolSource}', '${FX.tvDryer}', '${CANARY.source}', 'marketing', 'T10', 'ZA', '2024-01-01', '2024-06-01');
insert into public.tool_verification_events(id, version_id, reviewer, reviewed_fields, status, reason, source_ids) values
  ('${FX.toolEvent}', '${FX.tvDryer}', '${CANARY.reviewer}', '{capabilities}', 'verified', 'Draft review', '{${FX.toolSource}}');
`;

const CLEANUP_SQL = `
delete from public.tool_verification_events where id = '${FX.toolEvent}';
delete from public.tool_sources where id = '${FX.toolSource}';
delete from public.tool_claims where id = '${FX.toolClaim}';
update public.tool_versions set successor_version_id = null where id = '${FX.tvSteamerRetired}';
delete from public.tool_versions where id in ('${FX.tvDryer}', '${FX.tvSteamerRetired}', '${FX.tvSteamerCurrent}');
delete from public.tools where id in ('${FX.toolDryer}', '${FX.toolSteamer}');
delete from public.tool_brands where id = '${FX.toolBrand}';
delete from public.product_verification_events where id = '${FX.event}';
delete from public.product_sources where id = '${FX.source}';
delete from public.product_claims where id = '${FX.claim}';
update public.product_versions set successor_version_id = null where id = '${FX.vMaskRetired}';
delete from public.product_versions where id in ('${FX.vShampoo}', '${FX.vMaskRetired}', '${FX.vMaskCurrent}');
delete from public.products where id in ('${FX.productShampoo}', '${FX.productMask}');
delete from public.brands where id = '${FX.brand}';
`;

// Idempotent: a fixture left by an interrupted earlier run is reused, never duplicated.
const IDEMPOTENT_SEED_SQL = SEED_SQL.replaceAll(');\n', ') on conflict do nothing;\n');

/** Inserts the synthetic catalogue rows (draft content only; nothing is published). */
export async function seedOwnerIsolationFixtures(probe: PrivilegedProbe): Promise<void> {
  await probe.exec(IDEMPOTENT_SEED_SQL);
}

/** Removes the synthetic catalogue rows. Owner accounts must be removed first: their matched rows reference these versions. */
export async function cleanupOwnerIsolationFixtures(probe: PrivilegedProbe): Promise<void> {
  await probe.exec(CLEANUP_SQL);
}

// --- Strict response handling -----------------------------------------------------------------

interface Reply { readonly status: number; readonly text: string; readonly json: unknown; readonly parsed: boolean }

const uuid = z.string().uuid();
const DAY = { precision: 'day', value: '2026-03-01' };

async function call(input: ScenarioInput, principal: Principal, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<Reply> {
  const result = await input.transport.send(principal, method, path, body);
  if (result.text.trim() === '') return { status: result.status, text: result.text, json: undefined, parsed: true };
  try { return { status: result.status, text: result.text, json: JSON.parse(result.text) as unknown, parsed: true }; }
  catch { return { status: result.status, text: result.text, json: undefined, parsed: false }; }
}

const rpc = (input: ScenarioInput, principal: Principal, name: string, args: Record<string, unknown>): Promise<Reply> =>
  call(input, principal, 'POST', `/rest/v1/rpc/${name}`, args);

const isError = (reply: Reply): boolean => reply.status >= 400;

function ok<S extends z.ZodType>(reply: Reply, what: string, schema: S): z.output<S> {
  if (!reply.parsed) return fail(`${what}: the response was malformed (not JSON), status ${reply.status}`);
  if (reply.status < 200 || reply.status >= 300) return fail(`${what}: expected success, got ${reply.status}${isError(reply) ? ` ("${errorBodySafe(reply)}")` : ""}`);
  const parsed = schema.safeParse(reply.json);
  if (!parsed.success) return fail(`${what}: the response did not match the expected shape (malformed)`);
  return parsed.data;
}

function errorBody(reply: Reply, what: string): { code: string; message: string } {
  if (!reply.parsed || reply.json === null || typeof reply.json !== 'object' || Array.isArray(reply.json)) return fail(`${what}: the refusal was malformed (not a JSON error object), status ${reply.status}`);
  const body = reply.json as { code?: unknown; message?: unknown };
  return { code: typeof body.code === 'string' ? body.code : '', message: typeof body.message === 'string' ? body.message : '' };
}

/** A refusal: a 4xx with a JSON error object, optionally with a stable domain code. */
function denied(reply: Reply, what: string, code?: RegExp): void {
  if (!isError(reply)) return fail(`${what}: expected a refusal, got ${reply.status}`);
  const body = errorBody(reply, what);
  if (code) check(code.test(body.message), `${what}: expected ${String(code)}, got "${body.message.slice(0, 80)}"`);
}

/** A privilege or row-security denial specifically (a table the caller must not touch). */
function privilegeDenied(reply: Reply, what: string): void {
  if (!isError(reply)) return fail(`${what}: expected a privilege denial, got ${reply.status}`);
  const body = errorBody(reply, what);
  check(body.code === '42501' || reply.status === 401 || reply.status === 403, `${what}: refused, but not by a privilege or row-security rule (status ${reply.status}, code ${body.code}, "${body.message.slice(0, 80)}")`);
}

/** A read the caller must not be able to use: an empty array, or a denial. Rows are never acceptable. */
function nothingVisible(reply: Reply, what: string): void {
  if (isError(reply)) { errorBody(reply, what); return; }
  if (!reply.parsed || !Array.isArray(reply.json)) return fail(`${what}: the response was malformed (expected an array)`);
  check(reply.json.length === 0, `${what}: ${reply.json.length} row(s) were visible`);
}

/** A foreign id and an id that does not exist must be refused in exactly the same words: the refusal is no oracle for existence. */
function sameRefusal(foreign: Reply, unknown: Reply, what: string): void {
  const a = errorBody(foreign, `${what} (foreign id)`);
  const b = errorBody(unknown, `${what} (unknown id)`);
  check(foreign.status === unknown.status && a.code === b.code && a.message === b.message,
    `${what}: the refusal for another owner's id differs from the refusal for an id that does not exist`);
}

const noLeak = (value: unknown, what: string): void => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const pattern of LEAK_PATTERNS) check(!text.includes(pattern), `${what}: draft catalogue content reached the consumer`);
};

const keysOf = (value: unknown): string[] => (value !== null && typeof value === 'object' ? Object.keys(value as object).sort() : []);

// --- Schemas for the owner endpoints (the catalogue ones are the domain contracts) ----------------

const shelfReceipt = z.object({ userProductId: uuid, revision: z.number().int().positive() }).passthrough();
const toolReceipt = z.object({ userToolId: uuid, revision: z.number().int().positive() }).passthrough();
const revisionRow = z.object({ id: uuid, kind: z.string(), correctsId: uuid.nullable(), matchVersionId: uuid.nullable(), patch: z.record(z.string(), z.unknown()).optional() }).passthrough();
const shelfDetail = z.object({ id: uuid, revision: z.number().int().positive(), versionId: uuid.nullable(), matched: z.boolean(), availability: z.string(), manualName: z.string().nullable(), revisions: z.array(revisionRow) }).passthrough();
const toolDetail = z.object({ id: uuid, revision: z.number().int().positive(), versionId: uuid.nullable(), matched: z.boolean(), availability: z.string(), manualModel: z.string().nullable(), wattageWatts: z.number().nullable(), settings: z.unknown(), attachments: z.unknown(), heatMethods: z.unknown(), revisions: z.array(revisionRow) }).passthrough();
const listOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), nextCursor: z.unknown() }).passthrough();
const shelfListSchema = listOf(z.object({ id: uuid, manualName: z.string().nullable() }).passthrough());
const toolListSchema = listOf(z.object({ id: uuid, manualModel: z.string().nullable() }).passthrough());
const exportReceipt = z.object({ jobId: uuid }).passthrough();
const exportDownload = z.object({ document: z.record(z.string(), z.unknown()) }).passthrough();
const cueStep = z.object({ stepId: z.string(), position: z.number().int(), action: z.string() }).passthrough();
const cueReceipt = z.object({
  recordId: uuid, executionId: uuid, lifecycle: z.enum(['active', 'voided']), revision: z.number().int().positive(),
  confirmedSteps: z.array(cueStep), observation: z.record(z.string(), z.unknown()),
}).passthrough();
const cueDetail = cueReceipt.extend({ revisions: z.array(z.object({ revisionId: uuid, kind: z.string() }).passthrough()) });
const cueList = listOf(cueReceipt);
const passportView = z.object({ revisions: z.array(z.object({ id: uuid }).passthrough()) }).passthrough();

// --- Runner -----------------------------------------------------------------------------------

type Scenario = { id: string; area: typeof OWNER_ISOLATION_REQUIRED_AREAS[number]; needsProbe?: boolean; run: (ctx: Context) => Promise<void> };

interface Context {
  readonly input: ScenarioInput;
  readonly suffix: string;
  readonly probe: PrivilegedProbe;
  readonly state: Record<string, string>;
  readonly counts: () => Promise<Record<string, number>>;
}

const send = (ctx: Context, who: 'a' | 'b' | 'anonymous', method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
  call(ctx.input, ctx.input[who], method, path, body);
const call$ = (ctx: Context, who: 'a' | 'b' | 'anonymous', name: string, args: Record<string, unknown>) => rpc(ctx.input, ctx.input[who], name, args);

async function sameCounts(ctx: Context, what: string, action: () => Promise<void>): Promise<void> {
  const before = await ctx.counts();
  await action();
  const after = await ctx.counts();
  for (const key of Object.keys(before)) check(before[key] === after[key], `${what}: ${key} changed (${before[key]} -> ${after[key]})`);
}

const facts = (extra: Record<string, unknown> = {}) => ({ ...extra });

async function addShelf(ctx: Context, who: 'a' | 'b', name: string, operationId: string = crypto.randomUUID()): Promise<{ id: string; revision: number }> {
  const id = crypto.randomUUID();
  const reply = await call$(ctx, who, 'shelf_add', {
    p_operation_id: operationId, p_user_product_id: id, p_version_id: null, p_manual_brand: 'SC-T5 House', p_manual_name: name,
    p_manual_category: 'shampoo', p_availability: 'available', p_notes: null, p_effective_date: DAY, p_facts: facts(),
  });
  const receipt = ok(reply, `shelf_add (${who})`, shelfReceipt);
  check(receipt.userProductId === id, 'shelf_add returned a different item than the one asked for');
  return { id, revision: receipt.revision };
}

async function addTool(ctx: Context, who: 'a' | 'b', toolFacts: Record<string, unknown>, operationId: string = crypto.randomUUID()): Promise<{ id: string; revision: number }> {
  const id = crypto.randomUUID();
  const reply = await call$(ctx, who, 'tool_add', { p_operation_id: operationId, p_user_tool_id: id, p_availability: 'available', p_effective_date: DAY, p_facts: toolFacts });
  const receipt = ok(reply, `tool_add (${who})`, toolReceipt);
  check(receipt.userToolId === id, 'tool_add returned a different tool than the one asked for');
  return { id, revision: receipt.revision };
}

const shelfHistory = async (ctx: Context, who: 'a' | 'b', id: string) => ok(await call$(ctx, who, 'shelf_history', { p_user_product_id: id, p_include_audit: true }), `shelf_history (${who})`, shelfDetail);
const toolHistory = async (ctx: Context, who: 'a' | 'b', id: string) => ok(await call$(ctx, who, 'tool_history', { p_user_tool_id: id, p_include_audit: true }), `tool_history (${who})`, toolDetail);

async function exportDocument(ctx: Context, who: 'a' | 'b'): Promise<Record<string, unknown>> {
  const receipt = ok(await call$(ctx, who, 'export_request', { p_operation_id: crypto.randomUUID(), p_format: 'json' }), `export_request (${who})`, exportReceipt);
  return ok(await call$(ctx, who, 'export_download', { p_job_id: receipt.jobId }), `export_download (${who})`, exportDownload).document;
}

const requireState = (ctx: Context, key: string): string => ctx.state[key] ?? fail(`an earlier scenario did not provide ${key}`);

const cueObservation = (notes: string, extra: Record<string, unknown> = {}) => ({
  timing: 'immediate', observedAt: new Date(Date.now() - 60_000).toISOString(), overallResult: 'better', notes, ...extra,
});

/** A completed execution for owner A bound to a trusted run: the run is seeded privately, everything else goes through the real RPCs. */
async function seedCueExecution(ctx: Context): Promise<string> {
  const owner = ctx.input.a.id;
  if (owner === null) return fail('owner A has no identity');
  const runId = crypto.randomUUID();
  const executionId = crypto.randomUUID();
  const steps = [1, 2].map(n => ({ stepId: `step-${n}`, position: n, action: `SC-CUE action ${n}`, productId: null, productVersionId: null, toolId: null, toolVersionId: null, waitSeconds: null, rinse: null, reasons: ['synthetic'] }));
  const decision = JSON.stringify({ status: 'ready', requestId: runId, steps });
  const runInput = JSON.stringify({ requestId: runId, goal: 'basic_wash' });
  await ctx.probe.exec(`select set_config('request.jwt.claim.sub', '${owner}', false);
set role strandcue_mutator;
select strandcue_private.record_trusted_run('${runId}', '${'d'.repeat(64)}', '2026-10-13T08:00:00.000Z'::timestamptz, '1', 'sc-cue-bundle', '1', 'ready', '${runInput}'::jsonb, '${decision}'::jsonb);
reset role;`);
  ok(await call$(ctx, 'a', 'start_protocol_execution', { p_operation_id: crypto.randomUUID(), p_execution_id: executionId, p_recommendation_run_id: runId, p_started_at: new Date().toISOString() }), 'start_protocol_execution', z.unknown());
  let revision = 0;
  for (const command of [{ kind: 'complete-step', stepId: 'step-1' }, { kind: 'complete-step', stepId: 'step-2' }, { kind: 'complete' }]) {
    ok(await call$(ctx, 'a', 'apply_protocol_execution_command', { p_operation_id: crypto.randomUUID(), p_execution_id: executionId, p_expected_revision: revision, p_command: command, p_at: new Date().toISOString() }), 'apply_protocol_execution_command', z.unknown());
    revision += 1;
  }
  return executionId;
}

const cueRecordArgs = (executionId: string, observation: Record<string, unknown>, operationId: string = crypto.randomUUID()) =>
  ({ p_operation_id: operationId, p_execution_id: executionId, p_observation: observation });

const SCENARIOS: Scenario[] = [
  // ---- Passport ----
  {
    id: 'passport.owners-write-and-read-only-their-own', area: 'passport', run: async ctx => {
      const base = { naturalPattern: 'curly', strandDiameter: 'fine', density: 'medium', concerns: ['dryness'], goals: ['shine'], budgetPreference: 'best-value' };
      for (const [who, pattern] of [['a', 'curly'], ['b', 'wavy']] as const) {
        ok(await call$(ctx, who, 'mutate_passport', {
          p_operation_id: crypto.randomUUID(), p_expected_revision: 0, p_kind: 'baseline', p_effective_date: DAY, p_patch: { ...base, naturalPattern: pattern }, p_corrects_id: null, p_correction_reason: null,
        }), `mutate_passport (${who})`, z.unknown());
      }
      const mine = ok(await call$(ctx, 'a', 'get_passport', { p_as_of: '2026-04-01' }), 'get_passport (a)', passportView);
      const theirs = ok(await call$(ctx, 'b', 'get_passport', { p_as_of: '2026-04-01' }), 'get_passport (b)', passportView);
      check(mine.revisions.length === 1 && theirs.revisions.length === 1, 'each owner should see exactly their own one revision');
      check(JSON.stringify(mine).includes('"curly"') && !JSON.stringify(mine).includes('"wavy"'), 'owner A saw owner B\'s passport facts');
      check(JSON.stringify(theirs).includes('"wavy"') && !JSON.stringify(theirs).includes('"curly"'), 'owner B saw owner A\'s passport facts');
    },
  },
  {
    id: 'passport.foreign-rows-and-direct-writes-are-denied', area: 'passport', run: async ctx => {
      const a = ctx.input.a.id;
      const b = ctx.input.b.id;
      nothingVisible(await send(ctx, 'a', 'GET', `/rest/v1/passport_revisions?select=id&user_id=eq.${b}`), 'A reading B\'s passport revisions');
      nothingVisible(await send(ctx, 'b', 'GET', `/rest/v1/hair_passports?select=user_id&user_id=eq.${a}`), 'B reading A\'s passport');
      privilegeDenied(await send(ctx, 'a', 'POST', '/rest/v1/passport_revisions', { id: crypto.randomUUID(), user_id: a, kind: 'change' }), 'A writing a passport revision directly');
    },
  },
  // ---- Shelf ----
  {
    id: 'shelf.each-owner-creates-a-different-manual-item', area: 'shelf', run: async ctx => {
      const a = await addShelf(ctx, 'a', `SC-T5 Alpha ${ctx.suffix}`);
      const b = await addShelf(ctx, 'b', `SC-T5 Bravo ${ctx.suffix}`);
      check(a.id !== b.id, 'the two items share an id');
      ctx.state.shelfA = a.id; ctx.state.shelfB = b.id;
    },
  },
  {
    id: 'shelf.each-owner-sees-only-their-own-item', area: 'shelf', run: async ctx => {
      const a = ok(await call$(ctx, 'a', 'shelf_list', { p_limit: 50, p_cursor: null }), 'shelf_list (a)', shelfListSchema);
      const b = ok(await call$(ctx, 'b', 'shelf_list', { p_limit: 50, p_cursor: null }), 'shelf_list (b)', shelfListSchema);
      check(a.items.length === 1 && a.items[0].id === requireState(ctx, 'shelfA'), 'owner A\'s list is not exactly A\'s one item');
      check(b.items.length === 1 && b.items[0].id === requireState(ctx, 'shelfB'), 'owner B\'s list is not exactly B\'s one item');
    },
  },
  {
    id: 'shelf.a-cannot-read-bs-item-by-id-history-detail-or-table', area: 'shelf', run: async ctx => {
      const b = requireState(ctx, 'shelfB');
      denied(await call$(ctx, 'a', 'shelf_history', { p_user_product_id: b, p_include_audit: true }), 'A reading B\'s shelf history', /not-found/);
      denied(await call$(ctx, 'a', 'catalogue_product_detail', { p_version_id: FX.vShampoo, p_user_product_id: b }), 'A asking for a product detail in B\'s context', /not-found/);
      nothingVisible(await send(ctx, 'a', 'GET', `/rest/v1/user_products?select=id&id=eq.${b}`), 'A reading B\'s item from the table');
      nothingVisible(await send(ctx, 'a', 'GET', `/rest/v1/user_product_revisions?select=id&user_product_id=eq.${b}`), 'A reading B\'s revisions from the table');
    },
  },
  {
    id: 'shelf.a-cannot-change-correct-match-or-archive-bs-item', area: 'shelf', needsProbe: true, run: async ctx => {
      const b = requireState(ctx, 'shelfB');
      const history = await shelfHistory(ctx, 'b', b);
      await sameCounts(ctx, 'A mutating B\'s item', async () => {
        denied(await call$(ctx, 'a', 'shelf_change', { p_operation_id: crypto.randomUUID(), p_user_product_id: b, p_expected_revision: 1, p_manual_brand: null, p_manual_name: null, p_manual_category: null, p_availability: 'low', p_notes: null, p_effective_date: DAY, p_facts: facts() }), 'A changing B\'s item', /not-found|revision-conflict/);
        denied(await call$(ctx, 'a', 'shelf_correct', { p_operation_id: crypto.randomUUID(), p_user_product_id: b, p_expected_revision: 1, p_corrects_id: history.revisions[0].id, p_reason: 'x', p_notes: null, p_effective_date: DAY, p_facts: facts({ manualName: 'Hijacked' }) }), 'A correcting B\'s item', /not-found|revision-conflict|invalid-correction/);
        denied(await call$(ctx, 'a', 'shelf_match', { p_operation_id: crypto.randomUUID(), p_user_product_id: b, p_expected_revision: 1, p_version_id: FX.vShampoo, p_confirmed: true }), 'A matching B\'s item', /not-found|revision-conflict/);
        denied(await call$(ctx, 'a', 'shelf_archive', { p_operation_id: crypto.randomUUID(), p_user_product_id: b, p_expected_revision: 1 }), 'A archiving B\'s item', /not-found|revision-conflict/);
      });
      for (const action of ['shelf_change', 'shelf_archive', 'shelf_match'] as const) {
        const argsFor = (target: string): Record<string, unknown> => {
          if (action === 'shelf_archive') return { p_operation_id: crypto.randomUUID(), p_user_product_id: target, p_expected_revision: 1 };
          if (action === 'shelf_match') return { p_operation_id: crypto.randomUUID(), p_user_product_id: target, p_expected_revision: 1, p_version_id: FX.vShampoo, p_confirmed: true };
          return { p_operation_id: crypto.randomUUID(), p_user_product_id: target, p_expected_revision: 1, p_manual_brand: null, p_manual_name: null, p_manual_category: null, p_availability: 'low', p_notes: null, p_effective_date: DAY, p_facts: facts() };
        };
        sameRefusal(await call$(ctx, 'a', action, argsFor(b)), await call$(ctx, 'a', action, argsFor(crypto.randomUUID())), `${action} on someone else's item`);
      }
      const after = await shelfHistory(ctx, 'b', b);
      check(after.revision === 1 && after.manualName === `SC-T5 Bravo ${ctx.suffix}` && after.availability === 'available', 'B\'s item changed after A\'s refused attempts');
    },
  },
  {
    id: 'shelf.manual-baseline-survives-change-and-correction', area: 'shelf', run: async ctx => {
      const id = requireState(ctx, 'shelfA');
      const baseline = (await shelfHistory(ctx, 'a', id)).revisions[0];
      const changed = ok(await call$(ctx, 'a', 'shelf_change', { p_operation_id: crypto.randomUUID(), p_user_product_id: id, p_expected_revision: 1, p_manual_brand: null, p_manual_name: null, p_manual_category: null, p_availability: 'low', p_notes: 'SC-T5 note', p_effective_date: DAY, p_facts: facts() }), 'shelf_change', shelfReceipt);
      ok(await call$(ctx, 'a', 'shelf_correct', { p_operation_id: crypto.randomUUID(), p_user_product_id: id, p_expected_revision: changed.revision, p_corrects_id: baseline.id, p_reason: 'Fixed the wording', p_notes: null, p_effective_date: DAY, p_facts: facts({ manualName: `SC-T5 Alpha Corrected ${ctx.suffix}` }) }), 'shelf_correct', shelfReceipt);
      const after = await shelfHistory(ctx, 'a', id);
      check(after.revisions.map(r => r.kind).join(',') === 'baseline,change,correction', `unexpected history ${after.revisions.map(r => r.kind).join(',')}`);
      check(after.revisions[0].patch?.manualName === `SC-T5 Alpha ${ctx.suffix}`, 'the original manual wording was not preserved in the baseline');
      check(after.manualName === `SC-T5 Alpha Corrected ${ctx.suffix}`, 'the correction is not the current wording');
    },
  },
  {
    id: 'shelf.no-op-correction-changes-nothing-and-keeps-the-operation-id', area: 'shelf', needsProbe: true, run: async ctx => {
      const id = requireState(ctx, 'shelfA');
      const before = await shelfHistory(ctx, 'a', id);
      const target = before.revisions.filter(r => r.kind === 'baseline' || r.kind === 'correction').at(-1)!;
      const operationId = crypto.randomUUID();
      await sameCounts(ctx, 'a no-op correction', async () => {
        denied(await call$(ctx, 'a', 'shelf_correct', { p_operation_id: operationId, p_user_product_id: id, p_expected_revision: before.revision, p_corrects_id: target.id, p_reason: 'same words', p_notes: null, p_effective_date: DAY, p_facts: facts({ manualName: before.manualName }) }), 'a no-op correction', /invalid-correction/);
      });
      // The refusal did not consume the operation id: it can still be used for a real change.
      ok(await call$(ctx, 'a', 'shelf_change', { p_operation_id: operationId, p_user_product_id: id, p_expected_revision: before.revision, p_manual_brand: null, p_manual_name: null, p_manual_category: null, p_availability: 'available', p_notes: null, p_effective_date: DAY, p_facts: facts() }), 'reusing the refused operation id', shelfReceipt);
    },
  },
  {
    id: 'shelf.direct-table-writes-are-denied', area: 'direct-write', needsProbe: true, run: async ctx => {
      const a = ctx.input.a.id;
      await sameCounts(ctx, 'direct shelf writes', async () => {
        privilegeDenied(await send(ctx, 'a', 'POST', '/rest/v1/user_products', { id: crypto.randomUUID(), owner: a, manual_name: 'Injected', availability: 'available' }), 'inserting a user_products row');
        privilegeDenied(await send(ctx, 'a', 'POST', '/rest/v1/user_product_revisions', { id: crypto.randomUUID(), owner: a, user_product_id: requireState(ctx, 'shelfA'), kind: 'change' }), 'inserting a revision');
        privilegeDenied(await send(ctx, 'a', 'PATCH', `/rest/v1/user_products?id=eq.${requireState(ctx, 'shelfA')}`, { manual_name: 'Rewritten' }), 'updating a user_products row');
        privilegeDenied(await send(ctx, 'a', 'DELETE', `/rest/v1/user_products?id=eq.${requireState(ctx, 'shelfA')}`), 'deleting a user_products row');
        privilegeDenied(await send(ctx, 'b', 'POST', '/rest/v1/user_products', { id: crypto.randomUUID(), owner: a, manual_name: 'Planted in A', availability: 'available' }), 'planting a row under another owner');
      });
    },
  },
  // ---- Shelf and the product catalogue ----
  {
    id: 'shelf-catalogue.search-exposes-allowlisted-identity-and-lifecycle-only', area: 'shelf-catalogue', needsProbe: true, run: async ctx => {
      const reply = await call$(ctx, 'a', 'catalogue_search', { p_query: 'calm shampoo', p_limit: 10 });
      const result = ok(reply, 'catalogue_search', CatalogueSearchResultSchema);
      check(result.results.some(row => row.versionId === FX.vShampoo), 'the synthetic version was not found');
      const allowed = Object.keys(CatalogueSearchResultSchema.shape.results.element.shape).sort();
      for (const row of result.results) check(keysOf(row).every(key => allowed.includes(key)), 'a search row carried a field outside the allowlist');
      noLeak(reply.text, 'catalogue search');
    },
  },
  {
    id: 'shelf-catalogue.detail-exposes-no-unpublished-section', area: 'shelf-catalogue', needsProbe: true, run: async ctx => {
      const reply = await call$(ctx, 'a', 'catalogue_product_detail', { p_version_id: FX.vShampoo, p_user_product_id: null });
      const detail = ok(reply, 'catalogue_product_detail', ProductDetailSchema);
      for (const section of ['directions', 'ingredients', 'claims', 'formulationReference'] as const) {
        check(detail[section].state === 'not_published', `${section} is shown although nothing was published`);
      }
      check(detail.owner === null, 'a general detail carried owner facts');
      noLeak(reply.text, 'product detail');
    },
  },
  {
    id: 'shelf-catalogue.draft-claims-sources-reviewers-and-events-are-unavailable', area: 'shelf-catalogue', needsProbe: true, run: async ctx => {
      for (const who of ['a', 'b', 'anonymous'] as const) {
        for (const table of ['product_claims', 'product_sources', 'product_verification_events', 'product_publications', 'product_claim_evidence']) {
          nothingVisible(await send(ctx, who, 'GET', `/rest/v1/${table}?select=id`), `${who} reading ${table}`);
        }
      }
      privilegeDenied(await send(ctx, 'a', 'GET', '/rest/v1/product_versions?select=structured_directions'), 'reading the draft directions column');
      privilegeDenied(await send(ctx, 'a', 'GET', '/rest/v1/product_versions?select=ingredients'), 'reading the draft ingredients column');
    },
  },
  {
    id: 'shelf-catalogue.explicit-match-appends-history-and-keeps-the-manual-identity', area: 'shelf-catalogue', needsProbe: true, run: async ctx => {
      const id = requireState(ctx, 'shelfA');
      const before = await shelfHistory(ctx, 'a', id);
      const unconfirmed = await call$(ctx, 'a', 'shelf_match', { p_operation_id: crypto.randomUUID(), p_user_product_id: id, p_expected_revision: before.revision, p_version_id: FX.vShampoo, p_confirmed: false });
      denied(unconfirmed, 'an unconfirmed match');
      ok(await call$(ctx, 'a', 'shelf_match', { p_operation_id: crypto.randomUUID(), p_user_product_id: id, p_expected_revision: before.revision, p_version_id: FX.vShampoo, p_confirmed: true }), 'shelf_match', shelfReceipt);
      const after = await shelfHistory(ctx, 'a', id);
      check(after.revisions.at(-1)?.kind === 'match' && after.revisions.at(-1)?.matchVersionId === FX.vShampoo, 'the match was not appended to the history');
      check(after.revisions.length === before.revisions.length + 1, 'the match did not append exactly one entry');
      check(after.manualName === before.manualName, 'matching changed the manual wording');
      check(after.revisions[0].patch?.manualName === `SC-T5 Alpha ${ctx.suffix}`, 'the original manual baseline was lost');
    },
  },
  {
    id: 'shelf-catalogue.owner-bound-detail-returns-facts-only-for-the-callers-own-item', area: 'shelf-catalogue', needsProbe: true, run: async ctx => {
      const own = ok(await call$(ctx, 'a', 'catalogue_product_detail', { p_version_id: FX.vShampoo, p_user_product_id: requireState(ctx, 'shelfA') }), 'owner-bound product detail', ProductDetailSchema);
      check(own.owner !== null && own.owner.userProductId === requireState(ctx, 'shelfA'), 'the owner context did not return the caller\'s own item');
      denied(await call$(ctx, 'b', 'catalogue_product_detail', { p_version_id: FX.vShampoo, p_user_product_id: requireState(ctx, 'shelfA') }), 'B asking for A\'s owner context', /not-found/);
      denied(await call$(ctx, 'a', 'catalogue_product_detail', { p_version_id: FX.vMaskRetired, p_user_product_id: requireState(ctx, 'shelfA') }), 'an owner context for a different version', /not-found/);
    },
  },
  {
    id: 'shelf-catalogue.retired-version-stays-historical-with-no-successor-substitution', area: 'shelf-catalogue', needsProbe: true, run: async ctx => {
      const search = ok(await call$(ctx, 'b', 'catalogue_search', { p_query: 'quiet mask', p_limit: 10 }), 'catalogue_search', CatalogueSearchResultSchema);
      const retired = search.results.find(row => row.versionId === FX.vMaskRetired);
      check(retired?.lifecycle === 'retired', 'the retired version was not labelled retired');
      const id = requireState(ctx, 'shelfB');
      const before = await shelfHistory(ctx, 'b', id);
      ok(await call$(ctx, 'b', 'shelf_match', { p_operation_id: crypto.randomUUID(), p_user_product_id: id, p_expected_revision: before.revision, p_version_id: FX.vMaskRetired, p_confirmed: true }), 'matching a retired exact version', shelfReceipt);
      const after = await shelfHistory(ctx, 'b', id);
      check(after.versionId === FX.vMaskRetired && after.versionId !== FX.vMaskCurrent, 'the retired exact version was replaced by its successor');
      const detail = ok(await call$(ctx, 'b', 'catalogue_product_detail', { p_version_id: FX.vMaskRetired, p_user_product_id: id }), 'retired product detail', ProductDetailSchema);
      check(detail.lifecycle.state === 'retired', 'the retired detail was not labelled retired');
      check(detail.lifecycle.successor.state !== 'published', 'a successor was shown although none was published');
    },
  },
  // ---- Tools ----
  {
    id: 'tools.each-owner-creates-a-different-manual-tool', area: 'tools', run: async ctx => {
      const a = await addTool(ctx, 'a', { manualBrand: 'SC-T5 Brand', manualModel: `SC-T5 Dryer ${ctx.suffix}`, toolType: 'dryer', wattageWatts: 1900, settings: { state: 'unknown' }, attachments: { state: 'recorded', items: [{ kind: 'diffuser' }] } });
      const b = await addTool(ctx, 'b', { manualBrand: 'SC-T5 Brand', manualModel: `SC-T5 Iron ${ctx.suffix}`, toolType: 'flat-iron' });
      check(a.id !== b.id, 'the two tools share an id');
      ctx.state.toolA = a.id; ctx.state.toolB = b.id;
    },
  },
  {
    id: 'tools.each-owner-sees-only-their-own-tool', area: 'tools', run: async ctx => {
      const a = ok(await call$(ctx, 'a', 'tool_list', { p_limit: 50, p_cursor: null }), 'tool_list (a)', toolListSchema);
      const b = ok(await call$(ctx, 'b', 'tool_list', { p_limit: 50, p_cursor: null }), 'tool_list (b)', toolListSchema);
      check(a.items.length === 1 && a.items[0].id === requireState(ctx, 'toolA'), 'owner A\'s list is not exactly A\'s one tool');
      check(b.items.length === 1 && b.items[0].id === requireState(ctx, 'toolB'), 'owner B\'s list is not exactly B\'s one tool');
    },
  },
  {
    id: 'tools.a-cannot-read-bs-tool-by-id-history-detail-or-table', area: 'tools', needsProbe: true, run: async ctx => {
      const b = requireState(ctx, 'toolB');
      denied(await call$(ctx, 'a', 'tool_history', { p_user_tool_id: b, p_include_audit: true }), 'A reading B\'s tool history', /not-found/);
      denied(await call$(ctx, 'a', 'tool_catalogue_detail', { p_version_id: FX.tvDryer, p_user_tool_id: b }), 'A asking for a tool detail in B\'s context', /not-found/);
      nothingVisible(await send(ctx, 'a', 'GET', `/rest/v1/user_tools?select=id&id=eq.${b}`), 'A reading B\'s tool from the table');
      nothingVisible(await send(ctx, 'a', 'GET', `/rest/v1/user_tool_revisions?select=id&user_tool_id=eq.${b}`), 'A reading B\'s tool revisions from the table');
    },
  },
  {
    id: 'tools.a-cannot-change-correct-match-or-archive-bs-tool', area: 'tools', needsProbe: true, run: async ctx => {
      const b = requireState(ctx, 'toolB');
      const history = await toolHistory(ctx, 'b', b);
      await sameCounts(ctx, 'A mutating B\'s tool', async () => {
        denied(await call$(ctx, 'a', 'tool_change', { p_operation_id: crypto.randomUUID(), p_user_tool_id: b, p_expected_revision: 1, p_availability: null, p_effective_date: DAY, p_facts: { condition: 'worn' } }), 'A changing B\'s tool', /not-found|revision-conflict/);
        denied(await call$(ctx, 'a', 'tool_correct', { p_operation_id: crypto.randomUUID(), p_user_tool_id: b, p_expected_revision: 1, p_corrects_id: history.revisions[0].id, p_reason: 'x', p_effective_date: DAY, p_facts: { manualModel: 'Hijacked' } }), 'A correcting B\'s tool', /not-found|revision-conflict|invalid-correction/);
        denied(await call$(ctx, 'a', 'tool_match', { p_operation_id: crypto.randomUUID(), p_user_tool_id: b, p_expected_revision: 1, p_version_id: FX.tvDryer, p_confirmed: true }), 'A matching B\'s tool', /not-found|revision-conflict/);
        denied(await call$(ctx, 'a', 'tool_archive', { p_operation_id: crypto.randomUUID(), p_user_tool_id: b, p_expected_revision: 1 }), 'A archiving B\'s tool', /not-found|revision-conflict/);
      });
      for (const action of ['tool_change', 'tool_archive', 'tool_match'] as const) {
        const argsFor = (target: string): Record<string, unknown> => {
          if (action === 'tool_archive') return { p_operation_id: crypto.randomUUID(), p_user_tool_id: target, p_expected_revision: 1 };
          if (action === 'tool_match') return { p_operation_id: crypto.randomUUID(), p_user_tool_id: target, p_expected_revision: 1, p_version_id: FX.tvDryer, p_confirmed: true };
          return { p_operation_id: crypto.randomUUID(), p_user_tool_id: target, p_expected_revision: 1, p_availability: null, p_effective_date: DAY, p_facts: { condition: 'worn' } };
        };
        sameRefusal(await call$(ctx, 'a', action, argsFor(b)), await call$(ctx, 'a', action, argsFor(crypto.randomUUID())), `${action} on someone else's tool`);
      }
      const after = await toolHistory(ctx, 'b', b);
      check(after.revision === 1 && after.availability === 'available' && after.manualModel === `SC-T5 Iron ${ctx.suffix}`, 'B\'s tool changed after A\'s refused attempts');
    },
  },
  {
    id: 'tools.known-wattage-with-unknown-temperature-round-trips-exactly', area: 'tools', run: async ctx => {
      const tool = await toolHistory(ctx, 'a', requireState(ctx, 'toolA'));
      check(tool.wattageWatts === 1900, 'the wattage did not round-trip exactly');
      check(JSON.stringify(tool.settings) === JSON.stringify({ state: 'unknown' }), 'the unknown temperature became something else');
      check(!/"temperature"|"value":\d/.test(JSON.stringify(tool)), 'a temperature appeared that the owner never recorded');
    },
  },
  {
    id: 'tools.a-diffuser-stays-an-attachment-and-never-a-heat-method', area: 'tools', run: async ctx => {
      const tool = await toolHistory(ctx, 'a', requireState(ctx, 'toolA'));
      check(JSON.stringify(tool.attachments).includes('diffuser'), 'the diffuser attachment was lost');
      check(tool.heatMethods === null, 'recording a diffuser selected a heat method');
      denied(await call$(ctx, 'a', 'tool_add', { p_operation_id: crypto.randomUUID(), p_user_tool_id: crypto.randomUUID(), p_availability: 'available', p_effective_date: DAY, p_facts: { manualModel: 'x', heatMethods: { state: 'recorded', methods: ['diffuser'] } } }), 'a diffuser as a heat method');
    },
  },
  {
    id: 'tools.unheated-cannot-coexist-with-a-heated-method-or-a-temperature', area: 'tools', needsProbe: true, run: async ctx => {
      const attempt = (extra: Record<string, unknown>) => call$(ctx, 'a', 'tool_add', { p_operation_id: crypto.randomUUID(), p_user_tool_id: crypto.randomUUID(), p_availability: 'available', p_effective_date: DAY, p_facts: { manualModel: 'Unheated probe', ...extra } });
      await sameCounts(ctx, 'unheated contradictions', async () => {
        denied(await attempt({ heatMethods: { state: 'recorded', methods: ['heated-air', 'unheated'] } }), 'unheated with heated air');
        denied(await attempt({ heatMethods: { state: 'recorded', methods: ['unheated'] }, adjustableTemp: 'yes' }), 'unheated with adjustable temperature');
        denied(await attempt({ heatMethods: { state: 'recorded', methods: ['unheated'] }, settings: { state: 'recorded', items: [{ label: 'Low', temperature: { value: 180, unit: 'C' } }] } }), 'unheated with a temperature');
      });
    },
  },
  {
    id: 'tools.manual-baseline-survives-correction-and-no-op-correction-changes-nothing', area: 'tools', needsProbe: true, run: async ctx => {
      const id = requireState(ctx, 'toolA');
      const before = await toolHistory(ctx, 'a', id);
      const baseline = before.revisions[0];
      const operationId = crypto.randomUUID();
      await sameCounts(ctx, 'a no-op tool correction', async () => {
        denied(await call$(ctx, 'a', 'tool_correct', { p_operation_id: operationId, p_user_tool_id: id, p_expected_revision: before.revision, p_corrects_id: baseline.id, p_reason: 'same', p_effective_date: DAY, p_facts: { manualModel: before.manualModel } }), 'a no-op tool correction', /invalid-correction/);
      });
      ok(await call$(ctx, 'a', 'tool_correct', { p_operation_id: operationId, p_user_tool_id: id, p_expected_revision: before.revision, p_corrects_id: baseline.id, p_reason: 'Fixed the model', p_effective_date: DAY, p_facts: { manualModel: `SC-T5 Dryer Corrected ${ctx.suffix}` } }), 'tool_correct', toolReceipt);
      const after = await toolHistory(ctx, 'a', id);
      check(after.revisions.map(r => r.kind).join(',') === 'baseline,correction', 'the correction was not appended after the baseline');
      check(after.revisions[0].patch?.manualModel === `SC-T5 Dryer ${ctx.suffix}`, 'the original manual model was lost');
      check(after.wattageWatts === 1900, 'the correction disturbed the recorded wattage');
    },
  },
  {
    id: 'tools.direct-table-writes-are-denied', area: 'direct-write', needsProbe: true, run: async ctx => {
      const a = ctx.input.a.id;
      await sameCounts(ctx, 'direct tool writes', async () => {
        privilegeDenied(await send(ctx, 'a', 'POST', '/rest/v1/user_tools', { id: crypto.randomUUID(), owner: a, manual_model: 'Injected', availability: 'available' }), 'inserting a user_tools row');
        privilegeDenied(await send(ctx, 'a', 'POST', '/rest/v1/user_tool_revisions', { id: crypto.randomUUID(), owner: a, user_tool_id: requireState(ctx, 'toolA'), kind: 'change' }), 'inserting a tool revision');
        privilegeDenied(await send(ctx, 'a', 'PATCH', `/rest/v1/user_tools?id=eq.${requireState(ctx, 'toolA')}`, { manual_model: 'Rewritten' }), 'updating a user_tools row');
        privilegeDenied(await send(ctx, 'a', 'DELETE', `/rest/v1/user_tools?id=eq.${requireState(ctx, 'toolA')}`), 'deleting a user_tools row');
        privilegeDenied(await send(ctx, 'b', 'POST', '/rest/v1/user_tools', { id: crypto.randomUUID(), owner: a, manual_model: 'Planted in A', availability: 'available' }), 'planting a tool under another owner');
      });
    },
  },
  // ---- Tools and the tool catalogue ----
  {
    id: 'tool-catalogue.search-exposes-allowlisted-identity-and-lifecycle-only', area: 'tool-catalogue', needsProbe: true, run: async ctx => {
      const reply = await call$(ctx, 'a', 'tool_catalogue_search', { p_query: 'probe dryer', p_limit: 10 });
      const result = ok(reply, 'tool_catalogue_search', ToolSearchResultSchema);
      check(result.results.some(row => row.versionId === FX.tvDryer), 'the synthetic tool version was not found');
      noLeak(reply.text, 'tool search');
      check(!/wattage|temperature|capabilit/i.test(reply.text), 'a capability field reached the search answer');
    },
  },
  {
    id: 'tool-catalogue.detail-exposes-no-unpublished-capability-claim-or-evidence', area: 'tool-catalogue', needsProbe: true, run: async ctx => {
      const reply = await call$(ctx, 'a', 'tool_catalogue_detail', { p_version_id: FX.tvDryer, p_user_tool_id: null });
      const detail = ok(reply, 'tool_catalogue_detail', ToolDetailSchema);
      check(detail.capabilities.state === 'not_published' && detail.claims.state === 'not_published', 'an unpublished section was shown');
      check(detail.owner === null, 'a general tool detail carried owner facts');
      noLeak(reply.text, 'tool detail');
    },
  },
  {
    id: 'tool-catalogue.draft-claims-sources-reviewers-events-and-capabilities-are-unavailable', area: 'tool-catalogue', needsProbe: true, run: async ctx => {
      for (const who of ['a', 'b', 'anonymous'] as const) {
        for (const table of ['tool_claims', 'tool_sources', 'tool_verification_events', 'tool_publications', 'tool_claim_evidence']) {
          nothingVisible(await send(ctx, who, 'GET', `/rest/v1/${table}?select=id`), `${who} reading ${table}`);
        }
      }
      for (const column of ['wattage_watts', 'temperature_max_celsius', 'adjustable_temp', 'contact_heat', 'air_heat', 'successor_version_id']) {
        privilegeDenied(await send(ctx, 'a', 'GET', `/rest/v1/tool_versions?select=${column}`), `reading the draft ${column} column`);
      }
    },
  },
  {
    id: 'tool-catalogue.explicit-match-appends-history-and-keeps-the-manual-identity', area: 'tool-catalogue', needsProbe: true, run: async ctx => {
      const id = requireState(ctx, 'toolA');
      const before = await toolHistory(ctx, 'a', id);
      denied(await call$(ctx, 'a', 'tool_match', { p_operation_id: crypto.randomUUID(), p_user_tool_id: id, p_expected_revision: before.revision, p_version_id: FX.tvDryer, p_confirmed: false }), 'an unconfirmed tool match');
      ok(await call$(ctx, 'a', 'tool_match', { p_operation_id: crypto.randomUUID(), p_user_tool_id: id, p_expected_revision: before.revision, p_version_id: FX.tvDryer, p_confirmed: true }), 'tool_match', toolReceipt);
      const after = await toolHistory(ctx, 'a', id);
      check(after.revisions.at(-1)?.kind === 'match' && after.revisions.length === before.revisions.length + 1, 'the match did not append exactly one entry');
      check(after.manualModel === before.manualModel && after.wattageWatts === 1900, 'matching changed the owner\'s own record');
    },
  },
  {
    id: 'tool-catalogue.owner-bound-detail-returns-facts-only-for-the-caller', area: 'tool-catalogue', needsProbe: true, run: async ctx => {
      const id = requireState(ctx, 'toolA');
      const reply = await call$(ctx, 'a', 'tool_catalogue_detail', { p_version_id: FX.tvDryer, p_user_tool_id: id });
      const own = ok(reply, 'owner-bound tool detail', ToolDetailSchema);
      check(own.owner !== null && own.owner.userToolId === id && own.owner.wattageWatts === 1900, 'the owner context did not return the caller\'s own tool facts');
      check(own.capabilities.state === 'not_published', 'a draft capability appeared in the owner context');
      noLeak(reply.text, 'owner-bound tool detail');
      denied(await call$(ctx, 'b', 'tool_catalogue_detail', { p_version_id: FX.tvDryer, p_user_tool_id: id }), 'B asking for A\'s owner context', /not-found/);
    },
  },
  {
    id: 'tool-catalogue.retired-version-is-labelled-with-no-successor-substitution', area: 'tool-catalogue', needsProbe: true, run: async ctx => {
      const search = ok(await call$(ctx, 'b', 'tool_catalogue_search', { p_query: 'probe steamer', p_limit: 10 }), 'tool_catalogue_search', ToolSearchResultSchema);
      check(search.results.find(row => row.versionId === FX.tvSteamerRetired)?.lifecycle === 'retired', 'the retired tool version was not labelled retired');
      const id = requireState(ctx, 'toolB');
      const before = await toolHistory(ctx, 'b', id);
      ok(await call$(ctx, 'b', 'tool_match', { p_operation_id: crypto.randomUUID(), p_user_tool_id: id, p_expected_revision: before.revision, p_version_id: FX.tvSteamerRetired, p_confirmed: true }), 'matching a retired tool version', toolReceipt);
      const after = await toolHistory(ctx, 'b', id);
      check(after.versionId === FX.tvSteamerRetired && after.versionId !== FX.tvSteamerCurrent, 'the retired exact version was replaced by its successor');
      const detail = ok(await call$(ctx, 'b', 'tool_catalogue_detail', { p_version_id: FX.tvSteamerRetired, p_user_tool_id: id }), 'retired tool detail', ToolDetailSchema);
      check(detail.lifecycle.state === 'retired' && detail.lifecycle.successor.state !== 'published', 'the retired detail was not labelled retired, or a successor was shown unpublished');
    },
  },
  // ---- Export ----
  {
    id: 'export.shelf-is-safe-owner-facts-and-history-only', area: 'export', needsProbe: true, run: async ctx => {
      const document = await exportDocument(ctx, 'a');
      const text = JSON.stringify(document);
      check(text.includes(`SC-T5 Alpha Corrected ${ctx.suffix}`), 'the owner\'s own shelf facts are missing from the export');
      check(!text.includes(`SC-T5 Bravo ${ctx.suffix}`) && !text.includes(`SC-T5 Iron ${ctx.suffix}`), 'the export contains the other owner\'s data');
      noLeak(text, 'the owner export');
      const schema = document.schemaVersions as { export?: unknown } | undefined;
      check(schema?.export === 5, 'the export schema version is not the expected one');
    },
  },
  {
    id: 'export.tools-carry-safe-facts-and-matched-identity-only', area: 'export', needsProbe: true, run: async ctx => {
      const document = await exportDocument(ctx, 'a');
      const text = JSON.stringify(document);
      check(text.includes(`SC-T5 Dryer Corrected ${ctx.suffix}`) && text.includes('"wattage_watts":1900'), 'the owner\'s own tool facts are missing from the export');
      check(!text.includes('"tool_claims"') && !text.includes('"verification_events"') || !/SC-T5-CANARY/.test(text), 'draft tool catalogue content is in the export');
      check(!text.includes(`"wattage_watts":${DRAFT_WATTAGE}`), 'a whole catalogue row (draft capability) is in the export');
      noLeak(text, 'the tool export');
      const tools = document.userTools as { tool?: { version_id?: unknown } }[] | undefined;
      check(Array.isArray(tools) && tools.length === 1, 'the export should hold exactly the owner\'s one tool');
      const other = await exportDocument(ctx, 'b');
      check(!JSON.stringify(other).includes(`SC-T5 Dryer`), 'owner B\'s export contains owner A\'s tool');
    },
  },
  // ---- Anonymous ----
  {
    id: 'anonymous.private-owner-tables-are-unreadable', area: 'anonymous', run: async ctx => {
      for (const table of ['profiles', 'hair_passports', 'passport_revisions', 'user_products', 'user_product_revisions', 'user_tools', 'user_tool_revisions', 'export_jobs']) {
        nothingVisible(await send(ctx, 'anonymous', 'GET', `/rest/v1/${table}?select=*`), `anonymous reading ${table}`);
      }
    },
  },
  {
    id: 'anonymous.private-rpcs-and-mutation-functions-are-unavailable', area: 'anonymous', needsProbe: true, run: async ctx => {
      await sameCounts(ctx, 'anonymous calls', async () => {
        const id = crypto.randomUUID();
        const calls: [string, Record<string, unknown>][] = [
          ['shelf_list', { p_limit: 5, p_cursor: null }], ['tool_list', { p_limit: 5, p_cursor: null }], ['get_passport', { p_as_of: '2026-04-01' }],
          ['shelf_history', { p_user_product_id: id, p_include_audit: true }], ['tool_history', { p_user_tool_id: id, p_include_audit: true }],
          ['shelf_add', { p_operation_id: id, p_user_product_id: id, p_version_id: null, p_manual_brand: null, p_manual_name: 'x', p_manual_category: 'shampoo', p_availability: 'available', p_notes: null, p_effective_date: DAY, p_facts: {} }],
          ['tool_add', { p_operation_id: id, p_user_tool_id: id, p_availability: 'available', p_effective_date: DAY, p_facts: { manualModel: 'x' } }],
          ['shelf_match', { p_operation_id: id, p_user_product_id: id, p_expected_revision: 1, p_version_id: FX.vShampoo, p_confirmed: true }],
          ['tool_match', { p_operation_id: id, p_user_tool_id: id, p_expected_revision: 1, p_version_id: FX.tvDryer, p_confirmed: true }],
          ['catalogue_product_detail', { p_version_id: FX.vShampoo, p_user_product_id: id }], ['tool_catalogue_detail', { p_version_id: FX.tvDryer, p_user_tool_id: id }],
          ['export_request', { p_operation_id: id, p_format: 'json' }], ['export_retention_cleanup', {}],
        ];
        for (const [name, args] of calls) privilegeDenied(await call$(ctx, 'anonymous', name, args), `anonymous calling ${name}`);
      });
    },
  },
  {
    id: 'anonymous.catalogue-identity-follows-the-documented-policy-and-drafts-stay-closed', area: 'anonymous', needsProbe: true, run: async ctx => {
      // Documented policy: the search and detail functions need a signed-in caller, and no catalogue table is readable with the anonymous role.
      privilegeDenied(await call$(ctx, 'anonymous', 'catalogue_search', { p_query: 'calm shampoo', p_limit: 5 }), 'anonymous product search');
      privilegeDenied(await call$(ctx, 'anonymous', 'tool_catalogue_search', { p_query: 'probe dryer', p_limit: 5 }), 'anonymous tool search');
      for (const table of ['brands', 'products', 'product_versions', 'tool_brands', 'tools', 'tool_versions', 'product_claims', 'tool_claims', 'tool_sources', 'tool_verification_events', 'product_verification_events']) {
        nothingVisible(await send(ctx, 'anonymous', 'GET', `/rest/v1/${table}?select=id`), `anonymous reading ${table}`);
      }
    },
  },
  // ---- Direct writes and the consumer boundary ----
  {
    id: 'direct-write.authenticated-consumers-cannot-touch-the-catalogue-or-its-publication', area: 'direct-write', needsProbe: true, run: async ctx => {
      const mutations: [string, 'POST' | 'PATCH' | 'DELETE', string, unknown][] = [
        ['inserting a product version', 'POST', '/rest/v1/product_versions', { id: crypto.randomUUID(), product_id: FX.productShampoo, lifecycle: 'active' }],
        ['retiring a product version', 'PATCH', `/rest/v1/product_versions?id=eq.${FX.vShampoo}`, { lifecycle: 'retired' }],
        ['deleting a product', 'DELETE', `/rest/v1/products?id=eq.${FX.productShampoo}`, undefined],
        ['inserting a tool version', 'POST', '/rest/v1/tool_versions', { id: crypto.randomUUID(), tool_id: FX.toolDryer, version_label: 'x', lifecycle: 'active' }],
        ['changing a tool version capability', 'PATCH', `/rest/v1/tool_versions?id=eq.${FX.tvDryer}`, { wattage_watts: 1 }],
        ['publishing a product direction', 'POST', '/rest/v1/product_publications', { version_id: FX.vShampoo, subject: 'directions', state: 'published' }],
        ['publishing a tool capability', 'POST', '/rest/v1/tool_publications', { version_id: FX.tvDryer, subject: 'capabilities', state: 'published' }],
        ['inserting a tool claim', 'POST', '/rest/v1/tool_claims', { id: crypto.randomUUID(), version_id: FX.tvDryer, claim_key: 'x', statement: 'Planted' }],
        ['inserting a product claim', 'POST', '/rest/v1/product_claims', { id: crypto.randomUUID(), version_id: FX.vShampoo, claim_key: 'x', statement: 'Planted' }],
      ];
      for (const [what, method, path, body] of mutations) privilegeDenied(await send(ctx, 'a', method, path, body), `A ${what}`);
      privilegeDenied(await call$(ctx, 'a', 'export_retention_cleanup', {}), 'A calling the retention cleanup');
    },
  },
  {
    id: 'direct-write.identity-columns-of-the-catalogue-remain-readable-to-consumers', area: 'direct-write', needsProbe: true, run: async ctx => {
      const reply = await send(ctx, 'a', 'GET', `/rest/v1/tool_versions?select=id,version_label,lifecycle&id=eq.${FX.tvDryer}`);
      const rows = ok(reply, 'reading allowlisted tool version columns', z.array(z.object({ id: uuid, version_label: z.string(), lifecycle: z.string() }).strict()));
      check(rows.length === 1, 'the allowlisted identity columns were not readable');
    },
  },
  // ---- Idempotency ----
  {
    id: 'idempotency.identical-shelf-retry-returns-the-same-receipt-and-one-entry', area: 'idempotency', needsProbe: true, run: async ctx => {
      const operationId = crypto.randomUUID();
      const id = crypto.randomUUID();
      const args = { p_operation_id: operationId, p_user_product_id: id, p_version_id: null, p_manual_brand: 'SC-T5 Retry', p_manual_name: `SC-T5 Retry ${ctx.suffix}`, p_manual_category: 'shampoo', p_availability: 'available', p_notes: null, p_effective_date: DAY, p_facts: {} };
      const first = await call$(ctx, 'a', 'shelf_add', args);
      ok(first, 'first shelf_add', shelfReceipt);
      const counts = await ctx.counts();
      const second = await call$(ctx, 'a', 'shelf_add', args);
      ok(second, 'retried shelf_add', shelfReceipt);
      check(first.text === second.text, 'the identical retry returned a different receipt');
      const after = await ctx.counts();
      check(after.user_products === counts.user_products && after.user_product_revisions === counts.user_product_revisions && after.shelf_operations === counts.shelf_operations, 'the identical retry added a row');
      denied(await call$(ctx, 'a', 'shelf_add', { ...args, p_manual_name: `SC-T5 Different ${ctx.suffix}` }), 'the same operation id with a changed payload', /operation-conflict/);
      const final = await ctx.counts();
      check(final.user_product_revisions === counts.user_product_revisions, 'the conflicting payload appended history');
    },
  },
  {
    id: 'idempotency.identical-tool-retry-returns-the-same-receipt-and-one-entry', area: 'idempotency', needsProbe: true, run: async ctx => {
      const operationId = crypto.randomUUID();
      const id = crypto.randomUUID();
      const args = { p_operation_id: operationId, p_user_tool_id: id, p_availability: 'available', p_effective_date: DAY, p_facts: { manualModel: `SC-T5 Retry ${ctx.suffix}` } };
      const first = await call$(ctx, 'a', 'tool_add', args);
      ok(first, 'first tool_add', toolReceipt);
      const counts = await ctx.counts();
      const second = await call$(ctx, 'a', 'tool_add', args);
      ok(second, 'retried tool_add', toolReceipt);
      check(first.text === second.text, 'the identical retry returned a different receipt');
      const after = await ctx.counts();
      check(after.user_tools === counts.user_tools && after.user_tool_revisions === counts.user_tool_revisions && after.tool_operations === counts.tool_operations, 'the identical retry added a row');
      denied(await call$(ctx, 'a', 'tool_add', { ...args, p_facts: { manualModel: `SC-T5 Different ${ctx.suffix}` } }), 'the same operation id with a changed payload', /operation-conflict/);
      check((await ctx.counts()).user_tool_revisions === counts.user_tool_revisions, 'the conflicting payload appended history');
    },
  },
  {
    id: 'idempotency.a-stale-revision-fails-closed-and-changes-nothing', area: 'idempotency', needsProbe: true, run: async ctx => {
      const id = requireState(ctx, 'toolA');
      const current = await toolHistory(ctx, 'a', id);
      await sameCounts(ctx, 'a stale tool change', async () => {
        denied(await call$(ctx, 'a', 'tool_change', { p_operation_id: crypto.randomUUID(), p_user_tool_id: id, p_expected_revision: current.revision - 1, p_availability: null, p_effective_date: DAY, p_facts: { condition: 'worn' } }), 'a stale tool change', /revision-conflict/);
      });
      const shelf = requireState(ctx, 'shelfA');
      const current2 = await shelfHistory(ctx, 'a', shelf);
      await sameCounts(ctx, 'a stale shelf change', async () => {
        denied(await call$(ctx, 'a', 'shelf_change', { p_operation_id: crypto.randomUUID(), p_user_product_id: shelf, p_expected_revision: current2.revision - 1, p_manual_brand: null, p_manual_name: null, p_manual_category: null, p_availability: 'low', p_notes: null, p_effective_date: DAY, p_facts: {} }), 'a stale shelf change', /revision-conflict/);
      });
    },
  },
  // ---- Cue Checks (private owner observations) ----
  {
    id: 'cue-check.owner-records-and-reads-their-own', area: 'cue-check', needsProbe: true, run: async ctx => {
      const executionId = await seedCueExecution(ctx);
      const note = `SC-CUE-${ctx.suffix}-PRIVATE-NOTE`;
      const operationId = crypto.randomUUID();
      ctx.state.cueExecution = executionId;
      ctx.state.cueNote = note;
      ctx.state.cueOperation = operationId;
      const receipt = ok(await call$(ctx, 'a', 'record_cue_check', cueRecordArgs(executionId, cueObservation(note), operationId)), 'record_cue_check (A)', cueReceipt);
      check(receipt.executionId === executionId && receipt.lifecycle === 'active' && receipt.revision === 1, 'the recorded Cue Check is not the active first revision of the routine asked for');
      check(receipt.confirmedSteps.length === 2, 'the confirmed steps were not copied from the stored execution');
      ctx.state.cueRecord = receipt.recordId;
      const list = ok(await call$(ctx, 'a', 'list_cue_checks', { p_limit: 10, p_cursor: null }), 'list_cue_checks (A)', cueList);
      check(list.items.length === 1 && list.items[0]?.recordId === receipt.recordId, 'owner A does not see exactly their own Cue Check in the list');
      const detail = ok(await call$(ctx, 'a', 'get_cue_check', { p_record_id: receipt.recordId }), 'get_cue_check (A)', cueDetail);
      check(detail.revisions.length === 1 && detail.observation.notes === note, 'owner A cannot read back exactly what they recorded');
    },
  },
  {
    id: 'cue-check.b-cannot-read-a', area: 'cue-check', needsProbe: true, run: async ctx => {
      const record = requireState(ctx, 'cueRecord');
      const list = ok(await call$(ctx, 'b', 'list_cue_checks', { p_limit: 10, p_cursor: null }), 'list_cue_checks (B)', cueList);
      check(list.items.length === 0, 'owner B listed a Cue Check that is not theirs');
      denied(await call$(ctx, 'b', 'get_cue_check', { p_record_id: record }), 'B reading A\'s Cue Check', /record-not-found/);
      nothingVisible(await send(ctx, 'b', 'GET', '/rest/v1/cue_checks?select=*'), 'B reading the Cue Check table');
      nothingVisible(await send(ctx, 'b', 'GET', '/rest/v1/cue_check_revisions?select=*'), 'B reading the Cue Check revision table');
    },
  },
  {
    id: 'cue-check.b-cannot-correct-or-void-as-a', area: 'cue-check', needsProbe: true, run: async ctx => {
      const record = requireState(ctx, 'cueRecord');
      await sameCounts(ctx, 'B changing A\'s Cue Check', async () => {
        denied(await call$(ctx, 'b', 'correct_cue_check', { p_operation_id: crypto.randomUUID(), p_record_id: record, p_expected_revision: 1, p_observation: cueObservation('SC-CUE hijack'), p_reason: 'not mine' }), 'B correcting A\'s Cue Check', /record-not-found/);
        denied(await call$(ctx, 'b', 'void_cue_check', { p_operation_id: crypto.randomUUID(), p_record_id: record, p_expected_revision: 1, p_reason: 'not mine' }), 'B removing A\'s Cue Check', /record-not-found/);
      });
      const detail = ok(await call$(ctx, 'a', 'get_cue_check', { p_record_id: record }), 'get_cue_check (A, after B\'s attempts)', cueDetail);
      check(detail.revision === 1 && detail.lifecycle === 'active', 'B\'s refused attempts changed A\'s Cue Check');
    },
  },
  {
    id: 'cue-check.foreign-and-random-ids-are-indistinguishable', area: 'cue-check', needsProbe: true, run: async ctx => {
      const record = requireState(ctx, 'cueRecord');
      const execution = requireState(ctx, 'cueExecution');
      const random = crypto.randomUUID();
      sameRefusal(await call$(ctx, 'b', 'get_cue_check', { p_record_id: record }), await call$(ctx, 'b', 'get_cue_check', { p_record_id: random }), 'get_cue_check');
      const change = (id: string) => ({ p_operation_id: crypto.randomUUID(), p_record_id: id, p_expected_revision: 1, p_observation: cueObservation('SC-CUE probe'), p_reason: 'probe' });
      sameRefusal(await call$(ctx, 'b', 'correct_cue_check', change(record)), await call$(ctx, 'b', 'correct_cue_check', change(random)), 'correct_cue_check');
      const removal = (id: string) => ({ p_operation_id: crypto.randomUUID(), p_record_id: id, p_expected_revision: 1, p_reason: 'probe' });
      sameRefusal(await call$(ctx, 'b', 'void_cue_check', removal(record)), await call$(ctx, 'b', 'void_cue_check', removal(random)), 'void_cue_check');
      sameRefusal(await call$(ctx, 'b', 'record_cue_check', cueRecordArgs(execution, cueObservation('SC-CUE probe'))), await call$(ctx, 'b', 'record_cue_check', cueRecordArgs(random, cueObservation('SC-CUE probe'))), 'record_cue_check');
    },
  },
  {
    id: 'cue-check.anonymous-callers-are-denied', area: 'cue-check', needsProbe: true, run: async ctx => {
      const record = requireState(ctx, 'cueRecord');
      const execution = requireState(ctx, 'cueExecution');
      await sameCounts(ctx, 'anonymous Cue Check calls', async () => {
        const calls: [string, Record<string, unknown>][] = [
          ['list_cue_checks', { p_limit: 5, p_cursor: null }], ['get_cue_check', { p_record_id: record }],
          ['record_cue_check', cueRecordArgs(execution, cueObservation('SC-CUE anonymous'))],
          ['correct_cue_check', { p_operation_id: crypto.randomUUID(), p_record_id: record, p_expected_revision: 1, p_observation: cueObservation('SC-CUE anonymous'), p_reason: 'x' }],
          ['void_cue_check', { p_operation_id: crypto.randomUUID(), p_record_id: record, p_expected_revision: 1, p_reason: 'x' }],
        ];
        for (const [name, args] of calls) privilegeDenied(await call$(ctx, 'anonymous', name, args), `anonymous calling ${name}`);
      });
      for (const table of ['cue_checks', 'cue_check_revisions']) nothingVisible(await send(ctx, 'anonymous', 'GET', `/rest/v1/${table}?select=*`), `anonymous reading ${table}`);
    },
  },
  {
    id: 'cue-check.direct-writes-and-private-receipts-are-denied', area: 'cue-check', needsProbe: true, run: async ctx => {
      const record = requireState(ctx, 'cueRecord');
      await sameCounts(ctx, 'A writing the Cue Check tables directly', async () => {
        const mutations: [string, 'POST' | 'PATCH' | 'DELETE', string, unknown][] = [
          ['inserting a Cue Check', 'POST', '/rest/v1/cue_checks', { id: crypto.randomUUID(), record_id: crypto.randomUUID() }],
          ['rewriting a Cue Check', 'PATCH', `/rest/v1/cue_checks?record_id=eq.${record}`, { lifecycle: 'voided' }],
          ['deleting a Cue Check', 'DELETE', `/rest/v1/cue_checks?record_id=eq.${record}`, undefined],
          ['inserting a revision', 'POST', '/rest/v1/cue_check_revisions', { id: crypto.randomUUID(), record_id: record }],
          ['rewriting a revision', 'PATCH', `/rest/v1/cue_check_revisions?record_id=eq.${record}`, { correction_reason: 'rewritten' }],
          ['deleting a revision', 'DELETE', `/rest/v1/cue_check_revisions?record_id=eq.${record}`, undefined],
        ];
        for (const [what, method, path, body] of mutations) privilegeDenied(await send(ctx, 'a', method, path, body), `A ${what}`);
      });
      // The private operation receipts are not an exposed table at all, and never readable.
      for (const who of ['a', 'b', 'anonymous'] as const) nothingVisible(await send(ctx, who, 'GET', '/rest/v1/cue_check_operations?select=*'), `${who} reading the private Cue Check receipts`);
    },
  },
  {
    id: 'cue-check.export-holds-only-the-owners-records-and-no-receipts', area: 'cue-check', needsProbe: true, run: async ctx => {
      const note = requireState(ctx, 'cueNote');
      const operation = requireState(ctx, 'cueOperation');
      const mine = await exportDocument(ctx, 'a');
      const cues = mine.cueChecks as { revisions?: unknown[] }[] | undefined;
      check(Array.isArray(cues) && cues.length === 1 && Array.isArray(cues[0]?.revisions) && cues[0].revisions.length >= 1, 'the export does not hold exactly the owner\'s one Cue Check with its revisions');
      const text = JSON.stringify(mine);
      check(text.includes(note), 'the owner\'s own note is missing from the export');
      check(!text.includes(operation) && !text.includes('cue_check_operations'), 'a private operation receipt reached the export');
      const other = JSON.stringify(await exportDocument(ctx, 'b'));
      check(!other.includes(note) && !other.includes(requireState(ctx, 'cueRecord')), 'owner B\'s export contains owner A\'s Cue Check');
      const otherCues = (JSON.parse(other) as { cueChecks?: unknown[] }).cueChecks;
      check(Array.isArray(otherCues) && otherCues.length === 0, 'owner B\'s export does not show an empty Cue Check list');
    },
  },
  {
    id: 'cue-check.owner-switch-leaves-no-prior-owner-rows', area: 'cue-check', needsProbe: true, run: async ctx => {
      const note = requireState(ctx, 'cueNote');
      const record = requireState(ctx, 'cueRecord');
      // After the switch to owner B, nothing B can ask for may carry anything of A's: list, detail, tables or export.
      const replies = [
        await call$(ctx, 'b', 'list_cue_checks', { p_limit: 50, p_cursor: null }),
        await call$(ctx, 'b', 'get_cue_check', { p_record_id: record }),
        await send(ctx, 'b', 'GET', '/rest/v1/cue_checks?select=*'),
        await send(ctx, 'b', 'GET', '/rest/v1/cue_check_revisions?select=*'),
      ];
      for (const reply of replies) check(!reply.text.includes(note) && !reply.text.includes(record), 'a reply to owner B carried owner A\'s Cue Check');
      const back = ok(await call$(ctx, 'a', 'get_cue_check', { p_record_id: record }), 'get_cue_check (A, after the switch)', cueDetail);
      check(back.observation.notes === note, 'owner A lost their own Cue Check after owner B acted');
    },
  },
  {
    id: 'cue-check.client-supplied-bound-facts-are-refused', area: 'cue-check', needsProbe: true, run: async ctx => {
      const execution = requireState(ctx, 'cueExecution');
      await sameCounts(ctx, 'Cue Checks carrying client-supplied facts', async () => {
        for (const key of ['userId', 'recommendationRunId', 'goal', 'executionStatus', 'confirmedSteps', 'receivedAt', 'createdAt']) {
          denied(await call$(ctx, 'a', 'record_cue_check', cueRecordArgs(execution, cueObservation('SC-CUE forged', { [key]: 'x' }))), `a Cue Check carrying a client-supplied ${key}`, /invalid-observation/);
        }
      });
    },
  },
  // ---- Archive last, so the earlier scenarios see live items ----
  {
    id: 'shelf.archive-appends-history-and-keeps-the-record', area: 'shelf', run: async ctx => {
      const id = requireState(ctx, 'shelfA');
      const before = await shelfHistory(ctx, 'a', id);
      ok(await call$(ctx, 'a', 'shelf_archive', { p_operation_id: crypto.randomUUID(), p_user_product_id: id, p_expected_revision: before.revision }), 'shelf_archive', shelfReceipt);
      const after = await shelfHistory(ctx, 'a', id);
      check(after.availability === 'archived' && after.revisions.at(-1)?.kind === 'archive' && after.revisions.length === before.revisions.length + 1, 'archiving did not append exactly one archive entry');
      check(after.revisions[0].patch?.manualName === `SC-T5 Alpha ${ctx.suffix}`, 'archiving lost the original baseline');
    },
  },
  {
    id: 'tools.archive-appends-history-and-keeps-the-record', area: 'tools', run: async ctx => {
      const id = requireState(ctx, 'toolA');
      const before = await toolHistory(ctx, 'a', id);
      ok(await call$(ctx, 'a', 'tool_archive', { p_operation_id: crypto.randomUUID(), p_user_tool_id: id, p_expected_revision: before.revision }), 'tool_archive', toolReceipt);
      const after = await toolHistory(ctx, 'a', id);
      check(after.availability === 'archived' && after.revisions.at(-1)?.kind === 'archive' && after.revisions.length === before.revisions.length + 1, 'archiving did not append exactly one archive entry');
      check(after.revisions[0].patch?.manualModel === `SC-T5 Dryer ${ctx.suffix}` && after.wattageWatts === 1900, 'archiving lost the original baseline or the recorded wattage');
    },
  },
];

function validateInput(input: ScenarioInput): void {
  const a = input.a.id;
  const b = input.b.id;
  const bad = (): never => { throw new Error('IDENTITY_INVALID'); };
  if (a === null || b === null || a === b) bad();
  if (input.anonymous.id !== null || input.anonymous.token !== null && input.anonymous.token !== undefined && input.anonymous.token !== '') bad();
}

/** Runs every scenario in order. A scenario that cannot be proven is BLOCKED or FAIL, never PASS. */
export async function runOwnerIsolationScenarios(input: ScenarioInput): Promise<readonly ScenarioResult[]> {
  validateInput(input);
  const probe = input.probe;
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const state: Record<string, string> = {};
  const results: ScenarioResult[] = [];
  const unavailable = (): never => { throw new ScenarioBlocked('a privileged probe is not available on this target, so this cannot be proven'); };
  const context: Context = {
    input, suffix, state, probe: probe ?? ({ exec: unavailable, counts: unavailable } as unknown as PrivilegedProbe),
    counts: () => (probe ? probe.counts() : unavailable()),
  };

  let seeded = false;
  // Every owner needs an active profile before anything else.
  const setup = async (): Promise<string | null> => {
    try {
      for (const [who, name] of [['a', `sc_t5_a_${suffix}`], ['b', `sc_t5_b_${suffix}`]] as const) {
        ok(await call$(context, who, 'complete_account', { p_username: name, p_eligible: true }), `complete_account (${who})`, z.unknown());
      }
      if (probe) { await seedOwnerIsolationFixtures(probe); seeded = true; }
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'setup failed';
    }
  };
  const setupFailure = await setup();
  for (const scenario of SCENARIOS) {
    if (setupFailure !== null) { results.push({ id: scenario.id, area: scenario.area, status: 'FAIL', detail: `setup failed: ${setupFailure}` }); continue; }
    if (scenario.needsProbe && !probe) { results.push({ id: scenario.id, area: scenario.area, status: 'BLOCKED', detail: 'a privileged probe is not available on this target, so this cannot be proven' }); continue; }
    try {
      await scenario.run(context);
      results.push({ id: scenario.id, area: scenario.area, status: 'PASS', detail: 'ok' });
    } catch (error) {
      if (error instanceof ScenarioBlocked) results.push({ id: scenario.id, area: scenario.area, status: 'BLOCKED', detail: error.message });
      else results.push({ id: scenario.id, area: scenario.area, status: 'FAIL', detail: error instanceof Error ? error.message : 'unexpected failure' });
    }
  }
  if (!seeded && probe) results.push({ id: 'setup.fixtures', area: 'idempotency', status: 'FAIL', detail: 'the synthetic fixtures were not seeded' });
  return Object.freeze(results);
}

export interface ScenarioSummary { readonly status: ScenarioStatus; readonly pass: number; readonly fail: number; readonly blocked: number }

export function summarizeScenarioResults(results: readonly ScenarioResult[]): ScenarioSummary {
  const count = (status: ScenarioStatus) => results.filter(result => result.status === status).length;
  const fails = count('FAIL');
  const blocked = count('BLOCKED');
  return { status: fails > 0 ? 'FAIL' : blocked > 0 ? 'BLOCKED' : results.length === 0 ? 'FAIL' : 'PASS', pass: count('PASS'), fail: fails, blocked };
}

/** The refusal's own wording for a failure detail: a stable domain code or a database message, never request data. */
function errorBodySafe(reply: Reply): string {
  const body = reply.json as { message?: unknown } | undefined;
  return typeof body?.message === 'string' ? body.message.slice(0, 80) : 'no message';
}
