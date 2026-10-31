/**
 * Deterministic catalogue seed compiler.
 *
 * Pure: it reads a validated catalogue intake plus operator-supplied provenance
 * dates and returns a catalogue snapshot and seed SQL. It never connects to a
 * database, reads environment secrets, executes SQL, or emits access changes
 * (no RLS, grants, roles, policies, functions, or triggers) — schema-validated
 * catalogue-data INSERTs for existing tables only.
 *
 * UUID method (tested in `tests/tooling/catalogue-compiler.test.ts`):
 * every catalogue id is a UUID version 5 derived from a canonical identity
 * string plus the fixed repository namespace `CATALOGUE_UUID_NAMESPACE`
 * below. The canonical string length-prefixes each identity part, so no two
 * distinct identities share a canonical string and rerunning on unchanged
 * input yields byte-identical UUIDs. A registry rejects any run in which two
 * different canonical strings map to one UUID (a collision fails closed).
 * Because each id binds exactly one identity, the SQL carries no upsert
 * handling: replaying a conflicting seed aborts the transaction instead of
 * silently merging a semantic disagreement.
 */

import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  CatalogueIntakeSchema,
  type CatalogueIntakeRow,
} from '../packages/domain/src/catalogue-intake.ts';
import { frozen } from '../packages/domain/src/guidance/schemas.ts';
import {
  LifecycleSchema,
  SourceTypeSchema,
  TrustTierSchema,
  VerificationStatusSchema,
} from '../packages/domain/src/shelf.ts';
import { ToolTypeSchema } from '../packages/domain/src/tools.ts';

/** Fixed repository namespace for deterministic catalogue UUIDs. Never change: every catalogue id derives from it. */
export const CATALOGUE_UUID_NAMESPACE = '9f4e3b2a-1c5d-4e7f-8a9b-0c1d2e3f4a5b';

const COMPILER_VERSION = 'catalogue-compiler/1';

/** The only source this compiler emits: a manufacturer listing, tier T5. */
const EMITTED_SOURCE_TYPE = 'manufacturer';
const EMITTED_TRUST_TIER = 'T5';

/** The only claim this compiler emits: the manufacturer-listed identity name. */
const EMITTED_CLAIM_KEY = 'name';

/**
 * UUID version 5 (SHA-1 namespace hash, RFC 4122 §4.3). Implemented with
 * `node:crypto` so the derivation is explicit and dependency-free.
 */
export function deterministicUuid(canonicalIdentity: string): string {
  const namespace = Buffer.from(CATALOGUE_UUID_NAMESPACE.replaceAll('-', ''), 'hex');
  const digest = createHash('sha1')
    .update(namespace)
    .update(canonicalIdentity, 'utf8')
    .digest();
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Fail closed when two different canonical identities claim one UUID. */
export function assertNoUuidCollision(
  entries: readonly { readonly uuid: string; readonly canonical: string }[],
): void {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const previous = seen.get(entry.uuid);
    if (previous !== undefined && previous !== entry.canonical) {
      throw new Error(
        `catalogue-compiler: UUID collision for '${entry.uuid}': '${previous}' and '${entry.canonical}' claim one id`,
      );
    }
    seen.set(entry.uuid, entry.canonical);
  }
}

/**
 * Marketing-only material is never identity evidence (T10 is never evidence).
 * The compiler calls this on the source it emits; the guard is exported so the
 * invariant stays tested even though the emitted values are constants.
 */
export function assertEvidenceSource(sourceType: string, trustTier: string): void {
  if (sourceType === 'marketing') {
    throw new Error(
      'catalogue-compiler: a marketing-only source can never establish catalogue identity',
    );
  }
  if (trustTier === 'T10') {
    throw new Error(
      "catalogue-compiler: trust tier 'T10' is never evidence, so it can never back a catalogue source",
    );
  }
}

/** Collapse case and whitespace so the same identity always hashes itself. */
function normalizeIdentityPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Unambiguous canonical encoding: each part is length-prefixed, null is a
 * negative length no real part can produce, and parts join on `|`. Two
 * different identity tuples can never encode to the same string.
 */
function canonical(parts: readonly (string | null)[]): string {
  return parts
    .map(part => (part === null ? '-1:' : `${part.length}:${part}`))
    .join('|');
}

