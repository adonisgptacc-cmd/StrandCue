import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, BASELINE, complete, database, mutate, USER_A, USER_B } from './harness.ts';

const DAY = { precision: 'day', value: '2024-01-15' };

async function freshAuth(db: PGlite, userId: string) {
  await asUser(db, userId);
  const amr = JSON.stringify([{
    method: 'password',
    timestamp: Math.floor(Date.now()/1000),
  }]);
  const claims = JSON.stringify({
    sub: userId, role: 'authenticated', email: `${userId}@example.test`,
    is_anonymous: false, amr: JSON.parse(amr),
  });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
}

async function staleAuth(db: PGlite, userId: string) {
  await asUser(db, userId);
  const claims = JSON.stringify({
    sub: userId, role: 'authenticated', email: `${userId}@example.test`,
    is_anonymous: false,
    amr: [{ method: 'password', timestamp: 1577836800 }],
  });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
}

async function exportRequest(db: PGlite, operationId = crypto.randomUUID(), format = 'json') {
  return (await db.query<{ result: any }>(`select public.export_request($1, $2) result`, [operationId, format])).rows[0].result;
}

describe('export jobs immutable history and RLS', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    // Consent records survive profile purge by design (7-year retention, no
    // profile foreign key), so they need an explicit wipe between tests.
    await db.exec('delete from public.consent_records');
  });
  afterAll(async () => { await db?.close(); });

  it('enforces RLS on export tables', async () => {
    const rows = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename in ('export_jobs')`,
    );
    expect(rows.rows.map((row) => row.tablename)).toEqual(['export_jobs']);
    const unprotected = await db.query(
      `select relname from pg_class where relname in ('export_jobs') and (not relrowsecurity or not relforcerowsecurity)`,
    );
    expect(unprotected.rows).toEqual([]);
  });

  it('denies direct authenticated writes to export jobs', async () => {
    await complete(db);
    await expect(db.exec(`insert into public.export_jobs(id, owner, format, status) values (gen_random_uuid(), '${USER_A}', 'json', 'completed')`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`update public.export_jobs set status = 'completed'`)).rejects.toThrow(/permission denied|violates/i);
    await asUser(db, USER_B);
    expect((await db.query('select * from public.export_jobs')).rows).toEqual([]);
  });

  it('requires recent authentication to request an export', async () => {
    await complete(db);
    await staleAuth(db, USER_A);
    await expect(exportRequest(db)).rejects.toThrow(/recent-auth-required/i);
    await freshAuth(db, USER_A);
    const receipt = await exportRequest(db);
    expect(receipt.status).toBe('completed');
  });

  it('generates a complete, owner-scoped dataset', async () => {
    await complete(db);
    await mutate(db);
    await mutate(db, { kind: 'change', revision: 1, patch: { porosity: 'unknown' }, date: DAY });
    await freshAuth(db, USER_A);
    const receipt = await exportRequest(db);
    expect(receipt.recordCount).toBeGreaterThan(0);
    const status = await db.query<{ result: any }>(`select public.export_status($1) result`, [receipt.jobId]);
    expect(status.rows[0].result).toMatchObject({ status: 'completed', format: 'json' });
    expect(status.rows[0].result).not.toHaveProperty('document');
    const download = await db.query<{ result: any }>(`select public.export_download($1) result`, [receipt.jobId]);
    const document = download.rows[0].result.document;
    expect(document.profile.username).toBeDefined();
    expect(document.passport.revisions.length).toBeGreaterThan(0);
    // Unknowns round-trip through the export without invented defaults.
    expect(JSON.stringify(document)).toContain('unknown');
    // No foreign records leak in.
    expect(JSON.stringify(document)).not.toContain(USER_B);
  });

  it('is idempotent on same operation key and payload', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    const op = crypto.randomUUID();
    const first = await exportRequest(db, op, 'json');
    expect(await exportRequest(db, op, 'json')).toEqual(first);
    await expect(exportRequest(db, op, 'csv')).rejects.toThrow(/operation-conflict|invalid-format/i);
  });

  it('rejects unsupported formats without creating jobs', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    await expect(exportRequest(db, crypto.randomUUID(), 'xml')).rejects.toThrow(/invalid-format/i);
    const jobs = await db.query(`select * from public.export_jobs`);
    expect(jobs.rows).toEqual([]);
  });

  it('generates one CSV file per table with headers', async () => {
    await complete(db);
    await mutate(db);
    await mutate(db, { kind: 'change', revision: 1, patch: { porosity: 'unknown' }, date: DAY });
    await freshAuth(db, USER_A);
    const receipt = await exportRequest(db, crypto.randomUUID(), 'csv');
    expect(receipt.status).toBe('completed');
    const download = await db.query<{ result: any }>(`select public.export_download($1) result`, [receipt.jobId]);
    const files = download.rows[0].result.document.files;
    for (const name of ['profile.csv', 'passport_revisions.csv', 'service_revisions.csv', 'activity_revisions.csv', 'user_products.csv', 'user_product_revisions.csv', 'user_tools.csv', 'user_tool_revisions.csv']) {
      expect(Object.keys(files)).toContain(name);
    }
    expect(files['profile.csv'].split('\n')[0]).toBe('username,country,currency,temperature_unit,created_at');
    expect(files['profile.csv']).toContain('user_a');
    expect(files['passport_revisions.csv'].split('\n')[0]).toContain('kind');
    // Two passport revisions exported, unknowns preserved.
    expect(files['passport_revisions.csv']).toContain('unknown');
  });

  it('quotes commas, quotes and newlines in CSV fields', async () => {
    await complete(db);
    await mutate(db, { patch: { ...BASELINE, notes: 'plain, "quoted"' } });
    // Text columns keep real newlines (unlike JSON-escaped patch text).
    const up = crypto.randomUUID();
    await db.query(`select public.shelf_add($1,$2,null,'Brand','Name','shampoo','available',$3,$4::jsonb)`,
      [crypto.randomUUID(), up, 'a,"b\nc', JSON.stringify(DAY)]);
    await freshAuth(db, USER_A);
    const receipt = await exportRequest(db, crypto.randomUUID(), 'csv');
    const download = await db.query<{ result: any }>(`select public.export_download($1) result`, [receipt.jobId]);
    const files = download.rows[0].result.document.files;
    // Embedded quotes are doubled inside a wrapped field (RFC 4180).
    expect(files['passport_revisions.csv']).toContain('""');
    // Real newline survives inside the quoted text field.
    expect(files['user_products.csv']).toContain('"a,""b\nc"');
  });

  it('keeps CSV idempotent per operation key', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    const op = crypto.randomUUID();
    const first = await exportRequest(db, op, 'csv');
    expect(await exportRequest(db, op, 'csv')).toEqual(first);
    await expect(exportRequest(db, op, 'json')).rejects.toThrow(/operation-conflict/i);
  });

  it('hides other owners jobs and enforces download expiry', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    const receipt = await exportRequest(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    await expect(db.query(`select public.export_status($1) result`, [receipt.jobId])).rejects.toThrow(/not-found/i);
    await expect(db.query(`select public.export_download($1) result`, [receipt.jobId])).rejects.toThrow(/not-found/i);
    // Expire the job as the system would after 24h; the owner then gets expiry, not data.
    await db.exec('set session authorization postgres');
    await db.exec(`update public.export_jobs set expires_at = now() - interval '1 hour' where id = '${receipt.jobId}'`);
    await freshAuth(db, USER_A);
    await expect(db.query(`select public.export_download($1) result`, [receipt.jobId])).rejects.toThrow(/download-link-expired/i);
  });

  it('retains receipts while purging expired documents', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    const receipt = await exportRequest(db);
    await db.exec('set session authorization postgres');
    await db.exec(`update public.export_jobs set created_at = now() - interval '8 days', completed_at = now() - interval '8 days', expires_at = now() - interval '7 days' where id = '${receipt.jobId}'`);
    await db.exec(`select public.export_retention_cleanup()`);
    const row = await db.query<{ document: unknown; status: string }>(`select document, status from public.export_jobs where id = '${receipt.jobId}'`);
    expect(row.rows[0].document).toBeNull();
    expect(row.rows[0].status).toBe('completed');
  });
});

const CONSENT_RUN_ID = '55555555-5555-4555-8555-555555555555';
const CONSENT_EXECUTION_ID = '44444444-4444-4444-8444-444444444444';

async function setExportConsent(db: PGlite, purpose = 'product_analytics', granted = true, operationId = crypto.randomUUID()) {
  return (await db.query<{ result: any }>(`select public.consent_set($1, $2, $3) result`, [operationId, purpose, granted])).rows[0].result;
}

function guidanceDecision(requestId: string) {
  const step = (stepId: string, position: number) => ({
    stepId, position, action: `Test action ${position}`, productId: null, productVersionId: null,
    toolId: null, toolVersionId: null, waitSeconds: null, rinse: null, reasons: ['test reason'],
  });
  return { status: 'ready', requestId, steps: [step('step-1', 1), step('step-2', 2)] };
}

async function seedTrustedGuidanceRun(db: PGlite, requestId = CONSENT_RUN_ID) {
  await db.exec('set session authorization postgres');
  await db.exec('set session authorization strandcue_mutator');
  try {
    await db.query(
      `select strandcue_private.record_trusted_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
      [requestId, 'd'.repeat(64), '2026-10-13T08:00:00.000Z', '1', 'bundle-synthetic', '1', 'ready',
        JSON.stringify({ requestId, goal: 'basic_wash' }), JSON.stringify(guidanceDecision(requestId))],
    );
  } finally {
    await asUser(db, USER_A);
  }
}

