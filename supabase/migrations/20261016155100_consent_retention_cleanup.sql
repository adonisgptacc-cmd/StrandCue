-- Seven-year consent retention enforcement (Fix C).
--
-- The schedule was documented but never enforced: the consent baseline
-- (20260924330000_consent.sql:5-6) promises a 7-year retention schedule and
-- deliberately keeps consent_records free of any profile FK so rows survive
-- account purge, yet no cleanup routine ever expired them. This migration
-- adds the enforcement half; no document, matrix, or runbook number changes.
--
-- Eligibility (all relative to the explicit p_as_of argument):
-- - Active owner (a public.profiles row exists for user_id): the LATEST
--   record per (user_id, purpose) — ordered by recorded_at, id — is current
--   state and is preserved no matter its age. Only superseded rows with
--   recorded_at strictly older than as-of minus 7 years purge.
-- - Deleted owner (no profile row): rows with recorded_at strictly older
--   than as-of minus 7 years purge; recent rows survive.
-- - Boundary: strictly-older-than purges, so exactly-seven-years survives.
-- - Purposes are independent: latest is computed per (user_id, purpose).
--
-- The explicit p_as_of parameter (no raw now() clock) makes frozen-time
-- tests deterministic; the scheduler passes the current time.
--
-- Append-only consumer behavior is untouched: no UPDATE/DELETE policy or
-- grant is added to consent_records for any role, the mutator append path
-- (consent_record_append + set_consent) is unchanged, and the function
-- returns a count only — never record content.
--
-- Grants: revoked from public/anon/authenticated like every other
-- maintenance routine; executable by the platform service_role where it
-- exists (PGlite has none; hosted Supabase does). The function is SECURITY
-- DEFINER owned by the migration applier and bypasses RLS exactly like
-- export_retention_cleanup. No RLS policy is added or changed. No consumer
-- execute grant is added.
--
-- This migration is PGlite-local only and must never be applied to hosted
-- Supabase by hand.

create or replace function public.consent_retention_cleanup(p_as_of timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_purged integer := 0;
begin
  if p_as_of is null then raise exception 'invalid-as-of' using errcode = '22023'; end if;
  delete from public.consent_records c
  where c.recorded_at < p_as_of - interval '7 years'
    and (
      not exists (select 1 from public.profiles p where p.user_id = c.user_id)
      or exists (
        select 1 from public.consent_records newer
        where newer.user_id = c.user_id
          and newer.purpose = c.purpose
          and (newer.recorded_at > c.recorded_at
            or (newer.recorded_at = c.recorded_at and newer.id > c.id))
      )
    );
  get diagnostics v_purged = row_count;
  return v_purged;
end;
$$;

revoke all on function public.consent_retention_cleanup(timestamptz) from public, anon, authenticated;
-- PGlite has no platform service_role; hosted Supabase does. Never broaden
-- consumer permissions to make the synthetic harness mimic the platform.
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.consent_retention_cleanup(timestamptz) to service_role;
  end if;
end $$;
