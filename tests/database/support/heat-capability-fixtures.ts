export const SYNTHETIC_PRODUCT_VERSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const SYNTHETIC_TOOL_VERSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const SYNTHETIC_HEAT_EVIDENCE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

export interface SyntheticHeatCapabilityOptions {
  readonly id?: string;
  readonly productVersionId?: string;
  readonly toolVersionId?: string;
}

export type HeatCapabilityFixtureQuery = (sql: string, params?: unknown[]) => Promise<{ rows: readonly Record<string, unknown>[] }>;

export function syntheticHeatCapabilityContent(options: SyntheticHeatCapabilityOptions = {}) {
  const id = options.id ?? crypto.randomUUID();
  const productVersionId = options.productVersionId ?? SYNTHETIC_PRODUCT_VERSION_ID;
  const toolVersionId = options.toolVersionId ?? SYNTHETIC_TOOL_VERSION_ID;
  return {
    schemaVersion: 1, registryId: id, evidenceRegistryId: 'synthetic-heat-capability-evidence', evidenceRegistryVersion: '1',
    evidence: [{ evidenceId: SYNTHETIC_HEAT_EVIDENCE_ID, sourceUrl: 'https://example.test/synthetic-heat-capability',
      versionIds: [productVersionId, toolVersionId].sort(), claim: 'Synthetic exact-version capability claim',
      limitations: 'Test fixture only, never production evidence', checkedAt: '2026-10-20T00:00:00Z',
      reviewedAt: '2026-10-21T00:00:00Z', status: 'reviewed', market: 'ZA', trustTier: 'T5' }],
    bindings: [
      { kind: 'product', versionId: productVersionId, capability: 'heat-protection', evidenceIds: [SYNTHETIC_HEAT_EVIDENCE_ID],
        decision: 'approved', authoredBy: 'Synthetic Capability Author', reviewedBy: 'Synthetic Capability Reviewer',
        reviewedAt: '2026-10-22T00:00:00Z' },
      { kind: 'tool', versionId: toolVersionId, capability: 'heat-tool', evidenceIds: [SYNTHETIC_HEAT_EVIDENCE_ID],
        decision: 'approved', authoredBy: 'Synthetic Capability Author', reviewedBy: 'Synthetic Capability Reviewer',
        reviewedAt: '2026-10-22T00:00:00Z' },
    ],
  };
}

export async function seedSyntheticHeatCapabilityRegistry(query: HeatCapabilityFixtureQuery, options: SyntheticHeatCapabilityOptions = {}) {
  const content = syntheticHeatCapabilityContent(options);
  const productVersionId = options.productVersionId ?? SYNTHETIC_PRODUCT_VERSION_ID;
  const toolVersionId = options.toolVersionId ?? SYNTHETIC_TOOL_VERSION_ID;
  await query('set session authorization postgres');
  const existing = await query(`select 'product' kind,id::text from public.product_versions where id=$1
    union all select 'tool' kind,id::text from public.tool_versions where id=$2`, [productVersionId, toolVersionId]);
  const kinds = new Set(existing.rows.map(row => row.kind));
  if (!kinds.has('product')) {
    const brandId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    await query('insert into public.brands(id,name) values($1,$2)', [brandId, 'Synthetic capability brand']);
    await query('insert into public.products(id,brand_id,name,category) values($1,$2,$3,$4)',
      [productId, brandId, 'Synthetic capability product', 'heat protectant']);
    await query('insert into public.product_versions(id,product_id) values($1,$2)', [productVersionId, productId]);
  }
  if (!kinds.has('tool')) {
    const brandId = crypto.randomUUID();
    const toolId = crypto.randomUUID();
    await query('insert into public.tool_brands(id,name) values($1,$2)', [brandId, 'Synthetic capability tool brand']);
    await query('insert into public.tools(id,brand_id,name,tool_type) values($1,$2,$3,$4)',
      [toolId, brandId, 'Synthetic capability tool', 'dryer']);
    await query('insert into public.tool_versions(id,tool_id,version_label) values($1,$2,$3)',
      [toolVersionId, toolId, 'Synthetic exact version']);
  }
  const result = await query(`with payload as (select $2::jsonb content), bound as (
      select content,'sha256:'||encode(sha256(convert_to(content::text,'UTF8')),'hex') digest from payload)
    insert into strandcue_private.heat_capability_publications
      (id,content_digest,content,state,adopted_by,adopted_at,adopted_digest,approved_by,approved_at,approved_digest,published_at)
    select $1,digest,content,'published','Synthetic Human A',now(),digest,
      'Synthetic Human B',now(),digest,now() from bound returning content_digest`, [content.registryId, JSON.stringify(content)]);
  return { id: content.registryId, digest: String(result.rows[0]!.content_digest), productVersionId, toolVersionId };
}
