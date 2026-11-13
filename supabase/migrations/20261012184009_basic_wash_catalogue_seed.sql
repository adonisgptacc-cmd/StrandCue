-- Catalogue seed compiled by `npm run compile:catalogue` from reviewed intake. Do not edit.
-- Deterministic output: rerunning on unchanged input yields byte-identical SQL.
-- Plain inserts only: any id conflict aborts the transaction instead of silently merging a disagreement.
begin;
insert into public.brands (id, name) values ('0c9e273f-ed2e-5035-9649-bb657101d97e', 'Garnier Ultimate Blends');
insert into public.products (id, brand_id, name, category, market) values ('2bc26c97-9e88-552c-9bf0-173dc44e4636', '0c9e273f-ed2e-5035-9649-bb657101d97e', 'Ultimate Blends Hair Food Nourishing Banana Hair Food Shampoo For Dry Hair', 'shampoo', 'ZA'),
  ('313c012b-4636-574b-babc-16c0772517fa', '0c9e273f-ed2e-5035-9649-bb657101d97e', 'Ultimate Blends Hair Food Nourishing Banana Hair Food Conditioner For Dry Hair', 'conditioner', 'ZA');
insert into public.product_versions (id, product_id, variant, market, barcode, lifecycle) values ('6ae2cd7a-2d89-5d16-a07d-36ca44139c59', '313c012b-4636-574b-babc-16c0772517fa', 'Hair Food Banana and Coconut for dry hair', 'ZA', null, 'active'),
  ('96759932-6d87-56c2-8165-8f95260447f4', '2bc26c97-9e88-552c-9bf0-173dc44e4636', 'Hair Food Banana and Coconut for dry hair', 'ZA', null, 'active');
insert into public.product_claims (id, version_id, claim_key, statement) values ('aed5673c-42a0-5ae8-9c78-2497988b6aa9', '96759932-6d87-56c2-8165-8f95260447f4', 'name', 'Garnier Ultimate Blends Ultimate Blends Hair Food Nourishing Banana Hair Food Shampoo For Dry Hair'),
  ('f1f959ca-3202-53fe-aa65-8a4eb0734d31', '6ae2cd7a-2d89-5d16-a07d-36ca44139c59', 'name', 'Garnier Ultimate Blends Ultimate Blends Hair Food Nourishing Banana Hair Food Conditioner For Dry Hair');
insert into public.product_sources (id, version_id, source_url, archived_url, source_type, trust_tier, market, first_seen, last_checked) values ('b6596fbe-563f-5448-a5c5-2266d41678bd', '6ae2cd7a-2d89-5d16-a07d-36ca44139c59', 'https://africa.garnier.com/en-za/about-our-brands/ultimate-blends-hub/ultimate-blends/hair-food/ultimate-blends-hair-food-banana-conditioner', null, 'manufacturer', 'T5', 'ZA', '2026-10-12', '2026-10-12'),
  ('efd4f2e3-b5cb-5bde-8978-b388ee76cd8e', '96759932-6d87-56c2-8165-8f95260447f4', 'https://africa.garnier.com/en-za/about-our-brands/ultimate-blends-hub/ultimate-blends/hair-food/ultimate-blends-hair-food-banana-shampoo', null, 'manufacturer', 'T5', 'ZA', '2026-10-12', '2026-10-12');
commit;
