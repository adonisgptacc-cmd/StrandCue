-- Executable privacy retention cleanup (Task 13, Increment 2).
--
-- This is the enforcement half of the retention policy documented in
-- docs/runbooks/protocol-execution-persistence.md (Retention section) and
-- docs/runbooks/privacy-retention.md. Every number below is inherited, not
-- invented:
-- - completed executions: purge-eligible 90 days after finishedAt.
-- - abandoned executions: purge-eligible 30 days after finishedAt.
--   (Both windows come from the Task-7 runbook; no new window is introduced.)
-- - Export artifacts: download expiry stays 24h (expires_at gate in
--   export_download); document nulling stays 7 days after completion
--   (existing export_retention_cleanup, reused unchanged).
-- - Deletion records: RETAINED, never purged. Purge-completed tombstones
--   back the completion guard that denies profile recreation with an old
--   JWT, and strandcue_private.deletion_lifecycle_events is append-only by
--   binding Task-9 constraint (no UPDATE/DELETE grants, no vocabulary
--   widening, no FK to profiles). There is deliberately no deletion-record
--   purge function in this migration.
--
-- What this migration adds:
-- 1. protocol_executions.legal_hold (boolean, NOT NULL DEFAULT false): the
--    operator mechanism behind "anything under legal hold is never
--    eligible". Operators set it with a direct privileged UPDATE
--    (documented in the runbook); no consumer RPC is added, so the
--    authenticated surface does not widen. The flag is visible to owners
--    through the existing SELECT policy; it carries no PII.
-- 2. public.protocol_execution_retention_cleanup(): deterministic,
--    scheduler-only purge of eligible terminal executions. Purge order per
--    the runbook: events, then operations ledger rows matched via
--    request->>'executionId', then the execution row itself (which would
--    cascade any remaining events). finishedAt is read from the execution
--    snapshot; a null or unreachable finishedAt is never eligible
--    (fail-closed), and non-terminal rows are never eligible. A malformed
--    finishedAt fails the run loudly instead of silently skipping rows.
--
-- Run-vs-execution decision (documented choice): recommendation runs are
-- NEVER purged. Runs are the immutable audit root: executions reference
-- runs via protocol_executions_run_fk ON DELETE CASCADE, so deleting a run
-- would cascade-delete its executions, while deleting an execution leaves
-- its run behind with no constraint violated. Runs carry no terminal state
-- and no expiry semantics, are size-capped at 256 KiB, and keep finished
-- routines reproducible. The cleanup below never touches
-- public.recommendation_runs (proven by test).
--
-- Consent records are untouched (7-year retention, no profile FK, survive
-- purge by design). Research archive, Garnier evidence, Human A/B packet,
-- draft guidance bundle, and the ledger are untouched.
--
-- Grants: revoked from public/anon/authenticated like every other
-- maintenance routine; executable by the platform service_role where it
-- exists (PGlite has none; hosted Supabase does). No RLS policy is added
-- or changed: the function is SECURITY DEFINER owned by the migration
-- applier and bypasses RLS exactly like export_retention_cleanup. No
-- consumer execute grant is added.
--
-- This migration is PGlite-local only and must never be applied to hosted
-- Supabase by hand.

alter table public.protocol_executions
  add column legal_hold boolean not null default false;

create or replace function public.protocol_execution_retention_cleanup()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_executions integer := 0;
  v_events integer := 0;
  v_operations integer := 0;
begin
  delete from public.protocol_execution_events ev
  using public.protocol_executions e
  where ev.user_id = e.user_id
    and ev.execution_id = e.execution_id
    and e.legal_hold is not true
    and ((e.status = 'completed'
        and (e.execution->>'finishedAt')::timestamptz < now() - interval '90 days')
      or (e.status = 'abandoned'
        and (e.execution->>'finishedAt')::timestamptz < now() - interval '30 days'));
  get diagnostics v_events = row_count;

  delete from strandcue_private.protocol_execution_operations o
  using public.protocol_executions e
  where o.user_id = e.user_id
    and o.request->>'executionId' = e.execution_id::text
    and e.legal_hold is not true
    and ((e.status = 'completed'
        and (e.execution->>'finishedAt')::timestamptz < now() - interval '90 days')
      or (e.status = 'abandoned'
        and (e.execution->>'finishedAt')::timestamptz < now() - interval '30 days'));
  get diagnostics v_operations = row_count;

  delete from public.protocol_executions e
  where e.legal_hold is not true
    and ((e.status = 'completed'
        and (e.execution->>'finishedAt')::timestamptz < now() - interval '90 days')
      or (e.status = 'abandoned'
        and (e.execution->>'finishedAt')::timestamptz < now() - interval '30 days'));
  get diagnostics v_executions = row_count;

  return jsonb_build_object(
    'executions', v_executions, 'events', v_events, 'operations', v_operations);
