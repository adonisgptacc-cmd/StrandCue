import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asUser, complete, database, USER_A } from './harness.ts';
import { seedSyntheticHeatCapabilityRegistry } from './support/heat-capability-fixtures.ts';
import { prepareSyntheticHeatRule, seedSyntheticHeatRule } from './support/heat-publication-fixtures.ts';

let db: PGlite;

beforeAll(async () => { db = await database(); }, 30_000);
afterAll(async () => { await db?.close(); });

const ruleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const query = (sql: string, values: unknown[] = []) => db.query<Record<string, unknown>>(sql, values);

function rule(id = ruleId) {
  return {
    schemaVersion: 1, publicationId: id, ruleVersion: '1.0.0',
    lifecycle: 'reviewed', validFrom: '2026-01-01T00:00:00.000Z', validUntil: null,
    requiredProductCapability: null, allowedMethods: ['unheated'],
    limits: { temperatures: [], namedSettings: [], maximumPasses: null, maximumDurationMinutes: null },
    necessityRules: [], hardRestrictions: [], alternatives: [],
    reasonCode: 'fixture', copyKey: 'heat.fixture',
  };
}

describe('Heat Coach PostgreSQL publication envelope', () => {
  it('rejects a published executable rule with no reviewed packet', async () => {
    await expect(db.query(`with source as (select $2::jsonb rule), bound as (
        select rule,encode(sha256(convert_to(rule::text,'UTF8')),'hex') digest from source)
      insert into strandcue_private.heat_rule_publications
        (id,content_digest,rule,state,authored_by,reviewed_by,reviewed_at,published_at)
      select $1,'sha256:'||digest,rule||jsonb_build_object('digest',digest),
        'published','Fixture Author','Fixture Reviewer',now(),now() from bound`,
    [ruleId, JSON.stringify(rule())])).rejects.toThrow(/heat-publication-review-invalid/);
  });

  it('accepts a fully bound synthetic evidence and copy packet', async () => {
    const registry = await seedSyntheticHeatCapabilityRegistry(query);
    const id = crypto.randomUUID();
    const published = await seedSyntheticHeatRule(query, id, rule(id), registry);
    const rows = await db.query<{ review_envelope: Record<string, unknown> }>(
      'select review_envelope from strandcue_private.heat_rule_publications where id=$1', [id]);
    expect(rows.rows[0]!.review_envelope).toEqual(published.reviewEnvelope);
  });

  it('rejects an executable rule with fields outside the reviewed schema', async () => {
    const registry = await seedSyntheticHeatCapabilityRegistry(query);
    const id = crypto.randomUUID();
    const prepared = await prepareSyntheticHeatRule(query, { ...rule(id), inventedLimit: 180 }, registry);
    await expect(db.query(`insert into strandcue_private.heat_rule_publications
      (id,content_digest,rule,review_envelope,state,authored_by,reviewed_by,reviewed_at,published_at)
      values($1,$2,$3::jsonb,$4::jsonb,'published','Synthetic Rule Author','Synthetic Rule Reviewer',now(),now())`,
    [id, prepared.contentDigest, JSON.stringify(prepared.rule), JSON.stringify(prepared.reviewEnvelope)]))
      .rejects.toThrow(/heat-publication-review-invalid/);
  });

  it('rejects an unknown product capability even when its review packet is intact', async () => {
    const registry = await seedSyntheticHeatCapabilityRegistry(query);
    const id = crypto.randomUUID();
    const prepared = await prepareSyntheticHeatRule(query, { ...rule(id), requiredProductCapability: 'invented-protection' }, registry);
    await expect(db.query(`insert into strandcue_private.heat_rule_publications
      (id,content_digest,rule,review_envelope,state,authored_by,reviewed_by,reviewed_at,published_at)
      values($1,$2,$3::jsonb,$4::jsonb,'published','Synthetic Rule Author','Synthetic Rule Reviewer',now(),now())`,
    [id, prepared.contentDigest, JSON.stringify(prepared.rule), JSON.stringify(prepared.reviewEnvelope)]))
      .rejects.toThrow(/heat-publication-review-invalid/);
  });

  it.each([
    ['missing valid-from instant', { validFrom: null }],
    ['null schema version', { schemaVersion: null }],
    ['string schema version', { schemaVersion: '1' }],
    ['null publication id', { publicationId: null }],
    ['invalid named setting', { limits: { temperatures: [], namedSettings: [{ toolVersionId: null, label: null }], maximumPasses: null, maximumDurationMinutes: null } }],
    ['invalid alternative', { alternatives: [{ method: null, temperature: null, setting: null, reasonCode: null, copyKey: 'heat.fixture', toolVersionId: null, productVersionId: null }] }],
    ['malformed alternative temperature', { alternatives: [{ method: 'heated-air', temperature: { unit: 'C', value: 'hot' }, setting: null, reasonCode: 'alternative', copyKey: 'heat.fixture', toolVersionId: null, productVersionId: null }] }],
    ['unknown heat method', { allowedMethods: ['invented-method'] }],
    ['null reason code', { reasonCode: null }],
    ['text numeric limit', { limits: { temperatures: [{ unit: 'C', maximum: 'hot' }, { unit: 'F', maximum: 300 }], namedSettings: [], maximumPasses: null, maximumDurationMinutes: null } }],
    ['unknown necessity', { necessityRules: [{ necessity: 'guaranteed', goals: ['basic_wash'], concerns: [] }] }],
    ['restriction without outcome', { hardRestrictions: [{ concerns: [], servicePresence: null, zones: [], outcome: null, reasonCode: 'restriction', copyKey: 'heat.restriction' }] }],
  ] as const)('rejects %s in a digest-bound rule', async (_label, changed) => {
    const registry = await seedSyntheticHeatCapabilityRegistry(query);
    const id = crypto.randomUUID();
    const prepared = await prepareSyntheticHeatRule(query, { ...rule(id), ...changed }, registry);
    await expect(db.query(`insert into strandcue_private.heat_rule_publications
      (id,content_digest,rule,review_envelope,state,authored_by,reviewed_by,reviewed_at,published_at)
      values($1,$2,$3::jsonb,$4::jsonb,'published','Synthetic Rule Author','Synthetic Rule Reviewer',now(),now())`,
    [id, prepared.contentDigest, JSON.stringify(prepared.rule), JSON.stringify(prepared.reviewEnvelope)]))
      .rejects.toThrow(/heat-publication-review-invalid/);
  });

  it('refuses assessment when its exact capability registry is withdrawn', async () => {
    await asUser(db, USER_A);
    await complete(db, `heat_${crypto.randomUUID().slice(0, 8)}`);
    const registry = await seedSyntheticHeatCapabilityRegistry(query);
    const id = crypto.randomUUID();
    const published = await seedSyntheticHeatRule(query, id, rule(id), registry);
    await db.query('update strandcue_private.heat_capability_publications set state=$2 where id=$1',
      [registry.id, 'withdrawn']);
    await asUser(db, USER_A);
    await expect(db.query('select public.create_heat_coach_assessment($1,$2,$3,$4::jsonb)', [
      crypto.randomUUID(), id, published.contentDigest, JSON.stringify({
        method: { state: 'unknown' }, temperature: { state: 'unknown' }, setting: { state: 'unknown' },
        passes: { state: 'unknown' }, durationMinutes: { state: 'unknown' }, zones: [],
      }),
    ])).rejects.toThrow(/heat-content-pending/);
  });

  it('rejects null copy review time even when every content digest is rebound', async () => {
    const registry = await seedSyntheticHeatCapabilityRegistry(query);
    const id = crypto.randomUUID();
    const prepared = await prepareSyntheticHeatRule(query, rule(id), registry);
    const packet = prepared.reviewEnvelope as Record<string, any>;
    const copy = packet.copy.map((item: Record<string, unknown>) => ({ ...item, reviewedAt: null }));
    const hashes = await db.query<{ copyDigest: string; reviewedDigest: string }>(`with copy as (
      select 'sha256:'||encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') digest
    ) select copy.digest "copyDigest",'sha256:'||encode(sha256(convert_to(
      $2||'|'||$3||'|'||copy.digest||'|'||$4||'|'||$5,'UTF8')),'hex') "reviewedDigest" from copy`,
    [JSON.stringify(copy), prepared.contentDigest, packet.evidenceSnapshotDigest, registry.id, registry.digest]);
    const { copyDigest, reviewedDigest } = hashes.rows[0]!;
    const rebound = { ...packet, copy, copyDigest, reviewedContentDigest: reviewedDigest,
      adoption: { ...packet.adoption, contentDigest: reviewedDigest },
      approval: { ...packet.approval, contentDigest: reviewedDigest } };
    await expect(db.query(`insert into strandcue_private.heat_rule_publications
      (id,content_digest,rule,review_envelope,state,authored_by,reviewed_by,reviewed_at,published_at)
      values($1,$2,$3::jsonb,$4::jsonb,'published','Synthetic Rule Author','Synthetic Rule Reviewer',now(),now())`,
    [id, prepared.contentDigest, JSON.stringify(prepared.rule), JSON.stringify(rebound)]))
      .rejects.toThrow(/heat-publication-review-invalid/);
  });

  it.each([
    ['evidence digest', (packet: Record<string, any>) => ({ ...packet, evidenceSnapshotDigest: `sha256:${'f'.repeat(64)}` })],
    ['null evidence digest', (packet: Record<string, any>) => ({ ...packet, evidenceSnapshotDigest: null })],
    ['copy digest', (packet: Record<string, any>) => ({ ...packet, copyDigest: `sha256:${'f'.repeat(64)}` })],
    ['null copy digest', (packet: Record<string, any>) => ({ ...packet, copyDigest: null })],
    ['null aggregate digest', (packet: Record<string, any>) => ({ ...packet, reviewedContentDigest: null })],
    ['registry digest', (packet: Record<string, any>) => ({ ...packet, capabilityRegistryDigest: `sha256:${'f'.repeat(64)}` })],
    ['same Human A/B', (packet: Record<string, any>) => ({ ...packet, approval: { ...packet.approval, reviewer: packet.adoption.reviewer } })],
    ['unreviewed copy', (packet: Record<string, any>) => ({ ...packet, copy: packet.copy.map((item: any) => ({ ...item, status: 'draft' })) })],
    ['future approval', (packet: Record<string, any>) => ({ ...packet, approval: { ...packet.approval, reviewedAt: '2099-01-01T00:00:00Z' } })],
    ['copy review timestamp missing', (packet: Record<string, any>) => ({ ...packet, copy: packet.copy.map((item: any) => ({ ...item, reviewedAt: null })) })],
    ['Human A timestamp missing', (packet: Record<string, any>) => ({ ...packet, adoption: { ...packet.adoption, reviewedAt: null } })],
    ['Human B timestamp missing', (packet: Record<string, any>) => ({ ...packet, approval: { ...packet.approval, reviewedAt: null } })],
  ] as const)('rejects changed %s before publication', async (_label, change) => {
    const registry = await seedSyntheticHeatCapabilityRegistry(query);
    const id = crypto.randomUUID();
    const prepared = await prepareSyntheticHeatRule(query, rule(id), registry);
    await expect(db.query(`insert into strandcue_private.heat_rule_publications
      (id,content_digest,rule,review_envelope,state,authored_by,reviewed_by,reviewed_at,published_at)
      values($1,$2,$3::jsonb,$4::jsonb,'published','Synthetic Rule Author','Synthetic Rule Reviewer',now(),now())`,
    [id, prepared.contentDigest, JSON.stringify(prepared.rule), JSON.stringify(change(prepared.reviewEnvelope))]))
      .rejects.toThrow(/heat-publication-review-invalid/);
  });
});
