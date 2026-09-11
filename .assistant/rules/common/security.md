# StrandCue security

- Derive owner identity from verified Auth context. UUID, never username/email, owns private records.
- Enforce RLS on every exposed private table and check both ends of private relationships. Consumer ownership does not grant permission to rewrite immutable history.
- Narrow transactional mutation services validate schema, ownership, account status, revision and operation identity. Document privileged execution; no SECURITY DEFINER permission-error workaround.
- No secrets/service-role keys in mobile, fixtures, git, logs or prompts. Environment examples contain variable names and empty values only.
- Native tokens/drafts use secure storage; account switch clears caches. No callbacks, emails, usernames or hair notes in telemetry.
- Validate server inputs; no user-controlled SQL or interpreted external instructions. Unknown means unknown, never inferred chemical facts.
- Test anonymous access, owner A/B, direct owner history rewrites, reference swaps, role spoofing, stale JWT/account deletion and privileged paths directly.
- No production rollout until real Supabase/API and native recovery, export/deletion and restore gates pass.