async function startGuidanceExecution(db: PGlite, runId = CONSENT_RUN_ID, executionId = CONSENT_EXECUTION_ID) {
  return (await db.query<{ result: any }>(
    `select public.start_protocol_execution($1,$2,$3,$4::timestamptz) result`,
    [crypto.randomUUID(), executionId, runId, new Date().toISOString()],
  )).rows[0].result;
}

async function seedConsentAndGuidance(db: PGlite) {
  await setExportConsent(db, 'product_analytics', true);
  await setExportConsent(db, 'marketing_email', false);
  await seedTrustedGuidanceRun(db);
  await startGuidanceExecution(db);
}

async function downloadDocument(db: PGlite, format = 'json') {
  await freshAuth(db, USER_A);
  const receipt = await exportRequest(db, crypto.randomUUID(), format);
  const download = await db.query<{ result: any }>(`select public.export_download($1) result`, [receipt.jobId]);
  return { receipt, body: download.rows[0].result.document };
}

// JSON keys every export must carry after Task 11, mapped to their CSV files
// for the parity assertion below.
const EXPORT_CATEGORY_FILES: Record<string, string[]> = {
  profile: ['profile.csv'],
  passport: ['passport_revisions.csv'],
  chemicalServices: ['service_revisions.csv'],
  activities: ['activity_revisions.csv'],
  userProducts: ['user_products.csv', 'user_product_revisions.csv'],
  userTools: ['user_tools.csv', 'user_tool_revisions.csv'],
  consentRecords: ['consent_records.csv'],
  recommendationRuns: ['recommendation_runs.csv'],
  protocolExecutions: ['protocol_executions.csv', 'protocol_execution_events.csv'],
  cueChecks: ['cue_checks.csv', 'cue_check_revisions.csv'],
  schemaVersions: ['schema_versions.csv'],
};

