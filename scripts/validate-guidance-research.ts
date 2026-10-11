/**
 * Guidance research pack validator.
 *
 * A research pack (`docs/product/evidence/<pack>/`) proposes catalogue
 * versions to research and the claim-scoped sources read about them. It is
 * evidence input, never approval: nothing here can be executed, and this
 * script decides only whether the pack is internally honest.
 *
 * Every inventory id must resolve to exactly one catalogue version in a trusted
 * local source — a reviewed seed row in `supabase/migrations/*.sql`, or an
 * explicitly exported read-only snapshot — and the recorded identity must
 * agree with it. A version that exists nowhere is a manual entry, and a manual
 * entry is not an identity.
 *
 * The check is entirely offline: it reads files from this repository and never
 * contacts a database, a network or a secret store.
 */

import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import {
  GuidanceEvidenceMarketSchema,
  GuidanceEvidenceRegistrySchema,
} from '../packages/domain/src/guidance/evidence-schemas.ts';
import { frozen, nonEmptyString } from '../packages/domain/src/guidance/schemas.ts';
import { LifecycleSchema, ProvenanceSourceSchema } from '../packages/domain/src/shelf.ts';
import type { Lifecycle } from '../packages/domain/src/shelf.ts';
import type { GuidanceEvidenceMarket } from '../packages/domain/src/guidance/evidence-types.ts';

export const GUIDANCE_RESEARCH_FINDING_CODES = [
  'ARTIFACT_SHAPE',
  'EVIDENCE_DANGLING_VERSION',
  'EVIDENCE_MARKET_MISMATCH',
  'EVIDENCE_NOT_DRAFT',
  'INVENTORY_AMBIGUOUS',
  'INVENTORY_DUPLICATE',
  'INVENTORY_FIELD_MISMATCH',
  'INVENTORY_FIXTURE_ID',
  'INVENTORY_IDENTITY_INCOMPLETE',
  'INVENTORY_NOT_ZA',
  'INVENTORY_UNRESOLVED',
  'RESEARCH_LOG',
] as const;

export type GuidanceResearchFindingCode = (typeof GUIDANCE_RESEARCH_FINDING_CODES)[number];

export interface GuidanceResearchFinding {
  readonly code: GuidanceResearchFindingCode;
  readonly message: string;
}

/**
 * One catalogue version, resolved from a trusted local source. `variantOrModel`
 * is the catalogue's own record: `product_versions.variant` for a product and
 * `tool_versions.version_label` for a tool. It is `null` when the catalogue does
 * not carry one, which is a different fact from it being empty.
 */
export interface GuidanceResearchCatalogueVersion {
  readonly kind: 'product' | 'tool';
  readonly versionId: string;
  readonly brand: string;
  readonly name: string;
  readonly variantOrModel: string | null;
  readonly market: GuidanceEvidenceMarket;
  readonly lifecycle: Lifecycle;
}

export interface GuidanceResearchPack {
  readonly inventory: unknown;
  readonly registry: unknown;
  readonly researchLog: unknown;
}

const InventoryRowSchema = frozen(
  z
    .object({
      kind: z.enum(['product', 'tool']),
      versionId: z.uuid(),
      brand: nonEmptyString,
      name: nonEmptyString,
      /** Exact variant, formulation or model — never "the shampoo" (SH-02). */
      variantOrModel: nonEmptyString,
      market: GuidanceEvidenceMarketSchema,
      lifecycle: LifecycleSchema,
      /** The source that established this identity (EV-02). */
      source: ProvenanceSourceSchema,
    })
    .strict(),
);

export const GuidanceResearchInventorySchema = frozen(
  z
    .object({
      inventoryId: nonEmptyString,
      version: nonEmptyString,
      rows: z.array(InventoryRowSchema),
    })
    .strict(),
);

export type GuidanceResearchInventoryRow = {
  readonly kind: 'product' | 'tool';
  readonly versionId: string;
  readonly brand: string;
  readonly name: string;
  readonly variantOrModel: string;
  readonly market: GuidanceEvidenceMarket;
  readonly lifecycle: Lifecycle;
  readonly source: z.output<typeof ProvenanceSourceSchema>;
};

export type GuidanceResearchInventory = {
  readonly inventoryId: string;
  readonly version: string;
  readonly rows: readonly GuidanceResearchInventoryRow[];
};

