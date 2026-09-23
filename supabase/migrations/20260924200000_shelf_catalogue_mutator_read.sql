-- Shelf catalogue mutator reads — follow-up to 20260924170000
--
-- The shelf RPC cores run as strandcue_mutator and must validate catalogue
-- version links. Catalogue stays publicly readable and runtime-immutable:
-- this adds SELECT only, still no INSERT/UPDATE/DELETE path for any role.

grant strandcue_mutator to current_user with set true;

drop policy if exists brand_read on public.brands;
drop policy if exists product_read on public.products;
drop policy if exists product_version_read on public.product_versions;
drop policy if exists product_claim_read on public.product_claims;
drop policy if exists product_source_read on public.product_sources;
drop policy if exists product_verification_event_read on public.product_verification_events;

create policy brand_read on public.brands for select to authenticated, strandcue_mutator using (true);
create policy product_read on public.products for select to authenticated, strandcue_mutator using (true);
create policy product_version_read on public.product_versions for select to authenticated, strandcue_mutator using (true);
create policy product_claim_read on public.product_claims for select to authenticated, strandcue_mutator using (true);
create policy product_source_read on public.product_sources for select to authenticated, strandcue_mutator using (true);
create policy product_verification_event_read on public.product_verification_events for select to authenticated, strandcue_mutator using (true);

grant select on public.brands, public.products, public.product_versions,
  public.product_claims, public.product_sources, public.product_verification_events
  to strandcue_mutator;

revoke set option for strandcue_mutator from current_user;