// Curated owner-table registry (verified against information_schema 2026-10-15).
// EXPORTED tables appear in the document (directly or through a parent join);
// EXCLUDED tables carry the documented reason. Any new owner-linked table
// fails this test until it is classified here AND exported or excluded.
const EXPORTED_OWNER_TABLES = new Set([
  'public.activities', 'public.activity_heat_events', 'public.activity_products',
  'public.activity_revisions', 'public.activity_tools', 'public.chemical_services',
  'public.consent_records', 'public.cue_check_revisions', 'public.cue_checks',
  'public.hair_passports', 'public.heat_events',
  'public.passport_revisions', 'public.profiles', 'public.protocol_execution_events',
  'public.protocol_executions', 'public.recommendation_runs', 'public.service_observations',
  'public.service_revisions', 'public.service_zones', 'public.user_product_revisions',
  'public.user_products', 'public.user_tool_revisions', 'public.user_tools',
]);
const EXCLUDED_OWNER_TABLES = new Map<string, string>([
  ['public.export_jobs', 'export receipts about prior exports; embedding prior documents would nest exports recursively; receipts remain via the status API'],
  ['public.deletion_tombstones', 'deletion lifecycle mapping, not user content: surviving fields repeat tombstone fields already covered by profile (username); excluded by the service-internals rule — a cancel-then-restore account can hold lifecycle rows while active, so unreachability is not claimed'],
  ['strandcue_private.activity_operations', 'service-internal idempotency material (operation ids and payloads), never owner content'],
  ['strandcue_private.consent_operations', 'service-internal idempotency material (operation ids and payloads), never owner content'],
  ['strandcue_private.cue_check_operations', 'service-internal idempotency material (operation ids, command payloads and receipts), never owner content'],
  ['strandcue_private.deletion_lifecycle_events', 'Task 9 owner lifecycle history kept in service schema: excluded by the service-internals rule; surviving fields repeat tombstone fields already covered by profile (username)'],
  ['strandcue_private.deletion_operations', 'service-internal idempotency material (operation ids and payloads), never owner content'],
  ['strandcue_private.export_operations', 'service-internal idempotency material (operation ids and payloads), never owner content'],
  ['strandcue_private.passport_operations', 'service-internal idempotency material (operation ids and payloads), never owner content'],
  ['strandcue_private.protocol_execution_operations', 'service-internal idempotency material (operation ids and payloads), never owner content'],
  ['strandcue_private.service_operations', 'service-internal idempotency material (operation ids and payloads), never owner content'],
  ['strandcue_private.shelf_operations', 'service-internal idempotency material (operation ids and payloads), never owner content'],
  ['strandcue_private.tool_operations', 'service-internal idempotency material (operation ids and payloads), never owner content'],
  ['strandcue_private.username_operations', 'service-internal idempotency material (operation ids and payloads), never owner content'],
  ['strandcue_private.username_option_limits', 'service-internal rate-limit state, never owner content'],
]);