/**
 * A hand-written fixture id: an all-zero leading group, or a single hex digit
 * followed by seven zeros (`b0000000-…`, `d0000000-…`). Repository test rows use
 * those shapes; a generated `gen_random_uuid()` never does.
 */
const FIXTURE_UUID_LEADING_GROUP = /^(?:0{8}|[0-9a-f]0{7})$/;

function isFixtureVersionId(versionId: string): boolean {
  return FIXTURE_UUID_LEADING_GROUP.test(versionId.slice(0, 8).toLowerCase());
}

function finding(code: GuidanceResearchFindingCode, message: string): GuidanceResearchFinding {
  return Object.freeze({ code, message });
}

function shapeFindings(artifact: string, issues: readonly z.core.$ZodIssue[]): GuidanceResearchFinding[] {
  return issues.map(issue =>
    finding('ARTIFACT_SHAPE', `${artifact} ${issue.path.join('.')} ${issue.message}`),
  );
}

function inventoryFindings(
  inventory: GuidanceResearchInventory,
  catalogue: readonly GuidanceResearchCatalogueVersion[],
): GuidanceResearchFinding[] {
  const findings: GuidanceResearchFinding[] = [];
  const seen = new Set<string>();

  inventory.rows.forEach((row, index) => {
    const label = `inventory row ${index} (${row.kind} ${row.versionId})`;
    const key = `${row.kind}\u0000${row.versionId}`;
    if (seen.has(key)) {
      findings.push(finding('INVENTORY_DUPLICATE', `${label} is inventoried more than once`));
    }
    seen.add(key);
    if (isFixtureVersionId(row.versionId)) {
      findings.push(finding('INVENTORY_FIXTURE_ID', `${label} is a hand-written fixture id, not a catalogue row`));
    }

    const matches = catalogue.filter(entry => entry.kind === row.kind && entry.versionId === row.versionId);
    if (matches.length === 0) {
      findings.push(finding(
        'INVENTORY_UNRESOLVED',
        `${label} matches no version in a trusted local seed migration or approved catalogue snapshot`,
      ));
      return;
    }
    if (matches.length > 1) {
      findings.push(finding('INVENTORY_AMBIGUOUS', `${label} matches ${matches.length} catalogue versions`));
      return;
    }

    const resolved = matches[0]!;
    if (row.market !== 'ZA' || resolved.market !== 'ZA') {
      findings.push(finding(
        'INVENTORY_NOT_ZA',
        `${label} is recorded as '${row.market}' and the catalogue records '${resolved.market}'; the initial market is ZA`,
      ));
    }
    if (resolved.variantOrModel === null) {
      findings.push(finding(
        'INVENTORY_IDENTITY_INCOMPLETE',
        `${label} records formulation or model '${row.variantOrModel}', which the catalogue does not carry`,
      ));
    }

    const compared: readonly (readonly [string, string, string])[] = [
      ['brand', row.brand, resolved.brand],
      ['name', row.name, resolved.name],
      ['lifecycle', row.lifecycle, resolved.lifecycle],
      ['source market', row.source.market, resolved.market],
      ...(resolved.variantOrModel === null
        ? []
        : ([['variant or model', row.variantOrModel, resolved.variantOrModel]] as const)),
    ];
    for (const [field, recorded, catalogued] of compared) {
      if (recorded !== catalogued) {
        findings.push(finding(
          'INVENTORY_FIELD_MISMATCH',
          `${label} records ${field} '${recorded}' but the catalogue records '${catalogued}'`,
        ));
      }
    }
  });

  return findings;
}

function evidenceFindings(
  registry: z.output<typeof GuidanceEvidenceRegistrySchema>,
  catalogue: readonly GuidanceResearchCatalogueVersion[],
): GuidanceResearchFinding[] {
  const findings: GuidanceResearchFinding[] = [];

  registry.records.forEach((record, index) => {
    const label = `evidence record ${index} ('${record.evidenceId}')`;
    if (record.status === 'reviewed') {
      findings.push(finding(
        'EVIDENCE_NOT_DRAFT',
        `${label} is 'reviewed'; research may create draft evidence only, and review is a human step`,
      ));
    }
    for (const versionId of record.versionIds) {
      const resolved = catalogue.find(entry => entry.versionId === versionId);
      if (resolved === undefined) {
        findings.push(finding(
          'EVIDENCE_DANGLING_VERSION',
          `${label} claims version '${versionId}', which no catalogue version resolves`,
        ));
        continue;
      }
      if (record.market === 'ZA' && resolved.market !== 'ZA') {
        findings.push(finding(
          'EVIDENCE_MARKET_MISMATCH',
          `${label} is recorded as a ZA claim about version '${versionId}', which the catalogue places in '${resolved.market}'`,
        ));
      }
    }
  });

  return findings;
}