end;
$$;

revoke all on function public.protocol_execution_retention_cleanup() from public, anon, authenticated;
-- PGlite has no platform service_role; hosted Supabase does. Never broaden
-- consumer permissions to make the synthetic harness mimic the platform.
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.protocol_execution_retention_cleanup() to service_role;
  end if;
end $$;

-- Export shape parity for the new column (classify decision: include).
--
-- protocol_executions is an exported table whose JSON branch embeds whole
-- rows via to_jsonb, so legal_hold enters JSON exports automatically. The
-- CSV branch lists columns explicitly (like the trusted flag before it),
-- so export_build_csv is redefined here to carry legal_hold after status,
-- keeping both shapes identical. The family shape changed, so
-- protocolExecutions moves 1 -> 2 in both the JSON schemaVersions block
-- and schema_versions.csv (the trusted flag predated versioning and was
-- versioned as 1 after the fact; this is the first post-versioning column
-- addition, and the versions exist precisely to mark shape changes).
-- legal_hold is the owner's own non-PII hold state, not service-internals:
-- readers can tell held rows, exactly as trusted does for audited rows.
-- Nothing else about the builders changes: owner predicates, csv_quote
-- escaping, ordering, the recent-auth gate, op-idempotency, 24h expiry,
-- retention, record_count, and all other families are untouched.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create or replace function strandcue_private.export_build_csv(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  profile_csv text;
  passport_csv text;
  services_csv text;
  activities_csv text;
  shelf_csv text;
  shelf_revisions_csv text;
  tools_csv text;
  tool_revisions_csv text;
  consent_csv text;
  runs_csv text;
  executions_csv text;
  execution_events_csv text;
  schema_versions_csv text;
begin
  select 'username,country,currency,temperature_unit,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(username) || ',' || strandcue_private.csv_quote(country) || ',' || strandcue_private.csv_quote(currency) || ',' || strandcue_private.csv_quote(temperature_unit) || ',' || strandcue_private.csv_quote(created_at::text), chr(10)), '')
    into profile_csv from public.profiles where user_id = p_uid;

  select 'id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind) || ',' || strandcue_private.csv_quote(r.effective_date::text)
      || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text) || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason), chr(10) order by r.sequence), '')
    into passport_csv from public.passport_revisions r join public.hair_passports h on h.id = r.passport_id where h.user_id = p_uid;

  select 'id,service_id,sequence,base_revision,kind,facts,heat_state,effective_start,effective_end,recorded_at,corrects_id,correction_reason' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.service_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.facts::text) || ',' || strandcue_private.csv_quote(r.heat_state) || ',' || strandcue_private.csv_quote(r.effective_start::text) || ',' || strandcue_private.csv_quote(r.effective_end::text)
      || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason), chr(10) order by r.recorded_at, r.service_id, r.sequence), '')
    into services_csv from public.service_revisions r join public.chemical_services s on s.id = r.service_id where s.user_id = p_uid;

  select 'id,activity_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason,void_reason' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.activity_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.effective_date::text) || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text)
      || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason) || ',' || strandcue_private.csv_quote(r.void_reason), chr(10) order by r.recorded_at, r.activity_id, r.sequence), '')
    into activities_csv from public.activity_revisions r join public.activities a on a.id = r.activity_id where a.owner = p_uid;

  select 'id,version_id,manual_brand,manual_name,manual_category,availability,matched,matched_at,match_confirmed,revision,notes,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(u.id::text) || ',' || strandcue_private.csv_quote(u.version_id::text) || ',' || strandcue_private.csv_quote(u.manual_brand) || ',' || strandcue_private.csv_quote(u.manual_name) || ',' || strandcue_private.csv_quote(u.manual_category)
      || ',' || strandcue_private.csv_quote(u.availability) || ',' || strandcue_private.csv_quote(u.matched::text) || ',' || strandcue_private.csv_quote(u.matched_at::text) || ',' || strandcue_private.csv_quote(u.match_confirmed::text)
      || ',' || strandcue_private.csv_quote(u.revision::text) || ',' || strandcue_private.csv_quote(u.notes) || ',' || strandcue_private.csv_quote(u.created_at::text), chr(10) order by u.created_at, u.id), '')
    into shelf_csv from public.user_products u where u.owner = p_uid;

  select 'id,user_product_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason,match_version_id' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.user_product_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.effective_date::text) || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text)
      || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason) || ',' || strandcue_private.csv_quote(r.match_version_id::text), chr(10) order by r.recorded_at, r.user_product_id, r.sequence), '')
    into shelf_revisions_csv from public.user_product_revisions r join public.user_products u on u.id = r.user_product_id where u.owner = p_uid;

  select 'id,version_id,manual_brand,manual_model,tool_type,availability,matched,matched_at,match_confirmed,revision,notes,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(u.id::text) || ',' || strandcue_private.csv_quote(u.version_id::text) || ',' || strandcue_private.csv_quote(u.manual_brand) || ',' || strandcue_private.csv_quote(u.manual_model) || ',' || strandcue_private.csv_quote(u.tool_type)
      || ',' || strandcue_private.csv_quote(u.availability) || ',' || strandcue_private.csv_quote(u.matched::text) || ',' || strandcue_private.csv_quote(u.matched_at::text) || ',' || strandcue_private.csv_quote(u.match_confirmed::text)
      || ',' || strandcue_private.csv_quote(u.revision::text) || ',' || strandcue_private.csv_quote(u.notes) || ',' || strandcue_private.csv_quote(u.created_at::text), chr(10) order by u.created_at, u.id), '')
    into tools_csv from public.user_tools u where u.owner = p_uid;

  select 'id,user_tool_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason,match_version_id' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.user_tool_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.effective_date::text) || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text)
      || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason) || ',' || strandcue_private.csv_quote(r.match_version_id::text), chr(10) order by r.recorded_at, r.user_tool_id, r.sequence), '')
    into tool_revisions_csv from public.user_tool_revisions r join public.user_tools u on u.id = r.user_tool_id where u.owner = p_uid;

  select 'id,purpose,granted,recorded_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(c.id::text) || ',' || strandcue_private.csv_quote(c.purpose) || ',' || strandcue_private.csv_quote(c.granted::text) || ',' || strandcue_private.csv_quote(c.recorded_at::text), chr(10) order by c.recorded_at, c.id), '')
    into consent_csv from public.consent_records c where c.user_id = p_uid;

  select 'id,request_id,input_fingerprint,as_of,engine_version,bundle_id,bundle_version,status,trusted,input,decision,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.request_id::text) || ',' || strandcue_private.csv_quote(r.input_fingerprint) || ',' || strandcue_private.csv_quote(r.as_of::text)
      || ',' || strandcue_private.csv_quote(r.engine_version) || ',' || strandcue_private.csv_quote(r.bundle_id) || ',' || strandcue_private.csv_quote(r.bundle_version) || ',' || strandcue_private.csv_quote(r.status)
      || ',' || strandcue_private.csv_quote(r.trusted::text) || ',' || strandcue_private.csv_quote(r.input::text) || ',' || strandcue_private.csv_quote(r.decision::text) || ',' || strandcue_private.csv_quote(r.created_at::text), chr(10) order by r.created_at, r.id), '')
    into runs_csv from public.recommendation_runs r where r.user_id = p_uid;

  select 'id,execution_id,recommendation_run_id,revision,status,legal_hold,decision,execution,created_at,updated_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(e.id::text) || ',' || strandcue_private.csv_quote(e.execution_id::text) || ',' || strandcue_private.csv_quote(e.recommendation_run_id::text) || ',' || strandcue_private.csv_quote(e.revision::text)
      || ',' || strandcue_private.csv_quote(e.status) || ',' || strandcue_private.csv_quote(e.legal_hold::text) || ',' || strandcue_private.csv_quote(e.decision::text) || ',' || strandcue_private.csv_quote(e.execution::text)
      || ',' || strandcue_private.csv_quote(e.created_at::text) || ',' || strandcue_private.csv_quote(e.updated_at::text), chr(10) order by e.created_at, e.id), '')
    into executions_csv from public.protocol_executions e where e.user_id = p_uid;

  select 'id,execution_id,sequence,kind,command,revision,recorded_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(v.id::text) || ',' || strandcue_private.csv_quote(v.execution_id::text) || ',' || strandcue_private.csv_quote(v.sequence::text) || ',' || strandcue_private.csv_quote(v.kind)
      || ',' || strandcue_private.csv_quote(v.command::text) || ',' || strandcue_private.csv_quote(v.revision::text) || ',' || strandcue_private.csv_quote(v.recorded_at::text), chr(10) order by v.execution_id, v.sequence), '')
    into execution_events_csv from public.protocol_execution_events v where v.user_id = p_uid;

  -- Owner-independent version manifest: mirrors the JSON schemaVersions block.
  select 'family,version' || chr(10)
    || 'export,2' || chr(10)
    || 'consentRecords,1' || chr(10)
    || 'recommendationRuns,1' || chr(10)
    || 'protocolExecutions,2' || chr(10)
    || 'protocolExecutionEvents,1'
    into schema_versions_csv;

  return jsonb_build_object('files', jsonb_build_object(
    'profile.csv', profile_csv,
    'passport_revisions.csv', passport_csv,
    'service_revisions.csv', services_csv,
    'activity_revisions.csv', activities_csv,
    'user_products.csv', shelf_csv,
    'user_product_revisions.csv', shelf_revisions_csv,
    'user_tools.csv', tools_csv,
    'user_tool_revisions.csv', tool_revisions_csv,
    'consent_records.csv', consent_csv,
    'recommendation_runs.csv', runs_csv,
    'protocol_executions.csv', executions_csv,
    'protocol_execution_events.csv', execution_events_csv,
    'schema_versions.csv', schema_versions_csv));
