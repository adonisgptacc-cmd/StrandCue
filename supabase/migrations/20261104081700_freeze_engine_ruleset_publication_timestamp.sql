-- Keep publication timestamps immutable even when the state is unchanged.
grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;

set role strandcue_mutator;

create or replace function strandcue_private.engine_ruleset_admission_guard()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := strandcue_private.request_uid();
  v_rule jsonb;
  v_authorization jsonb;
  v_action text;
begin
  if tg_op = 'INSERT' then
    if new.state <> 'draft' or new.published_at is not null then
      raise exception 'engine-ruleset-direct-publish-forbidden' using errcode='P0001';
    end if;
    if v_actor is null then
      raise exception 'engine-ruleset-authentication-required' using errcode='P0001';
    end if;
    if new.authored_by is distinct from v_actor then
      raise exception 'engine-ruleset-author-mismatch' using errcode='P0001';
    end if;
  elsif new.state is not distinct from old.state
      and new.published_at is distinct from old.published_at then
    raise exception 'engine-ruleset-state-transition-invalid' using errcode='P0001';
  end if;

  if jsonb_typeof(new.packet->'rules') = 'array' then
    for v_rule in select value from jsonb_array_elements(new.packet->'rules') loop
      if v_rule ? 'successorOf' and not (new.packet ? 'successorReview') then
        raise exception 'engine-ruleset-successor-review-required' using errcode='P0001';
      end if;
      if v_rule ? 'successorOf' and new.packet ? 'successorReview' then
        if not exists (
          select 1 from jsonb_array_elements(new.packet #> '{successorReview,authorizations}') a(value)
           where a.value->>'successorRuleId'=v_rule->>'ruleId'
             and a.value->>'successorRuleVersion'=v_rule->>'version'
             and a.value->>'withdrawnRuleId'=v_rule #>> '{successorOf,withdrawnRuleId}'
             and a.value->>'withdrawnRuleVersion'=v_rule #>> '{successorOf,withdrawnRuleVersion}'
             and exists (
               select 1 from jsonb_array_elements(v_rule->'effects') e(value)
                where e.value->>'kind'='include_candidate'
                  and e.value->>'candidateId'=a.value->>'affectedActionId')) then
          raise exception 'engine-ruleset-successor-rule-invalid' using errcode='P0001';
        end if;
      end if;
    end loop;
  end if;

  if new.packet ? 'successorReview' then
    for v_authorization in select value from jsonb_array_elements(new.packet #> '{successorReview,authorizations}') loop
      v_action := v_authorization->>'affectedActionId';
      if not exists (
        select 1 from jsonb_array_elements(new.packet->'rules') r(value)
        cross join lateral jsonb_array_elements(r.value->'effects') e(value)
         where r.value->>'ruleId'=v_authorization->>'successorRuleId'
           and r.value->>'version'=v_authorization->>'successorRuleVersion'
           and e.value->>'kind'='include_candidate'
           and e.value->>'candidateId'=v_action) then
        raise exception 'engine-ruleset-successor-rule-invalid' using errcode='P0001';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

reset role;
alter function strandcue_private.engine_ruleset_admission_guard() owner to strandcue_mutator;
revoke all on function strandcue_private.engine_ruleset_admission_guard() from public,anon,authenticated;
grant execute on function strandcue_private.engine_ruleset_admission_guard() to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;
