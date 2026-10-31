/**
 * Discovery-only research backlog.
 *
 * This module holds UNTRUSTED third-party research leads, never catalogue
 * evidence. A discovery row records what a research batch *listed* (brand,
 * name, variant, size, a source URL, a check date) plus batch provenance and
 * a deterministic fingerprint. It carries no StrandCue catalogue UUID, no
 * executable capability, no approved evidence, no reviewer identity, no
 * publication status, and no price — the schema is strict and rejects all of
 * those fields outright.
 *
 * Identity states (the only states a row may hold):
 * - `discovered`: a non-basic-wash lead with product-level or distributor
 *   evidence, kept for a future (non-v1) bucket. Never a capability.
 * - `identity_unverified`: brand-homepage-only, retailer-search-feed-only, or
 *   inaccessible evidence. Retailer "confirmed" assertions on such weak
 *   sources are downgraded to this state, never trusted.
 * - `exact_za_identity_verified`: reserved for an exact official ZA
 *   manufacturer product page. Foreign-market pages never qualify.
 * - `evidence_incomplete`: basic-wash-scope (shampoo/conditioner) lead with
 *   product-level evidence whose ZA manufacturer evidence is still missing.
 * - `excluded_scope`: medicinal/medical-device/therapeutic quarantine,
 *   colour chemistry, heated tools, industrial equipment, or category
 *   mismatches. Always carries an exclusionReason.
 * - `duplicate_candidate`: a later normalized repeat of an earlier row.
 * - `possible_reformulation`: the source text flags a reformulation, name
 *   change, or new/old formula signal — or a normalized repeat carries
 *   conflicting exact version/formulation markers.
 */

import { z } from 'zod';

/** Research session date (Africa/Johannesburg). Later dates are rejected. */
export const DISCOVERY_CUTOFF_DATE = '2026-10-12';

export const DiscoveryCategorySchema = z.enum([
  'shampoo',
  'conditioner',
  'scalp',
  'masks',
  'styling',
  'leavein',
  'heatprotect',
  'serumoil',
  'heatedtools',
  'industrial',
]);
export type DiscoveryCategory = z.output<typeof DiscoveryCategorySchema>;

export const DiscoverySourceBatchSchema = z.enum([
  'shampoo-batch-01',
  'conditioner-batch-01',
  'scalp-batch-01',
  'masks-batch-01',
  'styling-batch-01',
  'leavein-batch-01',
  'heatprotect-batch-01',
  'serumoil-batch-01',
  'heatedtools-batch-01',
  'industrial-batch-01',
]);
export type DiscoverySourceBatch = z.output<typeof DiscoverySourceBatchSchema>;

/** Source-evidence tiers. Wikipedia never counts as manufacturer evidence. */
export const DiscoverySourceTypeSchema = z.enum([
  'official_za_product_page',
  'another_market_manufacturer_page',
  'brand_homepage',
  'authorised_distributor',
  'retailer_product_page',
  'retailer_search_feed',
  'inaccessible_unverified',
]);
export type DiscoverySourceType = z.output<typeof DiscoverySourceTypeSchema>;

export const DiscoveryIdentityStatusSchema = z.enum([
  'discovered',
  'identity_unverified',
  'exact_za_identity_verified',
  'evidence_incomplete',
  'excluded_scope',
  'duplicate_candidate',
  'possible_reformulation',
]);
export type DiscoveryIdentityStatus = z.output<typeof DiscoveryIdentityStatusSchema>;

const DAY_PATTERN = /^([1-9]\d{3})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Real calendar check (no wall-clock): round-trips the date parts through UTC
 * so shape-valid but impossible dates (`2026-02-31`) and invalid leap days
 * (`2023-02-29`) fail while a real leap day (`2024-02-29`) passes.
 */
