import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { asUser, complete, database, USER_A } from './harness.ts';

const REGISTRY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_VERSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TOOL_VERSION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EVIDENCE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

let db: PGlite;

async function privileged(sql: string, params: unknown[] = []) {
  await db.exec('set session authorization postgres');
  return db.query(sql, params);
}

function content() {
  return {
    schemaVersion: 1, registryId: REGISTRY_ID, evidenceRegistryId: 'synthetic-registry', evidenceRegistryVersion: '1',
    evidence: [{ evidenceId: EVIDENCE_ID, sourceUrl: 'https://example.test/synthetic',
      versionIds: [PRODUCT_VERSION, TOOL_VERSION].sort(), claim: 'Synthetic exact version claim',
      limitations: 'Test fixture only', checkedAt: '2026-10-20T00:00:00Z', reviewedAt: '2026-10-21T00:00:00Z',
      status: 'reviewed', market: 'ZA', trustTier: 'T5' }],
    bindings: [
      { kind: 'product', versionId: PRODUCT_VERSION, capability: 'heat-protection', evidenceIds: [EVIDENCE_ID],
        decision: 'approved', authoredBy: 'Synthetic Capability Author', reviewedBy: 'Synthetic Capability Reviewer',
        reviewedAt: '2026-10-22T00:00:00Z' },
      { kind: 'tool', versionId: TOOL_VERSION, capability: 'heat-tool', evidenceIds: [EVIDENCE_ID],
        decision: 'approved', authoredBy: 'Synthetic Capability Author', reviewedBy: 'Synthetic Capability Reviewer',
        reviewedAt: '2026-10-22T00:00:00Z' },
    ],
  };
}

async function seedVersions() {
  await db.exec('set session authorization postgres');
  await db.exec(`insert into public.brands(id,name) values ('11111111-1111-4111-8111-111111111111','Synthetic product brand');
    insert into public.products(id,brand_id,name,category) values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Synthetic product','heat protectant');
    insert into public.product_versions(id,product_id) values ('${PRODUCT_VERSION}','22222222-2222-4222-8222-222222222222');
    insert into public.tool_brands(id,name) values ('33333333-3333-4333-8333-333333333333','Synthetic tool brand');
    insert into public.tools(id,brand_id,name,tool_type) values ('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','Synthetic tool','dryer');
    insert into public.tool_versions(id,tool_id,version_label) values ('${TOOL_VERSION}','44444444-4444-4444-8444-444444444444','Synthetic version');`);
}

async function publish(value: Record<string, unknown> = content()) {
  return privileged(`with payload as (select $2::jsonb content), bound as (
      select content,'sha256:'||encode(sha256(convert_to(content::text,'UTF8')),'hex') digest from payload)
    insert into strandcue_private.heat_capability_publications
      (id,content_digest,content,state,adopted_by,adopted_at,adopted_digest,approved_by,approved_at,approved_digest,published_at)
    select $1,digest,content,'published','Synthetic Human A',now(),digest,
      'Synthetic Human B',now(),digest,now() from bound returning content_digest`, [REGISTRY_ID, JSON.stringify(value)]);
}

beforeAll(async () => { db = await database(); await seedVersions(); }, 30_000);
beforeEach(async () => {
  await db.exec('set session authorization postgres');
  await db.exec('alter table strandcue_private.heat_capability_publications disable trigger heat_capability_guard');
  await db.exec('delete from strandcue_private.heat_capability_publications');
  await db.exec('alter table strandcue_private.heat_capability_publications enable trigger heat_capability_guard');
});
afterAll(async () => { await db?.close(); });