function researchLogFindings(researchLog: unknown, inventoriedVersions: number | null): GuidanceResearchFinding[] {
  if (typeof researchLog !== 'string' || researchLog.trim() === '') {
    return [finding('RESEARCH_LOG', 'research-log.md is missing or empty, so nothing records what was researched')];
  }
  if (inventoriedVersions === 0 && !/\bblocking\b/i.test(researchLog)) {
    return [finding(
      'RESEARCH_LOG',
      'The inventory is empty, so research-log.md must record the blocking gap that leaves it empty',
    )];
  }
  return [];
}

/**
 * Validate a research pack against a resolved catalogue. Pure: every finding is
 * reported, and the pack is usable only when there are none.
 */
export function validateGuidanceResearch(
  pack: GuidanceResearchPack,
  catalogue: readonly GuidanceResearchCatalogueVersion[],
): readonly GuidanceResearchFinding[] {
  const findings: GuidanceResearchFinding[] = [];
  const inventory = GuidanceResearchInventorySchema.safeParse(pack.inventory);
  if (!inventory.success) findings.push(...shapeFindings('inventory.json', inventory.error.issues));

  const registry = GuidanceEvidenceRegistrySchema.safeParse(pack.registry);
  if (!registry.success) findings.push(...shapeFindings('evidence-registry.json', registry.error.issues));

  if (inventory.success) findings.push(...inventoryFindings(inventory.data, catalogue));
  if (registry.success) findings.push(...evidenceFindings(registry.data, catalogue));
  findings.push(...researchLogFindings(pack.researchLog, inventory.success ? inventory.data.rows.length : null));

  return Object.freeze(findings);
}

// --- Catalogue resolution from trusted local sources ---

const CATALOGUE_TABLES: ReadonlySet<string> = new Set([
  'brands',
  'products',
  'product_versions',
  'tool_brands',
  'tools',
  'tool_versions',
]);

type SeedRow = { readonly table: string; readonly values: Readonly<Record<string, string | null>> };

function readQuoted(sql: string, start: number): { readonly value: string; readonly end: number } | null {
  let index = start + 1;
  let value = '';
  while (index < sql.length) {
    const char = sql[index]!;
    if (char === "'") {
      if (sql[index + 1] === "'") {
        value += "'";
        index += 2;
        continue;
      }
      return { value, end: index + 1 };
    }
    value += char;
    index += 1;
  }
  return null;
}

/**
 * A bare SQL literal: `null` for NULL, a number as its own text, and `null` for
 * any expression such as `now()` or `gen_random_uuid()`, which establishes
 * nothing a later statement could reference. A quoted string is always a
 * literal, whatever it contains.
 */
function sqlLiteral(token: string, quoted: boolean): string | null {
  if (quoted) return token;
  const trimmed = token.trim();
  if (trimmed === '' || /^null$/i.test(trimmed)) return null;
  return /^[-+]?\d+(\.\d+)?$/.test(trimmed) ? trimmed : null;
}

function readColumnList(sql: string, start: number): { readonly columns: readonly string[]; readonly end: number } | null {
  if (sql[start] !== '(') return null;
  const columns: string[] = [];
  let token = '';
  let depth = 1;
  let index = start + 1;
  for (; index < sql.length; index += 1) {
    const char = sql[index]!;
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
    if (char === ',' && depth === 1) {
      columns.push(token.trim().toLowerCase());
      token = '';
      continue;
    }
    token += char;
  }
  if (depth !== 0) return null;
  columns.push(token.trim().toLowerCase());
  return { columns, end: index + 1 };
}

