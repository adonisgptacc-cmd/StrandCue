-- Cue Check operation receipts contain retry payloads, including owner notes.
-- They are service-internal idempotency material rather than durable owner
-- history. Preserve receipts at the exact 30-day boundary and purge only
-- strictly older rows. Cue Checks, revisions, confirmed steps and notes in
-- the owner record are outside this function and remain for the account life.

create or replace function public.cue_check_operation_retention_cleanup(p_as_of timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_purged integer := 0;
begin
  if p_as_of is null then
    raise exception 'invalid-as-of' using errcode = '22023';
  end if;

  delete from strandcue_private.cue_check_operations operation
  where operation.created_at < p_as_of - interval '30 days';

  get diagnostics v_purged = row_count;
  return v_purged;
end;
$$;

revoke all on function public.cue_check_operation_retention_cleanup(timestamptz)
  from public, anon, authenticated;

do $$ begin
  if exists(select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.cue_check_operation_retention_cleanup(timestamptz)
      to service_role;
  end if;
end $$;