describe('Heat Coach exact capability registry', () => {
  it('publishes only independently reviewed, evidenced exact product and tool capabilities', async () => {
    const published = await publish();
    const digest = (published.rows[0] as { content_digest: string }).content_digest;
    const matched = await privileged(`select strandcue_private.heat_capability_binding($1,$2,'product',$3) product,
      strandcue_private.heat_capability_binding($1,$2,'tool',$4) tool,
      strandcue_private.heat_capability_binding($1,$2,'product',$4) mismatch`,
      [REGISTRY_ID, digest, PRODUCT_VERSION, TOOL_VERSION]);
    expect((matched.rows[0] as any).product).toEqual({ review: 'reviewed', verifiedCapabilities: ['heat-protection'], satisfiesExactCapability: true });
    expect((matched.rows[0] as any).tool).toEqual({ review: 'reviewed', verifiedCapabilities: ['heat-tool'], satisfiesExactCapability: true });
    expect((matched.rows[0] as any).mismatch).toEqual({ review: 'not_reviewed', verifiedCapabilities: [], satisfiesExactCapability: false });
    await asUser(db, USER_A);
    await expect(db.query('select * from strandcue_private.heat_capability_publications')).rejects.toThrow();
    await expect(db.query('select * from strandcue_private.heat_capability_registry')).rejects.toThrow();
  });

  it('rejects a changed digest, unreviewed evidence, self review and unknown catalogue versions', async () => {
    await expect(privileged(`insert into strandcue_private.heat_capability_publications
      (id,content_digest,content,state,adopted_by,adopted_at,adopted_digest,approved_by,approved_at,approved_digest,published_at)
      values ($1,$2,$3::jsonb,'published','Synthetic Human A',now(),$2,'Synthetic Human B',now(),$2,now())`,
      [REGISTRY_ID, `sha256:${'a'.repeat(64)}`, JSON.stringify(content())])).rejects.toThrow();
    await expect(publish({ ...content(), evidence: [{ ...content().evidence[0], status: 'draft' }] })).rejects.toThrow();
    await expect(publish({ ...content(), bindings: [{ ...content().bindings[0], reviewedBy: 'Synthetic Capability Author' }] })).rejects.toThrow();
    await expect(publish({ ...content(), bindings: [{ ...content().bindings[0], versionId: '99999999-9999-4999-8999-999999999999' }] })).rejects.toThrow();
    const count = await privileged('select count(*)::integer n from strandcue_private.heat_capability_publications');
    expect((count.rows[0] as { n: number }).n).toBe(0);
  });

  it('withdraws a registry without changing its reviewed history or supplying current capabilities', async () => {
    const published = await publish();
    const digest = (published.rows[0] as { content_digest: string }).content_digest;
    await expect(privileged(`update strandcue_private.heat_capability_publications
      set content=jsonb_set(content,'{evidenceRegistryVersion}','"2"') where id=$1`, [REGISTRY_ID])).rejects.toThrow(/heat-capability-immutable/);
    await privileged(`update strandcue_private.heat_capability_publications set state='withdrawn' where id=$1`, [REGISTRY_ID]);
    const matched = await privileged(`select strandcue_private.heat_capability_binding($1,$2,'product',$3) binding`,
      [REGISTRY_ID, digest, PRODUCT_VERSION]);
    expect((matched.rows[0] as any).binding).toEqual({ review: 'not_reviewed', verifiedCapabilities: [], satisfiesExactCapability: false });
  });

  it('constructs exact reviewed bindings only for owner-confirmed catalogue matches', async () => {
    const published = await publish();
    const digest = (published.rows[0] as { content_digest: string }).content_digest;
    await asUser(db, USER_A);
    await complete(db);
    await privileged(`insert into public.user_products(id,owner,version_id,matched,match_confirmed,matched_at)
      values ('55555555-5555-4555-8555-555555555555',$1,$2,true,true,now()),
             ('66666666-6666-4666-8666-666666666666',$1,$2,false,false,null)`, [USER_A, PRODUCT_VERSION]);
    await privileged(`insert into public.user_tools(id,owner,version_id,matched,match_confirmed,matched_at)
      values ('77777777-7777-4777-8777-777777777777',$1,$2,true,true,now())`, [USER_A, TOOL_VERSION]);
    const result = await privileged(`select strandcue_private.heat_construct_input($1,$2::jsonb,now(),$3,$4) input`,
      [USER_A, JSON.stringify({ method: { state: 'unknown' }, temperature: { state: 'unknown' },
        setting: { state: 'unknown' }, passes: { state: 'unknown' }, durationMinutes: { state: 'unknown' }, zones: [] }),
      REGISTRY_ID, digest]);
    const prepared = (result.rows[0] as { input: { preparedInput: { products: any[]; tools: any[] } } }).input.preparedInput;
    expect(prepared.products[0]).toMatchObject({ identity: 'exact', versionId: PRODUCT_VERSION,
      review: 'reviewed', verifiedCapabilities: ['heat-protection'], satisfiesExactCapability: true });
    expect(prepared.products[1]).toMatchObject({ identity: 'manual', versionId: null,
      review: 'not_applicable', verifiedCapabilities: [], satisfiesExactCapability: false });
    expect(prepared.tools[0]).toMatchObject({ identity: 'exact', versionId: TOOL_VERSION,
      review: 'reviewed', verifiedCapabilities: ['heat-tool'], satisfiesExactCapability: true });
  });

  it('stops a capability when its exact catalogue version is withdrawn later', async () => {
    const published = await publish();
    const digest = (published.rows[0] as { content_digest: string }).content_digest;
    await privileged("update public.product_versions set lifecycle='retired' where id=$1", [PRODUCT_VERSION]);
    const result = await privileged(`select strandcue_private.heat_capability_binding($1,$2,'product',$3) binding`,
      [REGISTRY_ID, digest, PRODUCT_VERSION]);
    expect((result.rows[0] as any).binding).toEqual({
      review: 'not_reviewed', verifiedCapabilities: [], satisfiesExactCapability: false,
    });
  });
});