end;
$$;
alter function strandcue_private.export_build_csv(uuid) owner to strandcue_mutator;

-- Same request core with consent + guidance families in the JSON branch.
-- The single change is protocolExecutions 1 -> 2 in the schemaVersions
-- block; the recent-auth gate, op-idempotency, owner scoping, 24h expiry
-- and retention are unchanged.
create or replace function strandcue_private.request_export(p_operation_id uuid, p_format text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  payload jsonb;
  prev strandcue_private.export_operations%rowtype;
  job_id uuid := gen_random_uuid();
  document jsonb;
  counts integer := 0;
  n integer;
  result jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  if p_format is null or (p_format <> 'json' and p_format <> 'csv') then raise exception 'invalid-format' using errcode = '22023'; end if;
  if not strandcue_private.recent_auth(15) then raise exception 'recent-auth-required' using errcode = '42501'; end if;
  payload := jsonb_build_object('op', p_operation_id, 'format', p_format);
  select * into prev from strandcue_private.export_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;

  if p_format = 'csv' then
    select strandcue_private.export_build_csv(uid) into document;
  else
    select jsonb_build_object(
    'exportedAt', now(),
    'userId', uid,
    'schemaVersions', jsonb_build_object('export', 2, 'consentRecords', 1, 'recommendationRuns', 1,
      'protocolExecutions', 2, 'protocolExecutionEvents', 1),
    'profile', (select jsonb_build_object('username', p.username, 'country', p.country, 'currency', p.currency,
      'temperatureUnit', p.temperature_unit, 'createdAt', p.created_at)
      from public.profiles p where p.user_id = uid),
    'passport', (select jsonb_build_object('revision', h.revision, 'projection', h.current_projection,
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.passport_revisions r where r.passport_id = h.id))
      from public.hair_passports h where h.user_id = uid),
    'chemicalServices', (select coalesce(jsonb_agg(jsonb_build_object('service', to_jsonb(s),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.service_revisions r where r.service_id = s.id),
        'zones', (select coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb)
          from public.service_zones z where z.service_id = s.id),
        'observations', (select coalesce(jsonb_agg(to_jsonb(o) order by o.recorded_at), '[]'::jsonb)
          from public.service_observations o where o.service_id = s.id),
        'heatEvents', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
          from public.heat_events e where e.service_id = s.id))), '[]'::jsonb)
      from public.chemical_services s where s.user_id = uid),
    'activities', (select coalesce(jsonb_agg(jsonb_build_object('activity', to_jsonb(a),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.activity_revisions r where r.activity_id = a.id),
        'products', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
          from public.activity_products l where l.activity_id = a.id),
        'tools', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
          from public.activity_tools l where l.activity_id = a.id),
        'heatEvents', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
          from public.activity_heat_events e where e.activity_id = a.id))), '[]'::jsonb)
      from public.activities a where a.owner = uid),
    'userProducts', (select coalesce(jsonb_agg(jsonb_build_object('product', to_jsonb(u),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.user_product_revisions r where r.user_product_id = u.id),
        'catalogueVersion', (select to_jsonb(v) from public.product_versions v where v.id = u.version_id),
        'claims', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
          from public.product_claims c where c.version_id = u.version_id),
        'verificationEvents', (select coalesce(jsonb_agg(to_jsonb(e) order by e.recorded_at), '[]'::jsonb)
          from public.product_verification_events e where e.version_id = u.version_id))), '[]'::jsonb)
      from public.user_products u where u.owner = uid),
    'userTools', (select coalesce(jsonb_agg(jsonb_build_object('tool', to_jsonb(u),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.user_tool_revisions r where r.user_tool_id = u.id),
        'catalogueVersion', (select to_jsonb(v) from public.tool_versions v where v.id = u.version_id),
        'claims', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
          from public.tool_claims c where c.version_id = u.version_id),
        'verificationEvents', (select coalesce(jsonb_agg(to_jsonb(e) order by e.recorded_at), '[]'::jsonb)
          from public.tool_verification_events e where e.version_id = u.version_id))), '[]'::jsonb)
      from public.user_tools u where u.owner = uid),
    'consentRecords', (select coalesce(jsonb_agg(to_jsonb(c) order by c.recorded_at, c.id), '[]'::jsonb)
      from public.consent_records c where c.user_id = uid),
    'recommendationRuns', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.id), '[]'::jsonb)
      from public.recommendation_runs r where r.user_id = uid),
    'protocolExecutions', (select coalesce(jsonb_agg(
        to_jsonb(e) || jsonb_build_object('events',
          (select coalesce(jsonb_agg(to_jsonb(v) order by v.sequence), '[]'::jsonb)
            from public.protocol_execution_events v where v.user_id = uid and v.execution_id = e.execution_id))
        order by e.created_at, e.id), '[]'::jsonb)
      from public.protocol_executions e where e.user_id = uid)
    ) into document;
  end if;

  select coalesce((select count(*) from public.passport_revisions r join public.hair_passports h on h.id = r.passport_id where h.user_id = uid), 0)
    + coalesce((select count(*) from public.service_revisions r join public.chemical_services s on s.id = r.service_id where s.user_id = uid), 0)
    + coalesce((select count(*) from public.activity_revisions r join public.activities a on a.id = r.activity_id where a.owner = uid), 0)
    + coalesce((select count(*) from public.user_product_revisions r join public.user_products u on u.id = r.user_product_id where u.owner = uid), 0)
    + coalesce((select count(*) from public.user_tool_revisions r join public.user_tools u on u.id = r.user_tool_id where u.owner = uid), 0)
    + coalesce((select count(*) from public.consent_records c where c.user_id = uid), 0)
    + coalesce((select count(*) from public.recommendation_runs r where r.user_id = uid), 0)
    + coalesce((select count(*) from public.protocol_executions e where e.user_id = uid), 0)
    + coalesce((select count(*) from public.protocol_execution_events v where v.user_id = uid), 0)
    into n;
  counts := n;

  insert into public.export_jobs(id, owner, format, status, document, record_count, completed_at, expires_at)
    values (job_id, uid, p_format, 'completed', document, counts, now(), now() + interval '24 hours');
  result := jsonb_build_object('jobId', job_id, 'status', 'completed', 'recordCount', counts, 'expiresAt', now() + interval '24 hours');
  insert into strandcue_private.export_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, payload, result);
  return result;
end;
$$;
alter function strandcue_private.request_export(uuid, text) owner to strandcue_mutator;

revoke all on function strandcue_private.csv_quote(text), strandcue_private.export_build_csv(uuid) from public, anon, authenticated;
grant execute on function strandcue_private.csv_quote(text), strandcue_private.export_build_csv(uuid) to strandcue_mutator;
grant execute on function strandcue_private.request_export(uuid, text) to authenticated, strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
