-- List core grants — repairs the pagination migration.
--
-- The shelf/tool list cores changed arity (1 arg to 2), so CREATE OR REPLACE
-- created new overloads instead of replacing: the new 2-arg cores carried
-- only PUBLIC default grants, and the grant cleanup then removed even those,
-- locking out legitimate callers (the final gate caught it). This grants the
-- 2-arg cores to authenticated and mutator, closes PUBLIC/anon, and drops
-- the orphaned 1-arg overloads that no wrapper calls anymore.

revoke all on function strandcue_private.list_user_products_core(integer, jsonb),
  strandcue_private.list_user_tools_core(integer, jsonb) from public, anon, authenticated;
grant execute on function strandcue_private.list_user_products_core(integer, jsonb),
  strandcue_private.list_user_tools_core(integer, jsonb) to authenticated, strandcue_mutator;

drop function if exists strandcue_private.list_user_products_core(integer);
drop function if exists strandcue_private.list_user_tools_core(integer);
