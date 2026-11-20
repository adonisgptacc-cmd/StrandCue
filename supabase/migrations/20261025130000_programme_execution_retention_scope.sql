-- Scope active-programme execution retention to evidence that could contribute.
--
-- The original hold kept every classified wash/application execution for an
-- owner who had any active programme. That silently overrode the documented
-- 90/30-day retention windows for unrelated and pre-programme history.
-- This replacement keeps only temporally eligible washes, exact-product
-- applications, and malformed confirmed timestamps that the programme reader
-- itself treats as blocking evidence. Completed/abandoned programmes rely on
-- their immutable snapshot and therefore hold nothing.

create or replace function strandcue_private.programme_execution_held(p_user uuid, p_execution uuid)
returns boolean language sql stable set search_path = pg_catalog, pg_temp as $$
  with candidate_steps as (
    select c.kind,
           c.run_id,
           e.recommendation_run_id,
           s.step,
           strandcue_private.programme_parse_instant(s.step ->> 'confirmedAt') confirmed_at
      from public.protocol_executions e
      join strandcue_private.execution_step_care c
        on c.user_id = e.user_id and c.execution_id = e.execution_id
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(e.execution -> 'steps') = 'array'
             then e.execution -> 'steps' else '[]'::jsonb end) s(step)
     where e.user_id = p_user
       and e.execution_id = p_execution
       and c.kind in ('wash', 'application')
       and s.step ->> 'stepId' = c.step_id
       and s.step ->> 'state' = 'confirmed'
       and jsonb_typeof(s.step -> 'confirmedAt') = 'string'
  ), active_programmes as (
    select p.*
      from public.treatment_programmes p
     where p.user_id = p_user and p.status = 'active'
  )
  select exists (
    select 1
      from candidate_steps c
     where
       -- The canonical reader blocks on a stale classification binding or an
       -- invalid confirmed instant. Retain that ambiguous source until the
       -- active programme closes instead of purging evidence silently.
       ((c.run_id is distinct from c.recommendation_run_id or c.confirmed_at is null)
        and exists (select 1 from active_programmes))
       or exists (
         select 1
           from active_programmes p
          where c.confirmed_at is not null
            and strandcue_private.programme_start_order(
                  jsonb_build_object('precision', 'exact', 'value', strandcue_private.programme_iso(c.confirmed_at)),
                  p.start_precision, p.start_value) = 'allowed'
            and (
              c.kind = 'wash'
              or (c.kind = 'application'
                  and c.step #>> '{planned,productId}' = p.product_id::text
                  and c.step #>> '{planned,productVersionId}' = p.product_version_id::text)
            )
       )
  )
$$;
