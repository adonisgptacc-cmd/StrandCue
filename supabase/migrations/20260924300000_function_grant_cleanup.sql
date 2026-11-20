-- Function grant cleanup — closes PUBLIC default execute grants missed by
-- earlier migrations. PostgreSQL grants EXECUTE to PUBLIC on every new
-- function; the shelf/tools list cores and recent_auth were granted to
-- authenticated and mutator without first revoking that default, leaving
-- anonymous callers with execute rights they must not have. The cores all
-- raise authentication-required without a JWT, so nothing was exploitable;
-- this restores least privilege. No behavior change for legitimate callers.

revoke all on function strandcue_private.list_user_products_core(integer, jsonb) from public, anon;
revoke all on function strandcue_private.list_user_tools_core(integer, jsonb) from public, anon;
revoke all on function strandcue_private.recent_auth(integer) from public, anon;