function isCalendarDay(value: string): boolean {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Pure discovery-date validator with injected-`today` semantics (never the
 * wall clock). Rejects malformed values, timestamps where a calendar date is
 * required, impossible dates, and dates after `today`; returns the validated
 * date string unchanged.
 */
export function validateDiscoveryDate(value: string, today: string): string {
  if (!DAY_PATTERN.test(value) || !isCalendarDay(value)) {
    throw new Error(`Invalid discovery date (expected a real YYYY-MM-DD calendar day): ${value}`);
  }
  if (!DAY_PATTERN.test(today) || !isCalendarDay(today)) {
    throw new Error(`Invalid reference date (expected a real YYYY-MM-DD calendar day): ${today}`);
  }
  if (value > today) {
    throw new Error(`Discovery date ${value} is after ${today}`);
  }
  return value;
}

const sourceCheckedAtSchema = z
  .string()
  .refine(
    value => DAY_PATTERN.test(value) && isCalendarDay(value),
    'Expected a valid ISO calendar day',
  )
  .refine(
    value => value <= DISCOVERY_CUTOFF_DATE,
    `Source check dates after ${DISCOVERY_CUTOFF_DATE} are not supported`,
  );

const discoveryUrlSchema = z.url().nullable();

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return value;
}

function frozenRow<S extends z.ZodType>(schema: S): S {
  return schema.transform(value => deepFreeze(value)) as unknown as S;
}

/**
 * Strict, frozen discovery row. Exactly these fields — anything else
 * (catalogue UUID, capability, approval, reviewer, publication, price) is
 * rejected by `.strict()`.
 */
