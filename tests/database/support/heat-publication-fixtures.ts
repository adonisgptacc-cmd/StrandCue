/** Synthetic review packets for database tests only. Never import into production code. */
export interface SyntheticRegistryIdentity {
  readonly id: string;
  readonly digest: string;
}

export type SyntheticQuery = (sql: string, values: unknown[]) => Promise<{ rows: readonly Record<string, unknown>[] }>;

export async function prepareSyntheticHeatRule(
  query: SyntheticQuery,
  rule: Record<string, unknown>,
  registry: SyntheticRegistryIdentity,
) {
  const result = await query(`with source as (
      select $1::jsonb - 'digest' rule, $2::uuid registry_id, $3::text registry_digest
    ), base as (
      select source.*, 'sha256:'||encode(sha256(convert_to(rule::text,'UTF8')),'hex') rule_digest,
        p.content->'evidence' evidence, p.content->>'evidenceRegistryId' evidence_registry_id,
        p.content->>'evidenceRegistryVersion' evidence_registry_version
      from source join strandcue_private.heat_capability_publications p
        on p.id=source.registry_id and p.content_digest=source.registry_digest and p.state='published'
    ), snapshots as (
      select base.*, 'sha256:'||encode(sha256(convert_to(evidence::text,'UTF8')),'hex') evidence_digest,
        (select jsonb_agg(jsonb_build_object('copyKey',key,'text','Synthetic reviewed copy for '||key,
          'evidenceIds',jsonb_build_array(evidence->0->>'evidenceId'),'contentDigest',rule_digest,
          'status','reviewed','authoredBy','Synthetic Copy Author','reviewedBy','Synthetic Copy Reviewer',
          'reviewedAt','2026-10-22T00:00:00Z') order by key) from (
          select 'heat.limitations' key union
          select rule->>'copyKey' key union
          select item->>'copyKey' from jsonb_array_elements(rule->'hardRestrictions') item union
          select item->>'copyKey' from jsonb_array_elements(rule->'alternatives') item
        ) keys) copy
      from base
    ), digests as (
      select snapshots.*, 'sha256:'||encode(sha256(convert_to(copy::text,'UTF8')),'hex') copy_digest
      from snapshots
    ), reviewed as (
      select digests.*, 'sha256:'||encode(sha256(convert_to(
        rule_digest||'|'||evidence_digest||'|'||copy_digest||'|'||registry_id::text||'|'||registry_digest,
        'UTF8')),'hex') reviewed_digest from digests
    )
    select rule_digest "contentDigest", rule||jsonb_build_object('digest',substring(rule_digest from 8)) rule,
      jsonb_build_object('schemaVersion',1,'evidenceRegistryId',evidence_registry_id,
        'evidenceRegistryVersion',evidence_registry_version,'evidenceSnapshotDigest',evidence_digest,
        'evidence',evidence,'capabilityRegistryId',registry_id,'capabilityRegistryDigest',registry_digest,
        'copyDigest',copy_digest,'copy',copy,'reviewedContentDigest',reviewed_digest,
        'adoption',jsonb_build_object('decision','adopted','reviewer','Synthetic Human Alpha',
          'reviewedAt','2026-10-23T00:00:00Z','contentDigest',reviewed_digest),
        'approval',jsonb_build_object('decision','approved','reviewer','Synthetic Human Beta',
          'reviewedAt','2026-10-23T01:00:00Z','contentDigest',reviewed_digest)) "reviewEnvelope"
    from reviewed`, [JSON.stringify(rule), registry.id, registry.digest]);
  const row = result.rows[0];
  if (!row) throw new Error('Synthetic registry did not resolve');
  return {
    contentDigest: row.contentDigest as string,
    rule: row.rule as Record<string, unknown>,
    reviewEnvelope: row.reviewEnvelope as Record<string, unknown>,
  };
}

export async function seedSyntheticHeatRule(
  query: SyntheticQuery,
  id: string,
  rule: Record<string, unknown>,
  registry: SyntheticRegistryIdentity,
  state: 'draft' | 'published' | 'withdrawn' = 'published',
) {
  const prepared = await prepareSyntheticHeatRule(query, rule, registry);
  await query(`insert into strandcue_private.heat_rule_publications
      (id,content_digest,rule,review_envelope,state,authored_by,reviewed_by,reviewed_at,published_at)
    values ($1,$2,$3::jsonb,$4::jsonb,$5,'Synthetic Rule Author','Synthetic Rule Reviewer',now(),now())`,
  [id, prepared.contentDigest, JSON.stringify(prepared.rule), JSON.stringify(prepared.reviewEnvelope), state]);
  return prepared;
}
