import type { PGlite } from '@electric-sql/pglite';

/**
 * A small tool catalogue shared by the owner and catalogue tests. The capability columns, claim text,
 * source URL and verification reviewer are canaries: none of them may reach a consumer answer unless it
 * was explicitly published.
 */
export const tid = (n: number) => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const T_BRAND = tid(11);
export const T_BRAND_OTHER = tid(12);
export const T_DRYER = tid(21);
export const T_IRON = tid(22);
export const T_STEAMER = tid(23);
export const TV_DRYER = tid(31);
export const TV_IRON = tid(32);
export const TV_STEAMER_OLD = tid(33);
export const TV_STEAMER_NEW = tid(34);
export const T_CLAIM = tid(41);
export const T_SOURCE = tid(51);

export const T_SECRET_CLAIM = 'Heats evenly to a safe 180 degrees';
export const T_SECRET_SOURCE = 'https://example.test/secret-tool-source';
export const T_SECRET_REVIEWER = 'Draft Reviewer Tessa';

export const TOOL_CATALOGUE_TABLES = ['tool_brands', 'tools', 'tool_versions', 'tool_claims', 'tool_sources', 'tool_verification_events'];

export async function seedToolCatalogue(db: PGlite) {
  await db.exec('set session authorization postgres');
  await db.exec(`insert into public.tool_brands(id, name) values ('${T_BRAND}', 'Salon Brand'), ('${T_BRAND_OTHER}', 'Other Co')`);
  await db.exec(`insert into public.tools(id, brand_id, name, tool_type) values
    ('${T_DRYER}', '${T_BRAND}', 'Pro Dryer', 'dryer'),
    ('${T_IRON}', '${T_BRAND}', 'Smooth Iron', 'flat-iron'),
    ('${T_STEAMER}', '${T_BRAND_OTHER}', 'Steam Press', 'steam-straightener')`);
  await db.exec(`insert into public.tool_versions(id, tool_id, version_label, market, wattage_watts, temperature_max_celsius, adjustable_temp, contact_heat, air_heat, lifecycle, successor_version_id) values
    ('${TV_DRYER}', '${T_DRYER}', '2024', 'ZA', 2200, null, 'unknown', 'no', 'yes', 'active', null),
    ('${TV_IRON}', '${T_IRON}', 'Gen 1', 'ZA', null, 230, 'yes', 'yes', 'no', 'active', null),
    ('${TV_STEAMER_NEW}', '${T_STEAMER}', 'Reformulated', 'ZA', 1800, null, 'unknown', 'yes', 'unknown', 'active', null),
    ('${TV_STEAMER_OLD}', '${T_STEAMER}', 'Original', 'ZA', 1500, null, 'unknown', 'yes', 'unknown', 'retired', '${TV_STEAMER_NEW}')`);
  await db.exec(`insert into public.tool_claims(id, version_id, claim_key, statement) values ('${T_CLAIM}', '${TV_DRYER}', 'even-heat', '${T_SECRET_CLAIM}')`);
  await db.exec(`insert into public.tool_sources(id, version_id, source_url, source_type, trust_tier, market, first_seen, last_checked) values
    ('${T_SOURCE}', '${TV_DRYER}', '${T_SECRET_SOURCE}', 'marketing', 'T10', 'ZA', '2024-01-01', '2024-06-01')`);
  await db.exec(`insert into public.tool_verification_events(id, version_id, reviewer, reviewed_fields, status, reason, source_ids) values
    ('${tid(61)}', '${TV_DRYER}', '${T_SECRET_REVIEWER}', '{capabilities}', 'verified', 'Draft review', '{${T_SOURCE}}')`);
}

export async function clearToolCatalogue(db: PGlite) {
  await db.exec('set session authorization postgres');
  for (const table of [...TOOL_CATALOGUE_TABLES].reverse()) await db.exec(`delete from public.${table}`);
}