function readTuple(sql: string, start: number): { readonly values: readonly (string | null)[]; readonly end: number } | null {
  if (sql[start] !== '(') return null;
  const values: (string | null)[] = [];
  let token = '';
  let quoted = false;
  let depth = 1;
  let index = start + 1;
  while (index < sql.length) {
    const char = sql[index]!;
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) return { values: [...values, sqlLiteral(token, quoted)], end: index + 1 };
    } else if (char === ',' && depth === 1) {
      values.push(sqlLiteral(token, quoted));
      token = '';
      quoted = false;
      index += 1;
      continue;
    } else if (char === "'") {
      const quotedToken = readQuoted(sql, index);
      if (quotedToken === null) return null;
      // A quoted string preceded by anything else is part of an expression, and
      // an expression names no stable value.
      token = token.trim() === '' ? quotedToken.value : '';
      quoted = token !== '';
      index = quotedToken.end;
      continue;
    }
    token += char;
    index += 1;
  }
  return null;
}

function readSeedRows(sql: string): SeedRow[] {
  const rows: SeedRow[] = [];
  // The lookahead leaves the opening parenthesis for `readColumnList` to read.
  const statement = /insert\s+into\s+(?:public\.)?([a-z_]+)\s*(?=\()/gi;
  for (let match = statement.exec(sql); match !== null; match = statement.exec(sql)) {
    const table = match[1]!.toLowerCase();
    if (!CATALOGUE_TABLES.has(table)) continue;
    const columns = readColumnList(sql, match.index + match[0].length);
    if (columns === null) continue;
    const keyword = /^\s*values\s/i.exec(sql.slice(columns.end));
    if (keyword === null) continue;
    let index = columns.end + keyword[0].length;
    for (;;) {
      const tuple = readTuple(sql, index);
      if (tuple === null) break;
      const values: Record<string, string | null> = {};
      columns.columns.forEach((column, position) => { values[column] = tuple.values[position] ?? null; });
      rows.push({ table, values });
      index = tuple.end;
      const separator = /^\s*,\s*/.exec(sql.slice(index));
      if (separator === null) break;
      index += separator[0].length;
    }
    statement.lastIndex = index;
  }
  return rows;
}

function readEnum<T extends string>(
  values: Readonly<Record<string, string | null>>,
  column: string,
  allowed: readonly T[],
  fallback: T,
): T | null {
  const value = values[column];
  // An omitted column takes the column default declared in the catalogue DDL.
  if (value === null || value === undefined) return fallback;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Resolve catalogue versions from reviewed seed rows in a migration. Only
 * `supabase/migrations/` is a trusted source: `supabase/drafts/` holds archived,
 * unapplied DDL, and a row that generates its own `id` establishes no identity
 * anyone can reference.
 */
export function catalogueVersionsFromSeedSql(sql: string): readonly GuidanceResearchCatalogueVersion[] {
  const rows = readSeedRows(sql);
  const indexById = (table: string): ReadonlyMap<string, Readonly<Record<string, string | null>>> => {
    const indexed = new Map<string, Readonly<Record<string, string | null>>>();
    for (const row of rows) {
      if (row.table !== table) continue;
      const id = row.values.id;
      if (id === null || id === undefined) continue;
      indexed.set(id, row.values);
    }
    return indexed;
  };

  const brands = indexById('brands');
  const products = indexById('products');
  const toolBrands = indexById('tool_brands');
  const tools = indexById('tools');
  const versions: GuidanceResearchCatalogueVersion[] = [];

  for (const [versionId, version] of indexById('product_versions')) {
    const product = products.get(version.product_id ?? '');
    const brand = product === undefined ? undefined : brands.get(product.brand_id ?? '');
    const market = readEnum(version, 'market', ['ZA', 'unknown'] as const, 'ZA');
    const lifecycle = readEnum(version, 'lifecycle', ['active', 'retired'] as const, 'active');
    if (product?.name === null || product?.name === undefined || brand?.name === null || brand?.name === undefined
      || market === null || lifecycle === null) {
      continue;
    }
    versions.push({
      kind: 'product',
      versionId,
      brand: brand.name,
      name: product.name,
      variantOrModel: version.variant ?? null,
      market,
      lifecycle,
    });
  }

  for (const [versionId, version] of indexById('tool_versions')) {
    const tool = tools.get(version.tool_id ?? '');
    const brand = tool === undefined ? undefined : toolBrands.get(tool.brand_id ?? '');
    const market = readEnum(version, 'market', ['ZA', 'unknown'] as const, 'ZA');
    const lifecycle = readEnum(version, 'lifecycle', ['active', 'retired'] as const, 'active');
    if (tool?.name === null || tool?.name === undefined || brand?.name === null || brand?.name === undefined
      || market === null || lifecycle === null) {
      continue;
    }
    versions.push({
      kind: 'tool',
      versionId,
      brand: brand.name,
      name: tool.name,
      variantOrModel: version.version_label ?? null,
      market,
      lifecycle,
    });
  }

  return Object.freeze(versions);
}

const CatalogueSnapshotVersionSchema = z
  .object({
    versionId: z.uuid(),
    brand: nonEmptyString,
    name: nonEmptyString,
    variantOrModel: z.string().trim().min(1).nullable(),
    market: GuidanceEvidenceMarketSchema,
    lifecycle: LifecycleSchema,
  })
  .strict();

const CatalogueSnapshotSchema = z
  .object({
    snapshotId: nonEmptyString,
    products: z.array(CatalogueSnapshotVersionSchema),
    tools: z.array(CatalogueSnapshotVersionSchema),
  })
  .strict();

/** Resolve catalogue versions from an explicitly exported read-only snapshot. */
export function catalogueVersionsFromSnapshot(snapshot: unknown): readonly GuidanceResearchCatalogueVersion[] {
  const parsed = CatalogueSnapshotSchema.parse(snapshot);
  return Object.freeze([
    ...parsed.products.map(version => Object.freeze({ kind: 'product' as const, ...version })),
    ...parsed.tools.map(version => Object.freeze({ kind: 'tool' as const, ...version })),
  ]);
}

// --- Command line ---

const PACK_DIRECTORY = 'docs/product/evidence/basic-wash-v1';
const MIGRATIONS_DIRECTORY = 'supabase/migrations';
const SNAPSHOT_FILE = 'catalogue-snapshot.json';

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path} is not readable JSON (${error instanceof Error ? error.message : 'unreadable'})`);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveCatalogue(): Promise<readonly GuidanceResearchCatalogueVersion[]> {
  const migrations = (await readdir(MIGRATIONS_DIRECTORY)).filter(name => name.endsWith('.sql')).sort();
  const seeds = await Promise.all(migrations.map(name => readFile(join(MIGRATIONS_DIRECTORY, name), 'utf8')));
  const snapshotPath = join(PACK_DIRECTORY, SNAPSHOT_FILE);
  const sources = [
    ...catalogueVersionsFromSeedSql(seeds.join('\n')),
    ...(await exists(snapshotPath) ? catalogueVersionsFromSnapshot(await readJson(snapshotPath)) : []),
  ];
  // An export and a seed migration describe the same catalogue, so a repeated
  // id is one version. Genuinely conflicting rows within a source stay
  // duplicated and are reported as ambiguous.
  const merged = new Map<string, GuidanceResearchCatalogueVersion>();
  for (const source of sources) merged.set(`${source.kind}\u0000${source.versionId}`, source);
  return [...merged.values()];
}

async function main(): Promise<void> {
  const [inventory, registry, researchLog, catalogue] = await Promise.all([
    readJson(join(PACK_DIRECTORY, 'inventory.json')),
    readJson(join(PACK_DIRECTORY, 'evidence-registry.json')),
    readFile(join(PACK_DIRECTORY, 'research-log.md'), 'utf8'),
    resolveCatalogue(),
  ]);

  const findings = validateGuidanceResearch({ inventory, registry, researchLog }, catalogue);
  for (const item of findings) {
    process.stderr.write(`GUIDANCE-RESEARCH-HOLD ${item.code}: ${item.message}\n`);
  }
  if (findings.length > 0) {
    process.exitCode = 1;
    return;
  }
  const rows = (inventory as { rows?: unknown[] }).rows?.length ?? 0;
  process.stdout.write(
    `GUIDANCE-RESEARCH-PASS rows=${rows} catalogue=${catalogue.length} evidence=${(registry as { records?: unknown[] }).records?.length ?? 0}\n`,
  );
}

if (import.meta.main) {
  main().catch(error => {
    process.stderr.write(`GUIDANCE-RESEARCH-HOLD: ${error instanceof Error ? error.message : 'Check failed.'}\n`);
    process.exitCode = 1;
  });
}