import type { PGlite } from '@electric-sql/pglite';

/** A small catalogue shared by the search and matching tests. Text in claims, sources, ingredients and directions is a canary: it must never reach a search answer. */
export const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Brand ids 1x, product ids 2x, version ids 3x.
export const BRAND_HOUSE = id(11);
export const BRAND_OTHER = id(12);
export const PRODUCT_SHAMPOO = id(21);
export const PRODUCT_CONDITIONER = id(22);
export const PRODUCT_MASK = id(23);
export const V_SHAMPOO_PLAIN = id(31);
export const V_SHAMPOO_TRAVEL = id(32);
export const V_CONDITIONER = id(33);
export const V_MASK_RETIRED = id(34);
export const V_MASK_SUCCESSOR = id(35);

// Text that exists only in non-identity catalogue tables. None of it may
// ever reach a search response.
export const SECRET_CLAIM = 'Repairs split ends overnight';
export const SECRET_INGREDIENT = 'secret-ingredient-xyz';
export const SECRET_DIRECTION = 'secret-direction-xyz';
export const SECRET_SOURCE = 'https://example.test/secret-source';

export async function seedCatalogue(db: PGlite) {
  await db.exec('set session authorization postgres');
  await db.exec(`insert into public.brands(id, name) values
    ('${BRAND_HOUSE}', 'House Brand'), ('${BRAND_OTHER}', 'Other Co')`);
  await db.exec(`insert into public.products(id, brand_id, name, category, market) values
    ('${PRODUCT_SHAMPOO}', '${BRAND_HOUSE}', 'Gentle Shampoo', 'shampoo', 'ZA'),
    ('${PRODUCT_CONDITIONER}', '${BRAND_HOUSE}', 'Gentle Conditioner', 'conditioner', 'ZA'),
    ('${PRODUCT_MASK}', '${BRAND_OTHER}', 'Deep Mask', 'mask', 'ZA')`);
  await db.exec(`insert into public.product_versions(id, product_id, variant, market, barcode, structured_directions, ingredients, lifecycle, successor_version_id) values
    ('${V_SHAMPOO_PLAIN}', '${PRODUCT_SHAMPOO}', null, 'ZA', '6001234567890', '{"note":"${SECRET_DIRECTION}"}', '{"list":"${SECRET_INGREDIENT}"}', 'active', null),
    ('${V_SHAMPOO_TRAVEL}', '${PRODUCT_SHAMPOO}', 'Travel 50 ml', 'ZA', null, '{}', null, 'active', null),
    ('${V_CONDITIONER}', '${PRODUCT_CONDITIONER}', 'Dry hair', 'ZA', null, '{}', null, 'active', null),
    ('${V_MASK_SUCCESSOR}', '${PRODUCT_MASK}', 'Reformulated', 'ZA', null, '{}', null, 'active', null),
    ('${V_MASK_RETIRED}', '${PRODUCT_MASK}', 'Original', 'ZA', null, '{}', null, 'retired', '${V_MASK_SUCCESSOR}')`);
  await db.exec(`insert into public.product_claims(id, version_id, claim_key, statement) values
    ('${id(41)}', '${V_SHAMPOO_PLAIN}', 'repair', '${SECRET_CLAIM}')`);
  await db.exec(`insert into public.product_sources(id, version_id, source_url, source_type, trust_tier, market, first_seen, last_checked) values
    ('${id(51)}', '${V_SHAMPOO_PLAIN}', '${SECRET_SOURCE}', 'marketing', 'T10', 'ZA', '2024-01-01', '2024-06-01')`);
}

export const CATALOGUE_TABLES = ['brands', 'products', 'product_versions', 'product_claims', 'product_sources', 'product_verification_events'];