const VerificationDecisionSchema = frozen(
  z
    .object({
      recordId: z.string().uuid(),
      reviewer: z.string().trim().min(1).max(200),
      reviewedFields: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
      status: VerificationStatusSchema,
      reason: z.string().trim().min(1).max(500),
      sourceIds: z.array(z.string().uuid()).max(50).optional(),
    })
    .strict(),
);
export type VerificationDecision = z.output<typeof VerificationDecisionSchema>;

const CompilerProvenanceSchema = frozen(
  z.object({ firstSeen: z.iso.date(), lastChecked: z.iso.date() }).strict(),
).superRefine((provenance, context) => {
  if (provenance.lastChecked < provenance.firstSeen) {
    context.addIssue({
      code: 'custom',
      path: ['lastChecked'],
      message: 'lastChecked must not predate firstSeen',
    });
  }
});

const CompilerInputSchema = frozen(
  z
    .object({
      intake: CatalogueIntakeSchema,
      provenance: CompilerProvenanceSchema,
      verifications: z.array(VerificationDecisionSchema).max(50).optional(),
    })
    .strict(),
);
export type CatalogueCompilerInput = z.output<typeof CompilerInputSchema>;

const UuidSchema = z.string().uuid();

const SnapshotBrandSchema = z.object({ id: UuidSchema, name: z.string().trim().min(1).max(200) }).strict();
const SnapshotProductSchema = z
  .object({
    id: UuidSchema,
    brand_id: UuidSchema,
    name: z.string().trim().min(1).max(200),
    category: z.enum(['shampoo', 'conditioner']),
    market: z.literal('ZA'),
  })
  .strict();
const SnapshotProductVersionSchema = z
  .object({
    id: UuidSchema,
    product_id: UuidSchema,
    variant: z.string().trim().min(1).max(200).nullable(),
    market: z.literal('ZA'),
    barcode: z.string().trim().min(1).max(100).nullable(),
    lifecycle: LifecycleSchema,
  })
  .strict();
const SnapshotClaimSchema = z
  .object({
    id: UuidSchema,
    version_id: UuidSchema,
    claim_key: z.string().trim().min(1).max(100),
    statement: z.string().trim().max(2000).nullable(),
  })
  .strict();
const SnapshotSourceSchema = z
  .object({
    id: UuidSchema,
    version_id: UuidSchema,
    source_url: z.url(),
    archived_url: z.url().nullable(),
    source_type: SourceTypeSchema,
    trust_tier: TrustTierSchema,
    market: z.literal('ZA'),
    first_seen: z.iso.date(),
    last_checked: z.iso.date(),
  })
  .strict();
const SnapshotVerificationEventSchema = z
  .object({
    id: UuidSchema,
    version_id: UuidSchema,
    reviewer: z.string().trim().min(1).max(200),
    reviewed_fields: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
    status: VerificationStatusSchema,
    reason: z.string().trim().min(1).max(500),
    source_ids: z.array(UuidSchema).max(50),
  })
  .strict();
const SnapshotToolBrandSchema = SnapshotBrandSchema;
const SnapshotToolSchema = z
  .object({
    id: UuidSchema,
    brand_id: UuidSchema,
    name: z.string().trim().min(1).max(200),
    tool_type: ToolTypeSchema,
  })
  .strict();
const SnapshotToolVersionSchema = z
  .object({
    id: UuidSchema,
    tool_id: UuidSchema,
    version_label: z.string().trim().min(1).max(200),
    market: z.literal('ZA'),
    lifecycle: LifecycleSchema,
  })
  .strict();

const CatalogueSnapshotSchema = frozen(
  z
    .object({
      compiler: z.literal(COMPILER_VERSION),
      provenance: z.object({ firstSeen: z.iso.date(), lastChecked: z.iso.date() }).strict(),
      brands: z.array(SnapshotBrandSchema),
      products: z.array(SnapshotProductSchema),
      product_versions: z.array(SnapshotProductVersionSchema),
      product_claims: z.array(SnapshotClaimSchema),
      product_sources: z.array(SnapshotSourceSchema),
      product_verification_events: z.array(SnapshotVerificationEventSchema),
      tool_brands: z.array(SnapshotToolBrandSchema),
      tools: z.array(SnapshotToolSchema),
      tool_versions: z.array(SnapshotToolVersionSchema),
      tool_claims: z.array(SnapshotClaimSchema),
      tool_sources: z.array(SnapshotSourceSchema),
      tool_verification_events: z.array(SnapshotVerificationEventSchema),
    })
    .strict(),
);
export type CatalogueSnapshot = z.output<typeof CatalogueSnapshotSchema>;

