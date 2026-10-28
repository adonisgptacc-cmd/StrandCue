-- Locate one currently executable packet without exposing rules or review metadata.
grant strandcue_mutator to current_user with set true;
grant create on schema public to strandcue_mutator;

create function public.get_current_heat_coach_publication()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_count integer;
  v_id uuid;
  v_digest text;
begin
  perform strandcue_private.heat_require_owner();
  select count(*), min(candidate.id::text)::uuid, min(candidate.content_digest)
    into v_count, v_id, v_digest
    from (
      select p.id, p.content_digest
        from strandcue_private.heat_rule_publications p
       where p.state = 'published'
         and strandcue_private.heat_publication_review_valid(
           p.id, p.content_digest, p.rule, p.review_envelope, statement_timestamp())
       limit 2
    ) candidate;
  if v_count <> 1 then return null; end if;
  return jsonb_build_object('publicationId', v_id, 'publicationDigest', v_digest);
end;
$$;

alter function public.get_current_heat_coach_publication() owner to strandcue_mutator;
revoke all on function public.get_current_heat_coach_publication() from public, anon, authenticated;
grant execute on function public.get_current_heat_coach_publication() to authenticated;
revoke create on schema public from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;