// Exact column registry per exported table (information_schema order,
// verified 2026-10-15). The JSON builder embeds whole rows via to_jsonb, so
// any new column would silently enter owner exports: an unregistered column
// fails the test until it gets a classify-or-exclude decision.
const EXPORTED_OWNER_COLUMNS: Record<string, string[]> = {
  'public.activities': ['id', 'owner', 'kind', 'occurred_at', 'precision', 'zones', 'notes', 'status', 'revision', 'created_at', 'updated_at'],
  'public.activity_heat_events': ['id', 'owner', 'activity_id', 'method', 'tool_version', 'temperature', 'passes', 'duration_minutes', 'wet_dry_state', 'created_at'],
  'public.activity_products': ['id', 'owner', 'activity_id', 'product_version', 'applied_at', 'quantity', 'created_at'],
  'public.activity_revisions': ['id', 'owner', 'activity_id', 'sequence', 'base_revision', 'kind', 'effective_date', 'effective_start', 'effective_end', 'recorded_at', 'source', 'patch', 'corrects_id', 'correction_reason', 'void_reason'],
  'public.activity_tools': ['id', 'owner', 'activity_id', 'tool_version', 'applied_at', 'created_at'],
  'public.chemical_services': ['id', 'user_id', 'revision', 'created_at'],
  'public.consent_records': ['id', 'user_id', 'purpose', 'granted', 'recorded_at'],
  'public.cue_checks': ['id', 'user_id', 'record_id', 'execution_id', 'recommendation_run_id', 'goal', 'timing', 'lifecycle', 'revision', 'observed_at', 'received_at', 'observation', 'confirmed_steps', 'execution_status', 'created_at', 'updated_at'],
  'public.cue_check_revisions': ['id', 'user_id', 'record_id', 'sequence', 'kind', 'observation', 'corrects_id', 'correction_reason', 'void_reason', 'received_at'],
  'public.hair_passports': ['id', 'user_id', 'revision', 'current_projection', 'created_at'],
  'public.heat_events': ['service_revision_id', 'service_id', 'user_id', 'method', 'temperature_c', 'passes', 'duration_minutes', 'source', 'provided_fields'],
  'public.passport_revisions': ['id', 'user_id', 'passport_id', 'sequence', 'base_revision', 'kind', 'effective_date', 'effective_start', 'effective_end', 'recorded_at', 'source', 'patch', 'corrects_id', 'correction_reason'],
  'public.profiles': ['user_id', 'username', 'eligible', 'country', 'currency', 'temperature_unit', 'account_status', 'revision', 'created_at', 'username_changed_at'],
  'public.protocol_execution_events': ['id', 'user_id', 'execution_id', 'sequence', 'kind', 'command', 'revision', 'recorded_at'],
  'public.protocol_executions': ['id', 'user_id', 'execution_id', 'recommendation_run_id', 'decision', 'execution', 'revision', 'status', 'created_at', 'updated_at', 'legal_hold'],
  'public.recommendation_runs': ['id', 'user_id', 'request_id', 'input_fingerprint', 'as_of', 'engine_version', 'bundle_id', 'bundle_version', 'status', 'input', 'decision', 'created_at', 'trusted'],
  'public.service_observations': ['id', 'service_id', 'user_id', 'effective_date', 'effective_start', 'effective_end', 'effect_status', 'source', 'recorded_at'],
  'public.service_revisions': ['id', 'user_id', 'service_id', 'sequence', 'base_revision', 'kind', 'facts', 'heat_state', 'effective_start', 'effective_end', 'recorded_at', 'corrects_id', 'correction_reason'],
  'public.service_zones': ['service_revision_id', 'service_id', 'user_id', 'region', 'segment'],
  'public.user_product_revisions': ['id', 'owner', 'user_product_id', 'sequence', 'base_revision', 'kind', 'effective_date', 'effective_start', 'effective_end', 'recorded_at', 'source', 'patch', 'corrects_id', 'correction_reason', 'match_version_id'],
  'public.user_products': ['id', 'owner', 'version_id', 'manual_brand', 'manual_name', 'manual_category', 'availability', 'matched', 'matched_at', 'match_confirmed', 'revision', 'notes', 'created_at', 'updated_at', 'manual_variant', 'manual_size', 'manual_barcode', 'opened_on', 'expiry_on', 'pao', 'quantity_band', 'repurchase_intent'],
  'public.user_tool_revisions': ['id', 'owner', 'user_tool_id', 'sequence', 'base_revision', 'kind', 'effective_date', 'effective_start', 'effective_end', 'recorded_at', 'source', 'patch', 'corrects_id', 'correction_reason', 'match_version_id'],
  'public.user_tools': ['id', 'owner', 'version_id', 'manual_brand', 'manual_model', 'tool_type', 'availability', 'matched', 'matched_at', 'match_confirmed', 'revision', 'notes', 'created_at', 'updated_at', 'wattage_watts', 'adjustable_temp', 'settings', 'attachments', 'condition', 'heat_methods'],
};