export interface CatalogueCompilerResult {
  readonly snapshot: CatalogueSnapshot;
  readonly sql: string;
}

function fail(message: string): never {
  throw new Error(`catalogue-compiler: ${message}`);
}

function requireManufacturerUrl(row: CatalogueIntakeRow): string {
  if (row.manufacturerUrl === null) {
    fail(
      `row '${row.recordId}' records no manufacturer URL, so no URL-backed source row can be minted for it`,
    );
  }
  return row.manufacturerUrl;
}

function sqlText(value: string | null): string {
  if (value === null) return 'null';
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlTextArray(values: readonly string[], type: 'text' | 'uuid'): string {
  return `array[${values.map(value => `'${value.replaceAll("'", "''")}'`).join(',')}]::${type}[]`;
}

function insertStatement(
  table: string,
  columns: readonly string[],
  rows: readonly (readonly (string | null)[])[],
): string | null {
  if (rows.length === 0) return null;
  // The first tuple stays on the `values` line: the repository seed reader
  // (`catalogueVersionsFromSeedSql`) tolerates one space there, not a newline.
  const tuples = rows.map(row => `(${row.map(sqlText).join(', ')})`).join(',\n  ');
  return `insert into public.${table} (${columns.join(', ')}) values ${tuples};`;
}

function insertUuidArrayStatement(
  table: string,
  columns: readonly string[],
  rows: readonly { readonly fields: readonly (string | null)[]; readonly arrays: readonly { readonly index: number; readonly values: readonly string[]; readonly type: 'text' | 'uuid' }[] }[],
): string | null {
  if (rows.length === 0) return null;
  const tuples = rows
    .map(row => {
      const rendered = row.fields.map((field, position) => {
        const array = row.arrays.find(entry => entry.index === position);
        return array === undefined ? sqlText(field) : sqlTextArray(array.values, array.type);
      });
      return `(${rendered.join(', ')})`;
    })
    .join(',\n  ');
  return `insert into public.${table} (${columns.join(', ')}) values ${tuples};`;
}

/** Canonical render: two-space JSON plus a trailing newline, byte-stable. */
export function renderSnapshotJson(snapshot: CatalogueSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

interface CompiledVersion {
  readonly versionId: string;
  readonly sourceIds: readonly string[];
  readonly recordId: string;
}

export function compileCatalogueIntake(input: unknown): CatalogueCompilerResult {
  const parsed = CompilerInputSchema.parse(input);
  assertEvidenceSource(EMITTED_SOURCE_TYPE, EMITTED_TRUST_TIER);

  const rows = [...parsed.intake.rows].sort((left, right) =>
    left.recordId < right.recordId ? -1 : left.recordId > right.recordId ? 1 : 0,
  );
  for (const row of rows) {
    if (row.status !== 'identity_verified') {
      fail(
        `row '${row.recordId}' is '${row.status}', not identity_verified: only reviewer-verified identity compiles`,
      );
    }
    if (row.market !== 'ZA') {
      fail(
        `row '${row.recordId}' is market '${row.market}': the catalogue seed carries the exact ZA market only`,
      );
    }
  }

  const gtinOwners = new Map<string, string>();
  for (const row of rows) {
    if (row.gtin === null) continue;
    const owner = gtinOwners.get(row.gtin);
    if (owner !== undefined) {
      fail(
        `GTIN '${row.gtin}' is claimed by rows '${owner}' and '${row.recordId}': one barcode is one identity`,
      );
    }
    gtinOwners.set(row.gtin, row.recordId);
  }

  const registry: { uuid: string; canonical: string }[] = [];
  const mint = (uuid: string, identity: string): string => {
    registry.push({ uuid, canonical: identity });
    return uuid;
  };

  const brands = new Map<string, { id: string; name: string }>();
  const toolBrands = new Map<string, { id: string; name: string }>();
  const products: CatalogueSnapshot['products'] = [];
  const productVersions: CatalogueSnapshot['product_versions'] = [];
  const productClaims: CatalogueSnapshot['product_claims'] = [];
  const productSources: CatalogueSnapshot['product_sources'] = [];
  const tools: CatalogueSnapshot['tools'] = [];
  const toolVersions: CatalogueSnapshot['tool_versions'] = [];
  const toolClaims: CatalogueSnapshot['tool_claims'] = [];
  const toolSources: CatalogueSnapshot['tool_sources'] = [];
  const versionsByRecord = new Map<string, CompiledVersion>();
  const sourcesById = new Map<string, string>();

  const brandIdFor = (brand: string): string => {
    const key = normalizeIdentityPart(brand);
    const existing = brands.get(key);
    if (existing !== undefined) return existing.id;
    const identity = canonical(['brand', 'v1', key]);
    const id = mint(deterministicUuid(identity), identity);
    brands.set(key, { id, name: brand });
    return id;
  };

  const toolBrandIdFor = (brand: string): string => {
    const key = normalizeIdentityPart(brand);
    const existing = toolBrands.get(key);
    if (existing !== undefined) return existing.id;
    const identity = canonical(['tool-brand', 'v1', key]);
    const id = mint(deterministicUuid(identity), identity);
    toolBrands.set(key, { id, name: brand });
    return id;
  };

  const compileProductRow = (row: Extract<CatalogueIntakeRow, { kind: 'product' }>): void => {
    const manufacturerUrl = requireManufacturerUrl(row);
    const brandId = brandIdFor(row.brand);
    const productIdentity = canonical([
      'product', 'v1', brandId, normalizeIdentityPart(row.productName), row.category, row.market,
    ]);
    const productId = mint(deterministicUuid(productIdentity), productIdentity);
    products.push({
      id: productId, brand_id: brandId, name: row.productName, category: row.category, market: 'ZA',
    });
    const versionIdentity = canonical([
      'product-version', 'v1', productId, row.variant === null ? null : normalizeIdentityPart(row.variant),
      row.market, row.gtin, row.lifecycle,
    ]);
    const versionId = mint(deterministicUuid(versionIdentity), versionIdentity);
    productVersions.push({
      id: versionId, product_id: productId, variant: row.variant, market: 'ZA', barcode: row.gtin, lifecycle: row.lifecycle,
    });
    const claimIdentity = canonical(['product-claim', 'v1', versionId, EMITTED_CLAIM_KEY]);
    const claimId = mint(deterministicUuid(claimIdentity), claimIdentity);
    productClaims.push({
      id: claimId, version_id: versionId, claim_key: EMITTED_CLAIM_KEY, statement: `${row.brand} ${row.productName}`,
    });
    const sourceIdentity = canonical(['product-source', 'v1', versionId, manufacturerUrl]);
    const sourceId = mint(deterministicUuid(sourceIdentity), sourceIdentity);
    productSources.push({
      id: sourceId,
      version_id: versionId,
      source_url: manufacturerUrl,
      archived_url: null,
      source_type: EMITTED_SOURCE_TYPE,
      trust_tier: EMITTED_TRUST_TIER,
      market: 'ZA',
      first_seen: parsed.provenance.firstSeen,
      last_checked: parsed.provenance.lastChecked,
    });
    versionsByRecord.set(row.recordId, { versionId, sourceIds: [sourceId], recordId: row.recordId });
    sourcesById.set(sourceId, versionId);
  };

  const compileToolRow = (row: Extract<CatalogueIntakeRow, { kind: 'tool' }>): void => {
    const manufacturerUrl = requireManufacturerUrl(row);
    const brandId = toolBrandIdFor(row.brand);
    const toolIdentity = canonical([
      'tool', 'v1', brandId, normalizeIdentityPart(row.modelName), row.toolType,
    ]);
    const toolId = mint(deterministicUuid(toolIdentity), toolIdentity);
    tools.push({ id: toolId, brand_id: brandId, name: row.modelName, tool_type: row.toolType });
    const versionIdentity = canonical([
      'tool-version', 'v1', toolId, normalizeIdentityPart(row.versionLabel), row.market, row.gtin, row.lifecycle,
    ]);
    const versionId = mint(deterministicUuid(versionIdentity), versionIdentity);
    toolVersions.push({
      id: versionId, tool_id: toolId, version_label: row.versionLabel, market: 'ZA', lifecycle: row.lifecycle,
    });
    const claimIdentity = canonical(['tool-claim', 'v1', versionId, EMITTED_CLAIM_KEY]);
    const claimId = mint(deterministicUuid(claimIdentity), claimIdentity);
    toolClaims.push({
      id: claimId, version_id: versionId, claim_key: EMITTED_CLAIM_KEY, statement: `${row.brand} ${row.modelName}`,
    });
    const sourceIdentity = canonical(['tool-source', 'v1', versionId, manufacturerUrl]);
    const sourceId = mint(deterministicUuid(sourceIdentity), sourceIdentity);
    toolSources.push({
      id: sourceId,
      version_id: versionId,
      source_url: manufacturerUrl,
      archived_url: null,
      source_type: EMITTED_SOURCE_TYPE,
      trust_tier: EMITTED_TRUST_TIER,
      market: 'ZA',
      first_seen: parsed.provenance.firstSeen,
      last_checked: parsed.provenance.lastChecked,
    });
    versionsByRecord.set(row.recordId, { versionId, sourceIds: [sourceId], recordId: row.recordId });
    sourcesById.set(sourceId, versionId);
  };

  for (const row of rows) {
    if (row.kind === 'product') compileProductRow(row);
    else compileToolRow(row);
  }
  assertNoUuidCollision(registry);

  const byId = <T extends { id: string }>(values: T[]): T[] =>
    [...values].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  const productVerificationEvents: CatalogueSnapshot['product_verification_events'] = [];
  const toolVerificationEvents: CatalogueSnapshot['tool_verification_events'] = [];

  for (const decision of parsed.verifications ?? []) {
    const compiled = versionsByRecord.get(decision.recordId);
    if (compiled === undefined) {
      fail(`verification decision names record '${decision.recordId}', which no intake row carries`);
    }
    const ownSources = new Set(compiled.sourceIds);
    const cited = decision.sourceIds ?? [...compiled.sourceIds];
    for (const sourceId of cited) {
      if (!sourcesById.has(sourceId)) {
        fail(`verification decision for record '${decision.recordId}' cites unknown source '${sourceId}'`);
      }
      if (!ownSources.has(sourceId)) {
        fail(
          `verification decision for record '${decision.recordId}' cites source '${sourceId}', which is tied to the wrong version`,
        );
      }
    }
    const isProduct = productVersions.some(version => version.id === compiled.versionId);
    const eventIdentity = canonical([
      isProduct ? 'product-verification' : 'tool-verification',
      'v1', compiled.versionId, normalizeIdentityPart(decision.reviewer),
      decision.reviewedFields.join(','), decision.status, decision.reason,
    ]);
    const eventId = mint(deterministicUuid(eventIdentity), eventIdentity);
    const event = {
      id: eventId,
      version_id: compiled.versionId,
      reviewer: decision.reviewer,
      reviewed_fields: [...decision.reviewedFields],
      status: decision.status,
      reason: decision.reason,
      source_ids: [...cited].sort(),
    };
    if (isProduct) productVerificationEvents.push(event);
    else toolVerificationEvents.push(event);
  }
  assertNoUuidCollision(registry);

  const snapshot = CatalogueSnapshotSchema.parse({
    compiler: COMPILER_VERSION,
    provenance: { firstSeen: parsed.provenance.firstSeen, lastChecked: parsed.provenance.lastChecked },
    brands: byId([...brands.values()]),
    products: byId(products),
    product_versions: byId(productVersions),
    product_claims: byId(productClaims),
    product_sources: byId(productSources),
    product_verification_events: byId(productVerificationEvents),
    tool_brands: byId([...toolBrands.values()]),
    tools: byId(tools),
    tool_versions: byId(toolVersions),
    tool_claims: byId(toolClaims),
    tool_sources: byId(toolSources),
    tool_verification_events: byId(toolVerificationEvents),
  });

  const statements: string[] = [];
  const push = (statement: string | null): void => {
    if (statement !== null) statements.push(statement);
  };
  push(insertStatement('brands', ['id', 'name'], snapshot.brands.map(brand => [brand.id, brand.name])));
  push(insertStatement(
    'products',
    ['id', 'brand_id', 'name', 'category', 'market'],
    snapshot.products.map(product => [product.id, product.brand_id, product.name, product.category, product.market]),
  ));
  push(insertStatement(
    'product_versions',
    ['id', 'product_id', 'variant', 'market', 'barcode', 'lifecycle'],
    snapshot.product_versions.map(version => [
      version.id, version.product_id, version.variant, version.market, version.barcode, version.lifecycle,
    ]),
  ));
  push(insertStatement(
    'product_claims',
    ['id', 'version_id', 'claim_key', 'statement'],
    snapshot.product_claims.map(claim => [claim.id, claim.version_id, claim.claim_key, claim.statement]),
  ));
  push(insertStatement(
    'product_sources',
    ['id', 'version_id', 'source_url', 'archived_url', 'source_type', 'trust_tier', 'market', 'first_seen', 'last_checked'],
    snapshot.product_sources.map(source => [
      source.id, source.version_id, source.source_url, source.archived_url, source.source_type,
      source.trust_tier, source.market, source.first_seen, source.last_checked,
    ]),
  ));
  push(insertUuidArrayStatement(
    'product_verification_events',
    ['id', 'version_id', 'reviewer', 'reviewed_fields', 'status', 'reason', 'source_ids'],
    snapshot.product_verification_events.map(event => ({
      fields: [event.id, event.version_id, event.reviewer, null, event.status, event.reason, null],
      arrays: [
        { index: 3, values: event.reviewed_fields, type: 'text' as const },
        { index: 6, values: event.source_ids, type: 'uuid' as const },
      ],
    })),
  ));
  push(insertStatement('tool_brands', ['id', 'name'], snapshot.tool_brands.map(brand => [brand.id, brand.name])));
  push(insertStatement(
    'tools',
    ['id', 'brand_id', 'name', 'tool_type'],
    snapshot.tools.map(tool => [tool.id, tool.brand_id, tool.name, tool.tool_type]),
  ));
  push(insertStatement(
    'tool_versions',
    ['id', 'tool_id', 'version_label', 'market', 'lifecycle'],
    snapshot.tool_versions.map(version => [version.id, version.tool_id, version.version_label, version.market, version.lifecycle]),
  ));
  push(insertStatement(
    'tool_claims',
    ['id', 'version_id', 'claim_key', 'statement'],
    snapshot.tool_claims.map(claim => [claim.id, claim.version_id, claim.claim_key, claim.statement]),
  ));
  push(insertStatement(
    'tool_sources',
    ['id', 'version_id', 'source_url', 'archived_url', 'source_type', 'trust_tier', 'market', 'first_seen', 'last_checked'],
    snapshot.tool_sources.map(source => [
      source.id, source.version_id, source.source_url, source.archived_url, source.source_type,
      source.trust_tier, source.market, source.first_seen, source.last_checked,
    ]),
  ));
  push(insertUuidArrayStatement(
    'tool_verification_events',
    ['id', 'version_id', 'reviewer', 'reviewed_fields', 'status', 'reason', 'source_ids'],
    snapshot.tool_verification_events.map(event => ({
      fields: [event.id, event.version_id, event.reviewer, null, event.status, event.reason, null],
      arrays: [
        { index: 3, values: event.reviewed_fields, type: 'text' as const },
        { index: 6, values: event.source_ids, type: 'uuid' as const },
      ],
    })),
  ));

  const sql = [
    '-- Catalogue seed compiled by `npm run compile:catalogue` from reviewed intake. Do not edit.',
    '-- Deterministic output: rerunning on unchanged input yields byte-identical SQL.',
    '-- Plain inserts only: any id conflict aborts the transaction instead of silently merging a disagreement.',
    'begin;',
    ...statements,
    'commit;',
  ].join('\n').concat('\n');

  return { snapshot, sql };
}
