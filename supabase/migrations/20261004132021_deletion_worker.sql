-- Durable service-only continuation survives application profile deletion.
alter table public.deletion_tombstones
  add column auth_deleted_at timestamptz,
  add column worker_lease uuid,
  add column worker_lease_until timestamptz,
  add column worker_attempts integer not null default 0,
  add column worker_retry_at timestamptz,
  add column worker_error text;

create function public.deletion_worker_claim(p_lease uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job public.deletion_tombstones;
begin
  if p_lease is null then raise exception 'invalid-lease' using errcode='22023'; end if;
  -- Already-purged retries have no cancellable profile.
  select t.* into job from public.deletion_tombstones t
    where t.auth_deleted_at is null
      and (t.worker_lease_until is null or t.worker_lease_until <= now())
      and (t.worker_retry_at is null or t.worker_retry_at <= now())
      and t.purge_completed_at is not null
    order by t.deleted_at, t.user_id for update skip locked limit 1;
  if not found then
    -- Lock both rows without waiting; cancellation holds the profile lock.
    select t.* into job from public.profiles p join public.deletion_tombstones t on t.user_id=p.user_id
      where p.account_status='deleting' and t.purge_completed_at is null
        and t.auth_deleted_at is null
        and (t.worker_lease_until is null or t.worker_lease_until<=now())
        and (t.worker_retry_at is null or t.worker_retry_at<=now())
      order by t.deleted_at,t.user_id for update of p,t skip locked limit 1;
  end if;
  if not found then return null; end if;
  delete from public.profiles where user_id=job.user_id and account_status='deleting';
  update public.deletion_tombstones set purge_completed_at=coalesce(purge_completed_at,now()),
    worker_lease=p_lease, worker_lease_until=now()+interval '5 minutes',
    worker_attempts=worker_attempts+1, worker_error=null
    where user_id=job.user_id;
  return jsonb_build_object('userId',job.user_id,'lease',p_lease);
end $$;

create function public.deletion_worker_finish(p_user_id uuid,p_lease uuid,p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if p_error is not null and p_error not in ('auth-delete-failed','worker-failed') then
    raise exception 'invalid-error-code' using errcode='22023';
  end if;
  update public.deletion_tombstones set
    auth_deleted_at=case when p_error is null then now() else auth_deleted_at end,
    worker_retry_at=case when p_error is null then null else now()+interval '5 minutes' end,
    worker_error=p_error, worker_lease=null,worker_lease_until=null
    where user_id=p_user_id and worker_lease=p_lease and auth_deleted_at is null;
  get diagnostics changed=row_count;
  return changed=1;
end $$;

revoke all on function public.deletion_worker_claim(uuid),public.deletion_worker_finish(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.deletion_purge(),public.deletion_reapply(),public.export_retention_cleanup() from public,anon,authenticated;
-- PGlite has no platform service_role; hosted Supabase does. Never broaden
-- consumer permissions to make the synthetic harness mimic the platform.
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.deletion_worker_claim(uuid),public.deletion_worker_finish(uuid,uuid,text) to service_role;
    grant execute on function public.deletion_purge(),public.deletion_reapply(),public.export_retention_cleanup() to service_role;
  end if;
end $$;