async function listOwnerTables(db: PGlite): Promise<string[]> {
  await db.exec('set session authorization postgres');
  try {
    const found = await db.query<{ table_schema: string; table_name: string }>(
      `select c.table_schema, c.table_name from information_schema.columns c
       join information_schema.tables t using (table_schema, table_name)
       where c.table_schema in ('public', 'strandcue_private')
         and c.column_name in ('user_id', 'owner') and t.table_type = 'BASE TABLE'
       group by 1, 2 order by 1, 2`,
    );
    return found.rows.map((row) => `${row.table_schema}.${row.table_name}`);
  } finally {
    await asUser(db, USER_A);
  }
}

function unclassifiedOwnerTables(names: string[]): string[] {
  return names.filter((name) => !EXPORTED_OWNER_TABLES.has(name) && !EXCLUDED_OWNER_TABLES.has(name));
}

describe('export completeness (consent and guidance history)', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.consent_records');
    await db.exec('delete from public.recommendation_runs');
  });
  afterAll(async () => { await db?.close(); });

  it('includes consent history with schema versions in the JSON document', async () => {
    await complete(db);
    await seedConsentAndGuidance(db);
    const { body: document } = await downloadDocument(db, 'json');
    expect(document.consentRecords).toHaveLength(2);
    expect(document.consentRecords[0]).toMatchObject({ purpose: 'product_analytics', granted: true });
    expect(document.consentRecords[1]).toMatchObject({ purpose: 'marketing_email', granted: false });
    // Ordered oldest-first so history reads chronologically.
    const times = document.consentRecords.map((row: any) => new Date(row.recorded_at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(document.schemaVersions).toMatchObject({
      export: 5, consentRecords: 1, recommendationRuns: 1,
      protocolExecutions: 2, protocolExecutionEvents: 1,
      cueChecks: 1, cueCheckRevisions: 1,
    });
  });

  it('includes guidance history: recommendation runs and executions with events', async () => {
    await complete(db);
    await seedConsentAndGuidance(db);
    const { body: document } = await downloadDocument(db, 'json');
    expect(document.recommendationRuns).toHaveLength(1);
    expect(document.recommendationRuns[0]).toMatchObject({ request_id: CONSENT_RUN_ID, status: 'ready' });
    expect(document.recommendationRuns[0].decision).toMatchObject({ status: 'ready' });
    expect(document.protocolExecutions).toHaveLength(1);
    const execution = document.protocolExecutions[0];
    expect(execution).toMatchObject({ execution_id: CONSENT_EXECUTION_ID, status: 'in_progress' });
    expect(execution.events.length).toBeGreaterThanOrEqual(1);
    expect(execution.events[0]).toMatchObject({ kind: 'started', sequence: 1 });
    const sequences = execution.events.map((event: any) => event.sequence);
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
  });

  it('carries the legal-hold flag in both export shapes', async () => {
    await complete(db);
    await seedConsentAndGuidance(db);
    const { body: json } = await downloadDocument(db, 'json');
    expect(json.protocolExecutions[0]).toMatchObject({ legal_hold: false });
    const { body: csv } = await downloadDocument(db, 'csv');
    expect(csv.files['protocol_executions.csv'].split('\n')[0]).toContain('legal_hold');
  });

  it('exposes the same categories in CSV as in JSON', async () => {
    await complete(db);
    await seedConsentAndGuidance(db);
    const { body: json } = await downloadDocument(db, 'json');
    const { body: csv } = await downloadDocument(db, 'csv');
    // Every promised JSON category exists and has its CSV file(s) with headers.
    for (const [key, files] of Object.entries(EXPORT_CATEGORY_FILES)) {
      expect(json, `json key ${key}`).toHaveProperty(key);
      for (const file of files) {
        expect(Object.keys(csv.files), `csv file ${file}`).toContain(file);
        expect(csv.files[file].split('\n')[0].length, `header of ${file}`).toBeGreaterThan(0);
      }
    }
    expect(csv.files['consent_records.csv'].split('\n')[0]).toBe('id,purpose,granted,recorded_at');
    expect(csv.files['consent_records.csv']).toContain('product_analytics');
    expect(csv.files['recommendation_runs.csv'].split('\n')[0]).toContain('request_id');
    expect(csv.files['recommendation_runs.csv']).toContain(CONSENT_RUN_ID);
    expect(csv.files['protocol_executions.csv'].split('\n')[0]).toContain('execution_id');
    expect(csv.files['protocol_execution_events.csv'].split('\n')[0]).toContain('sequence');
    // Row parity: same rows in both shapes.
    expect(json.consentRecords).toHaveLength(csv.files['consent_records.csv'].split('\n').length - 1);
    expect(json.recommendationRuns).toHaveLength(csv.files['recommendation_runs.csv'].split('\n').length - 1);
    expect(json.protocolExecutions).toHaveLength(csv.files['protocol_executions.csv'].split('\n').length - 1);
    // Nested events parity: every nested JSON event has its CSV row and back.
    const nestedEvents = json.protocolExecutions.reduce((sum: number, row: any) => sum + row.events.length, 0);
    expect(nestedEvents).toBeGreaterThan(0);
    expect(nestedEvents).toBe(csv.files['protocol_execution_events.csv'].split('\n').length - 1);
    // Schema-version parity: the CSV version file matches the JSON block exactly.
    expect(csv.files['schema_versions.csv'].split('\n')[0]).toBe('family,version');
    const csvVersions = Object.fromEntries(
      csv.files['schema_versions.csv'].split('\n').slice(1).map((line: string) => line.split(',')));
    expect(csvVersions).toEqual({ export: '5', consentRecords: '1', recommendationRuns: '1', protocolExecutions: '2', protocolExecutionEvents: '1', cueChecks: '1', cueCheckRevisions: '1' });
    expect(csvVersions).toEqual(Object.fromEntries(Object.entries(json.schemaVersions).map(([family, version]) => [family, String(version)])));
  });

  it('counts consent and guidance rows in record_count', async () => {
    await complete(db);
    await seedConsentAndGuidance(db);
    const { receipt, body: document } = await downloadDocument(db, 'json');
    const eventRows = document.protocolExecutions.reduce((sum: number, row: any) => sum + row.events.length, 0);
    const cueRevisionRows = document.cueChecks.reduce((sum: number, row: any) => sum + row.revisions.length, 0);
    const expected = document.passport.revisions.length
      + document.chemicalServices.flatMap((service: any) => service.revisions).length
      + document.activities.flatMap((activity: any) => activity.revisions).length
      + document.userProducts.flatMap((product: any) => product.revisions).length
      + document.userTools.flatMap((tool: any) => tool.revisions).length
      + document.consentRecords.length + document.recommendationRuns.length
      + document.protocolExecutions.length + eventRows
      + document.cueChecks.length + cueRevisionRows;
    expect(expected).toBeGreaterThan(document.passport.revisions.length);
    expect(receipt.recordCount).toBe(expected);
  });

  it('keeps other owners consent and guidance rows out of the export', async () => {
    await complete(db);
    await seedConsentAndGuidance(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    await setExportConsent(db, 'product_analytics', true);
    await db.query(
      `select public.record_recommendation_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
      ['66666666-6666-4666-8666-666666666666', 'e'.repeat(64), '2026-10-11T09:00:00.000Z',
        '1', 'bundle-synthetic', '1', 'content_pending',
        JSON.stringify({ requestId: 'b-run', goal: 'basic_wash' }), JSON.stringify({ status: 'needs_input', steps: [] })],
    );
    await asUser(db, USER_A);
    const { body: document } = await downloadDocument(db, 'json');
    const serialized = JSON.stringify(document);
    expect(serialized).not.toContain(USER_B);
    expect(serialized).not.toContain('66666666-6666-4666-8666-666666666666');
    expect(document.consentRecords).toHaveLength(2);
    expect(document.recommendationRuns).toHaveLength(1);
  });

  /** Seeds one owner with a terminal execution plus a corrected Cue Check. */
  async function seedCueCheckFor(db: PGlite, owner: string, username: string) {
    await asUser(db, owner);
    await complete(db, username);
    const runId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    await db.exec('set session authorization postgres');
    await db.exec('set session authorization strandcue_mutator');
    try {
      await db.query(
        `select strandcue_private.record_trusted_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
        [runId, 'd'.repeat(64), '2026-10-13T08:00:00.000Z', '1', 'bundle-synthetic', '1', 'ready',
          JSON.stringify({ requestId: runId, goal: 'basic_wash' }),
          JSON.stringify(guidanceDecision(runId))],
      );
    } finally {
      await asUser(db, owner);
    }
    await db.query(`select public.start_protocol_execution($1,$2,$3,$4::timestamptz)`,
      [crypto.randomUUID(), executionId, runId, new Date().toISOString()]);
    const transition = (expectedRevision: number, command: unknown) =>
      db.query(`select public.apply_protocol_execution_command($1,$2,$3,$4::jsonb,$5::timestamptz)`,
        [crypto.randomUUID(), executionId, expectedRevision, JSON.stringify(command), new Date().toISOString()]);
    await transition(0, { kind: 'complete-step', stepId: 'step-1' });
    await transition(1, { kind: 'complete-step', stepId: 'step-2' });
    await transition(2, { kind: 'complete' });
    const observation = { timing: 'immediate', observedAt: new Date().toISOString(), overallResult: 'better', frizz: 'less' };
    const created = (await db.query<{ result: any }>(
      'select public.record_cue_check($1,$2,$3::jsonb) result',
      [crypto.randomUUID(), executionId, JSON.stringify(observation)],
    )).rows[0].result;
    await db.query('select public.correct_cue_check($1,$2,$3,$4::jsonb,$5) result',
      [crypto.randomUUID(), created.recordId, 1,
        JSON.stringify({ ...observation, frizz: 'same', notes: 'reconsidered' }), 'reconsidered']);
    return { runId, executionId, recordId: created.recordId };
  }

  it('includes Cue Check records and revision history in the JSON document', async () => {
    const { runId, executionId, recordId } = await seedCueCheckFor(db, USER_A, 'user_a');
    const { body: document } = await downloadDocument(db, 'json');
    expect(document.cueChecks).toHaveLength(1);
    const record = document.cueChecks[0];
    expect(record).toMatchObject({
      record_id: recordId,
      execution_id: executionId,
      recommendation_run_id: runId,
      goal: 'basic_wash',
      timing: 'immediate',
      lifecycle: 'active',
      revision: 2,
      execution_status: 'completed',
    });
    expect(record.revisions).toHaveLength(2);
    expect(record.revisions[0]).toMatchObject({ kind: 'create', sequence: 1 });
    expect(record.revisions[1]).toMatchObject({ kind: 'correct', sequence: 2, correction_reason: 'reconsidered' });
    // Confirmed actual use travels with the record; planned-but-unconfirmed
    // steps never appear as performed.
    expect(record.confirmed_steps.map((step: any) => step.stepId)).toEqual(['step-1', 'step-2']);
  });

  it('carries the same Cue Check rows in the CSV bundle', async () => {
    await seedCueCheckFor(db, USER_A, 'user_a');
    const { body: json } = await downloadDocument(db, 'json');
    const { body: csv } = await downloadDocument(db, 'csv');
    expect(csv.files['cue_checks.csv'].split('\n')[0])
      .toBe('id,user_id,record_id,execution_id,recommendation_run_id,goal,timing,lifecycle,revision,observed_at,received_at,observation,confirmed_steps,execution_status,created_at,updated_at');
    expect(csv.files['cue_check_revisions.csv'].split('\n')[0])
      .toBe('id,user_id,record_id,sequence,kind,observation,corrects_id,correction_reason,void_reason,received_at');
    // Row parity: the CSV files and the JSON family carry the same rows.
    expect(json.cueChecks).toHaveLength(csv.files['cue_checks.csv'].split('\n').length - 1);
    const revisionRows = json.cueChecks.reduce((sum: number, row: any) => sum + row.revisions.length, 0);
    expect(revisionRows).toBe(csv.files['cue_check_revisions.csv'].split('\n').length - 1);
    expect(csv.files['cue_check_revisions.csv']).toContain('reconsidered');
  });

  it('counts Cue Check rows in record_count', async () => {
    await seedCueCheckFor(db, USER_A, 'user_a');
    const { receipt, body: document } = await downloadDocument(db, 'json');
    const cueRows = document.cueChecks.reduce((sum: number, row: any) => sum + 1 + row.revisions.length, 0);
    const expected = document.recommendationRuns.length
      + document.protocolExecutions.length
      + document.protocolExecutions.reduce((sum: number, row: any) => sum + row.events.length, 0)
      + cueRows;
    expect(receipt.recordCount).toBe(expected);
  });

  it('keeps other owners Cue Checks out of the export and never ships operation material', async () => {
    await seedCueCheckFor(db, USER_A, 'user_a');
    const foreign = await seedCueCheckFor(db, USER_B, 'user_b');
    await asUser(db, USER_A);
    const { body: document } = await downloadDocument(db, 'json');
    const serialized = JSON.stringify(document);
    expect(serialized).not.toContain(foreign.recordId);
    expect(document.cueChecks).toHaveLength(1);
    // Operation-ledger payloads and fingerprints are private service data.
    expect(serialized).not.toContain('operationId');
    expect(serialized).not.toContain('operation_id');
  });

  it('fails when a new owner-linked table exists but is unclassified', async () => {
    const names = await listOwnerTables(db);
    expect(unclassifiedOwnerTables(names)).toEqual([]);
    // The registry itself stays honest: every entry still exists and every
    // exclusion carries its reason. 23 exported + 15 excluded = 38 owner
    // tables = 25 public + 13 strandcue_private.
    expect(names).toHaveLength(38);
    expect(EXPORTED_OWNER_TABLES.size).toBe(23);
    expect(EXCLUDED_OWNER_TABLES.size).toBe(15);
    for (const name of [...EXPORTED_OWNER_TABLES, ...EXCLUDED_OWNER_TABLES.keys()]) {
      expect(names, `registry entry ${name} still exists`).toContain(name);
    }
    for (const [name, reason] of EXCLUDED_OWNER_TABLES) {
      expect(reason.length, `exclusion reason for ${name}`).toBeGreaterThan(0);
    }
  });

  it('fails when an exported table gains an unregistered column', async () => {
    expect(Object.keys(EXPORTED_OWNER_COLUMNS).sort()).toEqual([...EXPORTED_OWNER_TABLES].sort());
    await db.exec('set session authorization postgres');
    try {
      for (const table of Object.keys(EXPORTED_OWNER_COLUMNS)) {
        const [schema, name] = table.split('.');
        const cols = await db.query<{ column_name: string }>(
          `select column_name from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position`,
          [schema, name],
        );
        expect(cols.rows.map((row) => row.column_name), `columns of ${table}`).toEqual(EXPORTED_OWNER_COLUMNS[table]);
      }
    } finally {
      await asUser(db, USER_A);
    }
  });

  it('flags a planted unclassified owner table and leaves no trace', async () => {
    await db.exec('set session authorization postgres');
    await db.query('begin');
    try {
      await db.query('create table public.zz_tripwire_probe (id uuid primary key default gen_random_uuid(), user_id uuid not null)');
      const found = await db.query<{ table_schema: string; table_name: string }>(
        `select c.table_schema, c.table_name from information_schema.columns c
         join information_schema.tables t using (table_schema, table_name)
         where c.table_schema in ('public', 'strandcue_private')
           and c.column_name in ('user_id', 'owner') and t.table_type = 'BASE TABLE'
         group by 1, 2 order by 1, 2`,
      );
      const names = found.rows.map((row) => `${row.table_schema}.${row.table_name}`);
      // The tripwire fires on the planted table: this is the failure a real
      // unclassified table would produce.
      expect(unclassifiedOwnerTables(names)).toEqual(['public.zz_tripwire_probe']);
    } finally {
      await db.query('rollback');
    }
    // Rolled back: the probe is gone and the registry is clean again.
    expect(unclassifiedOwnerTables(await listOwnerTables(db))).toEqual([]);
  });
});