export const DiscoveryRowSchema = frozenRow(
  z
    .strictObject({
      temporaryResearchId: z.string().regex(/^ZA-[A-Z]+-[0-9]{4}$/),
      category: DiscoveryCategorySchema,
      brand: z.string().trim().min(1).max(200),
      listedName: z.string().trim().min(1).max(300),
      listedVariant: z.string().trim().min(1).max(200).nullable(),
      listedSize: z.string().trim().min(1).max(200).nullable(),
      marketClaim: z.string().trim().min(1).max(50).nullable(),
      discoverySourceUrl: discoveryUrlSchema,
      discoverySourceType: DiscoverySourceTypeSchema,
      sourceCheckedAt: sourceCheckedAtSchema,
      identityStatus: DiscoveryIdentityStatusSchema,
      exclusionReason: z.string().trim().min(1).max(500).nullable(),
      unresolvedQuestions: z.array(z.string().trim().min(1).max(500)).max(50),
      sourceBatch: DiscoverySourceBatchSchema,
      fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .superRefine((row, context) => {
      if (row.identityStatus === 'excluded_scope' && row.exclusionReason === null) {
        context.addIssue({
          code: 'custom',
          path: ['exclusionReason'],
          message: 'An excluded_scope row records its quarantine or scope reason',
        });
      }
    }),
);
export type DiscoveryRow = z.output<typeof DiscoveryRowSchema>;

const RETAILER_HOSTS = [
  'dischem.co.za',
  'clicks.co.za',
  'takealot.com',
  'woolworths.co.za',
  'makro.co.za',
  'picknpay.co.za',
  'checkers.co.za',
];

const DISTRIBUTOR_HOSTS = [
  'limelighthb.co.za',
  'hairworx.co.za',
  'salonwarehouse.co.za',
  'mankind.co.za',
];

const PRODUCT_PATH_MARKERS = ['/product/', '/product?', '/products/', '/p/', '/dp/', '/item/'];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname.toLowerCase()}${parsed.search.toLowerCase()}`;
  } catch {
    return '';
  }
}

/**
 * Tier a discovery source URL into the strict evidence hierarchy. An exact
 * official ZA manufacturer *product* page is the only tier that can verify
 * ZA identity; brand homepages, retailer search feeds, and inaccessible
 * sources all downgrade to unverified tiers.
 */
export function classifySourceType(url: string | null): DiscoverySourceType {
  if (url === null || url.trim() === '') return 'inaccessible_unverified';
  const host = hostOf(url);
  if (host === null) return 'inaccessible_unverified';
  if (host === 'en.wikipedia.org' || host.endsWith('.wikipedia.org')) {
    return 'inaccessible_unverified';
  }
  const path = pathOf(url);
  if (RETAILER_HOSTS.some(retailer => host === retailer || host.endsWith(`.${retailer}`))) {
    const isSearchFeed =
      path.includes('catalogsearch') || path.includes('/search') || /[?&]q=/.test(path);
    return isSearchFeed ? 'retailer_search_feed' : 'retailer_product_page';
  }
  if (DISTRIBUTOR_HOSTS.some(distributor => host === distributor || host.endsWith(`.${distributor}`))) {
    return 'authorised_distributor';
  }
  const hasProductMarker = PRODUCT_PATH_MARKERS.some(marker => path.includes(marker));
  const isZaHost = host.endsWith('.co.za') || host.endsWith('.africa') || host.endsWith('.za');
  const hasZaPath = path.startsWith('/za/') || path.includes('/en-za');
  if ((isZaHost || hasZaPath) && hasProductMarker) return 'official_za_product_page';
  if (hasProductMarker) return 'another_market_manufacturer_page';
  return 'brand_homepage';
}

const MEDICINAL_NAME_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /selsun|nizoral|ketoconazole|selenium sulfide/i,
    reason:
      'Quarantine: selenium-sulfide/ketoconazole anti-fungal positioning is medicinal (SAHPRA-adjacent); excluded from cosmetic discovery until human review confirms classification.',
  },
  {
    pattern: /anti[ -]?fungal|antifungal/i,
    reason:
      'Quarantine: explicit anti-fungal claim is therapeutic positioning; excluded from cosmetic discovery until human review confirms classification.',
  },
  {
    pattern: /psoriasis|minoxidil|hair (loss|regrowth) (treatment|tonic|serum|medicine)/i,
    reason:
      'Quarantine: therapeutic hair-loss/psoriasis positioning; excluded from cosmetic discovery until human review confirms classification.',
  },
  {
    pattern: /medic(ated|al|inal)|therapeutic|schedule ?0|sahpra/i,
    reason:
      'Quarantine: medicated/medical/medicinal/therapeutic/SAHPRA language; excluded from cosmetic discovery until human review confirms classification.',
  },
  {
    pattern: /disinfect|sterilis|medical device/i,
    reason:
      'Quarantine: disinfectant/medical-device positioning is not a hair cosmetic; excluded from discovery scope.',
  },
];

const COLOUR_CHEMISTRY_PATTERN =
  /hair ?dye|box dye|permanent colou?r|\bbleach\b|lightener|\bhenna\b|colour developer|hair colou?r cream/i;

const REFORMULATION_SIGNAL_PATTERN =
  /reformulat|name change|packaging change|new formula|old formula|relaunch|previously formulated/i;

/**
 * Exact version/formulation markers used only to separate a conflicting repeat
 * from a plain duplicate: `new/old formula`, `reformulation` wording,
 * `relaunch`/`name change` signals, and explicit version tokens (`v1`,
 * `version 2`). Cosmetic parentheticals (`long title variant`, SKU notes) and
 * bare words like `variant` never match, so near-duplicate packs stay
 * `duplicate_candidate`.
 */
const FORMULATION_MARKER_PATTERN =
  /new formula|old formula|reformulat\w*|relaunch|name change|packaging change|previously formulated|versions?\s*\d+|\bv\s*\.?\s*\d+/gi;

function formulationMarkersOf(row: {
  readonly listedName: string;
  readonly listedVariant: string | null;
  readonly listedSize: string | null;
}): Set<string> {
  const text = [row.listedName, row.listedVariant ?? '', row.listedSize ?? ''].join('\n');
  const markers = new Set<string>();
  for (const hit of text.match(FORMULATION_MARKER_PATTERN) ?? []) {
    markers.add(hit.toLowerCase());
  }
  return markers;
}

function formulationMarkersConflict(first: Set<string>, current: Set<string>): boolean {
  if (first.size === 0 || current.size === 0) return false;
  if (first.size !== current.size) return true;
  for (const marker of first) {
    if (!current.has(marker)) return true;
  }
  return false;
}

export interface IdentityAssignmentInput {
  readonly category: DiscoveryCategory;
  readonly sourceType: DiscoverySourceType;
  readonly listedName: string;
  readonly notesText: string;
}

export interface IdentityAssignment {
  readonly identityStatus: DiscoveryIdentityStatus;
  readonly exclusionReason: string | null;
}

/**
 * Assign the discovery state for one row. Quarantine and out-of-scope
 * categories win over everything; duplicates are resolved by the builder's
 * global pass, not here.
 */
export function assignIdentityStatus(input: IdentityAssignmentInput): IdentityAssignment {
  for (const { pattern, reason } of MEDICINAL_NAME_PATTERNS) {
    if (pattern.test(input.listedName)) return { identityStatus: 'excluded_scope', exclusionReason: reason };
  }
  if (COLOUR_CHEMISTRY_PATTERN.test(input.listedName)) {
    return {
      identityStatus: 'excluded_scope',
      exclusionReason:
        'Out of scope: colour-chemistry product (dye/bleach/toner chemistry); a future colour-care bucket, never basic wash.',
    };
  }
  if (input.category === 'heatedtools') {
    return {
      identityStatus: 'excluded_scope',
      exclusionReason:
        'Out of scope: corded electrical heated tool, not a cosmetic; a future thermal-styling bucket, never basic wash.',
    };
  }
  if (input.category === 'industrial') {
    return {
      identityStatus: 'excluded_scope',
      exclusionReason:
        'Out of scope: industrial/salon equipment, not a cosmetic; infrastructure reference only, never basic wash.',
    };
  }
  if (REFORMULATION_SIGNAL_PATTERN.test(input.notesText)) {
    return { identityStatus: 'possible_reformulation', exclusionReason: null };
  }
  if (input.sourceType === 'official_za_product_page') {
    return { identityStatus: 'exact_za_identity_verified', exclusionReason: null };
  }
  if (
    input.sourceType === 'brand_homepage' ||
    input.sourceType === 'retailer_search_feed' ||
    input.sourceType === 'inaccessible_unverified'
  ) {
    return { identityStatus: 'identity_unverified', exclusionReason: null };
  }
  if (input.category === 'shampoo' || input.category === 'conditioner') {
    return { identityStatus: 'evidence_incomplete', exclusionReason: null };
  }
  return { identityStatus: 'discovered', exclusionReason: null };
}

/** Collapse case, accents, parentheticals, and marketing tails for dedup keys. */
export function normalizeDiscoveryText(value: string): string {
  const ascii = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const noParens = ascii.replace(/\([^)]*\)/g, ' ');
  const noTail = noParens.replace(/\s+for\s+[a-z][a-z ,&/-]*$/i, ' ');
  return noTail.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface FingerprintInput {
  readonly sourceBatch: DiscoverySourceBatch;
  readonly temporaryResearchId: string;
  readonly brand: string;
  readonly listedName: string;
  readonly listedVariant: string | null;
  readonly listedSize: string | null;
  readonly discoverySourceUrl: string | null;
}

/**
 * Fingerprint method: SHA-256 hex over newline-joined
 * `sourceBatch / temporaryResearchId / normalized brand / normalized name /
 * normalized variant / normalized size / raw URL`. Normalized text keeps
 * cosmetic punctuation differences from forking identities; the temp id and
 * batch keep cross-batch repeats distinct. The digest below is a dependency-
 * free SHA-256 (the mobile workspace has no Node type surface, so
 * `node:crypto` is unavailable here); it is cross-checked against the
 * platform implementation in tests via format/stability properties.
 */
export function fingerprintDiscoveryRow(input: FingerprintInput): string {
  const material = [
    input.sourceBatch,
    input.temporaryResearchId.trim(),
    normalizeDiscoveryText(input.brand),
    normalizeDiscoveryText(input.listedName),
    normalizeDiscoveryText(input.listedVariant ?? ''),
    normalizeDiscoveryText(input.listedSize ?? ''),
    (input.discoverySourceUrl ?? '').trim(),
  ].join('\n');
  return sha256Hex(material);
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
];

function sha256Hex(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Array<number>(64);

  const rightRotate = (value: number, bits: number): number =>
    (value >>> bits) | (value << (32 - bits));

  for (let block = 0; block < paddedLength; block += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(block + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rightRotate(w[i - 15]!, 7) ^ rightRotate(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rightRotate(w[i - 2]!, 17) ^ rightRotate(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + SHA256_K[i]! + w[i]!) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(word => (word >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

export interface ParsedDiscoveryRow {
  readonly temporaryResearchId: string;
  readonly category: DiscoveryCategory;
  readonly brand: string;
  readonly listedName: string;
  readonly listedVariant: string | null;
  readonly listedSize: string | null;
  readonly marketClaim: string | null;
  readonly discoverySourceUrl: string | null;
  readonly sourceCheckedAt: string;
  readonly notesText: string;
  readonly unresolvedQuestions: readonly string[];
  readonly sourceBatch: DiscoverySourceBatch;
}

export interface DiscoveryBatchInput {
  readonly sourceBatch: DiscoverySourceBatch;
  readonly markdown: string;
}

const BATCH_CATEGORY: Record<DiscoverySourceBatch, DiscoveryCategory> = {
  'shampoo-batch-01': 'shampoo',
  'conditioner-batch-01': 'conditioner',
  'scalp-batch-01': 'scalp',
  'masks-batch-01': 'masks',
  'styling-batch-01': 'styling',
  'leavein-batch-01': 'leavein',
  'heatprotect-batch-01': 'heatprotect',
  'serumoil-batch-01': 'serumoil',
  'heatedtools-batch-01': 'heatedtools',
  'industrial-batch-01': 'industrial',
};

/** Canonical processing order; the builder sorts inputs into this order. */
export const DISCOVERY_BATCH_ORDER: readonly DiscoverySourceBatch[] = [
  'shampoo-batch-01',
  'conditioner-batch-01',
  'scalp-batch-01',
  'masks-batch-01',
  'styling-batch-01',
  'leavein-batch-01',
  'heatprotect-batch-01',
  'serumoil-batch-01',
  'heatedtools-batch-01',
  'industrial-batch-01',
];

const OUTPUT_HEADING_PATTERN = /^#{1,3}\s+OUTPUT\s+(\d+)\b.*$/;
const TEMP_ID_PATTERN = /^ZA-[A-Z]+-[0-9]{4}$/;
const MISSING_SIZE_PATTERN = /^(null|n\/a|unverified|varies by|size not stated|not stated|not exposed|not extractable)/i;
const MISSING_TEXT_PATTERN = /^(null|n\/a|unverified)$/i;

function marketClaimOf(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const head = trimmed.split(' (')[0]!.split(';')[0]!.trim();
  return (head === '' ? trimmed : head).slice(0, 50);
}

function nullIfMissingText(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || MISSING_TEXT_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function nullIfMissingSize(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || MISSING_SIZE_PATTERN.test(trimmed)) return null;
  return trimmed;
}

const PRICE_TOKEN_PATTERN = /\b(?:ZAR|R)\s?\d[\d\s.,]*\d\b/gi;

/**
 * Retailer price observations are discovery noise, never ranking input: the
 * schema has no price field, and price figures are withheld from free-text
 * questions as well so no figure can flow into an executable structure.
 */
function withholdPrices(value: string): string {
  return value.replace(PRICE_TOKEN_PATTERN, '[price withheld]');
}

function extractUrls(cell: string): string[] {
  const found: string[] = [];
  for (const match of cell.matchAll(/https?:\/\/[^\s)|"'\]]+/g)) {
    found.push(match[0].replace(/[.,;:)]+$/g, ''));
  }
  return found;
}

function splitCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
}

/**
 * Parse one batch file's OUTPUT 2 product table into discovery rows. Only
 * pipe-table rows inside the OUTPUT 2 section whose first cell is a
 * `ZA-…-NNNN` temp id become rows; tables in other outputs and continuation
 * mentions are ignored. Two shapes are supported: the 18-column
 * manufacturer-style table and the 10-column retailer-style table. Price
 * columns are never read.
 */
export function parseDiscoveryTable(
  sourceBatch: DiscoverySourceBatch,
  markdown: string,
): ParsedDiscoveryRow[] {
  const lines = markdown.split(/\r?\n/);
  let inOutputTwo = false;
  let header: string[] | null = null;
  const rows: ParsedDiscoveryRow[] = [];

  for (const line of lines) {
    const heading = OUTPUT_HEADING_PATTERN.exec(line.trim());
    if (heading !== null) {
      inOutputTwo = heading[1] === '2';
      if (heading[1] !== '2') header = null;
      continue;
    }
    if (!inOutputTwo || !line.trim().startsWith('|')) continue;
    const cells = splitCells(line);
    if (header === null) {
      if (cells.includes('temporaryResearchId') || cells[0] === 'ID') header = cells;
      continue;
    }
    if (!TEMP_ID_PATTERN.test(cells[0] ?? '')) continue;
    const parsed = parseRowCells(sourceBatch, header, cells);
    if (parsed !== null) rows.push(parsed);
  }
  return rows;
}

function parseRowCells(
  sourceBatch: DiscoverySourceBatch,
  header: string[],
  cells: string[],
): ParsedDiscoveryRow | null {
  const category = BATCH_CATEGORY[sourceBatch];
  const cell = (name: string): string => cells[header.indexOf(name)]?.trim() ?? '';

  if (header.includes('temporaryResearchId')) {
    const manufacturerUrl = cell('manufacturerUrl');
    const zaIdentity = cell('zaIdentityStatus');
    const conflict = cell('formulationConflict');
    const unresolved = cell('unresolvedQuestions');
    const lastChecked = cell('lastChecked');
    return {
      temporaryResearchId: cells[0]!.trim(),
      category,
      brand: cell('brand'),
      listedName: cell('exactProductName'),
      listedVariant: nullIfMissingText(cell('variant')),
      listedSize: nullIfMissingSize(cell('sizeOrPack')),
      marketClaim: marketClaimOf(cell('market')),
      discoverySourceUrl: pickBestUrl([manufacturerUrl, zaIdentity]),
      sourceCheckedAt: extractDate(lastChecked),
      notesText: [conflict, unresolved].filter(part => part !== '').join(' — '),
      unresolvedQuestions: splitQuestions(unresolved),
      sourceBatch,
    };
  }

  const retailerUrl = cell('Retailer URL');
  const claim = cell('Claim (verbatim)') !== '' ? cell('Claim (verbatim)') : cell('Styling/hold claim (verbatim)');
  const heatClaim = cell('Heat-protection claim (verbatim)');
  const claimText = claim !== '' ? claim : heatClaim;
  return {
    temporaryResearchId: cells[0]!.trim(),
    category,
    brand: cell('Brand'),
    listedName: cell('Product name (retailer title)'),
    listedVariant: nullIfMissingText(cell('Format')),
    listedSize: nullIfMissingSize(cell('Size')),
    marketClaim: 'ZA',
    discoverySourceUrl: pickBestUrl([retailerUrl]),
    sourceCheckedAt: DISCOVERY_CUTOFF_DATE,
    notesText: claimText,
    unresolvedQuestions: claimText === '' ? [] : [withholdPrices(claimText).slice(0, 500)],
    sourceBatch,
  };
}

function pickBestUrl(cells: readonly string[]): string | null {
  const ranked: { url: string; rank: number; order: number }[] = [];
  let order = 0;
  for (const cellText of cells) {
    for (const url of extractUrls(cellText)) {
      ranked.push({ url, rank: sourceTypeRank(classifySourceType(url)), order });
      order += 1;
    }
  }
  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return ranked.length > 0 ? ranked[0]!.url : null;
}

function sourceTypeRank(sourceType: DiscoverySourceType): number {
  switch (sourceType) {
    case 'official_za_product_page':
      return 0;
    case 'authorised_distributor':
      return 1;
    case 'retailer_product_page':
      return 2;
    case 'another_market_manufacturer_page':
      return 3;
    case 'brand_homepage':
      return 4;
    case 'retailer_search_feed':
      return 5;
    case 'inaccessible_unverified':
      return 6;
  }
}

const TIMESTAMP_PREFIX_PATTERN = /20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

function extractDate(cell: string): string {
  // Never silently truncate a timestamp to its date prefix: surface the
  // timestamp token so validation rejects it where a date is required.
  const timestamp = TIMESTAMP_PREFIX_PATTERN.exec(cell);
  if (timestamp !== null) return timestamp[0];
  const match = /20\d{2}-\d{2}-\d{2}/.exec(cell);
  return match !== null ? match[0] : DISCOVERY_CUTOFF_DATE;
}

function splitQuestions(cell: string): string[] {
  return cell
    .split(';')
    .map(part => withholdPrices(part.trim()))
    .filter(part => part !== '')
    .slice(0, 50)
    .map(part => part.slice(0, 500));
}

/**
 * Deterministic builder: parse every batch's OUTPUT 2 table in canonical
 * batch order, validate each check date with `validateDiscoveryDate` against
 * the cutoff, assign states, mark exact normalized repeats (brand, name,
 * variant, size) after the first occurrence as `duplicate_candidate` — unless
 * the repeat carries conflicting exact version/formulation markers, which
 * marks it `possible_reformulation` instead — fingerprint each row, and
 * schema-validate the result.
 */
export function buildDiscoveryBacklog(inputs: readonly DiscoveryBatchInput[]): DiscoveryRow[] {
  const ordered = [...inputs].sort(
    (a, b) => DISCOVERY_BATCH_ORDER.indexOf(a.sourceBatch) - DISCOVERY_BATCH_ORDER.indexOf(b.sourceBatch),
  );
  const parsed = ordered.flatMap(input => parseDiscoveryTable(input.sourceBatch, input.markdown));

  const provisional = parsed.map(row => {
    const sourceType = classifySourceType(row.discoverySourceUrl);
    const assignment = assignIdentityStatus({
      category: row.category,
      sourceType,
      listedName: row.listedName,
      notesText: row.notesText,
    });
    return { row, sourceType, assignment };
  });

  const seen = new Map<string, Set<string>>();
  return provisional.map(({ row, sourceType, assignment }) => {
    validateDiscoveryDate(row.sourceCheckedAt, DISCOVERY_CUTOFF_DATE);
    let identityStatus = assignment.identityStatus;
    let exclusionReason = assignment.exclusionReason;
    if (identityStatus !== 'excluded_scope') {
      const key = [
        normalizeDiscoveryText(row.brand),
        normalizeDiscoveryText(row.listedName),
        normalizeDiscoveryText(row.listedVariant ?? ''),
        normalizeDiscoveryText(row.listedSize ?? ''),
      ].join('\0');
      const markers = formulationMarkersOf(row);
      const firstMarkers = seen.get(key);
      if (firstMarkers === undefined) {
        seen.set(key, markers);
      } else if (formulationMarkersConflict(firstMarkers, markers)) {
        identityStatus = 'possible_reformulation';
        exclusionReason = null;
      } else {
        identityStatus = 'duplicate_candidate';
        exclusionReason = null;
      }
    }
    const fingerprint = fingerprintDiscoveryRow({
      sourceBatch: row.sourceBatch,
      temporaryResearchId: row.temporaryResearchId,
      brand: row.brand,
      listedName: row.listedName,
      listedVariant: row.listedVariant,
      listedSize: row.listedSize,
      discoverySourceUrl: row.discoverySourceUrl,
    });
    return DiscoveryRowSchema.parse({
      temporaryResearchId: row.temporaryResearchId,
      category: row.category,
      brand: row.brand,
      listedName: row.listedName,
      listedVariant: row.listedVariant,
      listedSize: row.listedSize,
      marketClaim: row.marketClaim,
      discoverySourceUrl: row.discoverySourceUrl,
      discoverySourceType: sourceType,
      sourceCheckedAt: row.sourceCheckedAt,
      identityStatus,
      exclusionReason,
      unresolvedQuestions: [...row.unresolvedQuestions],
      sourceBatch: row.sourceBatch,
      fingerprint,
    });
  });
}
