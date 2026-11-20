-- Until assessed prescriptions are verified at trusted insert and start,
-- a reviewed heat-action reference must never become an executable run.
create function strandcue_private.reject_unimplemented_heat_step()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if jsonb_typeof(new.decision->'steps') = 'array' and exists (
    select 1 from jsonb_array_elements(new.decision->'steps') step
    where step->>'action' = 'heat'
       or coalesce(step->'heatActionRef', 'null'::jsonb) <> 'null'::jsonb
  ) then
    raise exception 'invalid-heat-binding' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function strandcue_private.reject_unimplemented_heat_step()
  from public, anon, authenticated, service_role;

create trigger trusted_heat_action_hold
  before insert or update of decision on public.recommendation_runs
  for each row execute function strandcue_private.reject_unimplemented_heat_step();

create trigger execution_heat_action_hold
  before insert or update of decision on public.protocol_executions
  for each row execute function strandcue_private.reject_unimplemented_heat_step();
