# Engine ruleset hash trust boundary

## Intent

Only an authenticated, independently approved ruleset whose engine content hash matches its actual content may be published or loaded as an authoritative parent. The database already binds A/B approvals to an immutable packet digest, but it does not recompute the engine's canonical content hash.

## Goals

- Recompute the hash with the engine's existing `canonicalRulesetContentHash` implementation, so the server does not duplicate a serialization algorithm.
- Make verification a required database gate before publication and privileged loading.
- Keep author and reviewer identity checks, exact packet digest binding, parent provenance, and immutable publication records intact.
- Reject malformed packets and hash mismatches without changing draft state or creating a verification record.
- Test the trusted route with local PostgreSQL and the Edge Function handler.

## Non-goals

- Do not change ranking policy or add scoring inputs.
- Do not publish production content, call hosted Supabase, deploy the function, or integrate the isolated branch.
- Do not make the pure engine depend on database or network services.
- Do not treat client-supplied hashes or reviewer approval as proof that a hash matches content.

## Approaches

1. **Duplicate the engine canonical JSON algorithm in PostgreSQL.** This would make publication self-contained, but creates two implementations of JSON number and string serialization that can diverge.
2. **Trusted Edge verification plus a database verification ledger (selected).** An authenticated Edge Function reads only the caller's exact draft, parses it with the engine schema, recomputes the hash with the engine package, and asks a service-role-only RPC to record that verification. Publication and privileged load require the immutable verification row for the same packet digest and content hash. This reuses the source of truth and keeps database writes behind a narrow internal RPC.
3. **Leave publication permissive and validate only at a future evaluator call.** The graph shows no generic database-loader-to-engine call path today, so this would leave an unverified published record and parent reference in circulation.

## Design

Add a private, append-only `engine_ruleset_hash_verifications` table keyed by publication ID and packet digest. An owner-authorized read RPC returns the requested draft packet only when the authenticated user authored it and the supplied packet digest still matches. A service-role-only write RPC records the engine-computed hash and verification time after rechecking the draft identity and digest.

The Edge Function accepts only a publication UUID and packet digest. It authenticates the bearer token, reads the caller-owned draft through the owner RPC, requires strict `CompiledRulesetSchema` parsing, recomputes `canonicalRulesetContentHash`, and rejects if it differs from `packet.ref.contentHash`. On success it invokes the service-only verification RPC. It never accepts packet contents or a claimed verified hash from the client.

The publication trigger requires a verification row matching the immutable publication ID, packet digest, and content hash before transition to `published`. The privileged loader requires the same row. Parent lookup continues to resolve only published or withdrawn records that passed this gate. Existing A/B approval remains required and remains bound to the same packet digest.

## Constraints and anti-goals

- Edge code uses the installed Supabase client and imports the engine's existing schema/hash implementation.
- Service credentials stay in Edge Function environment variables and never enter request data, logs, or responses.
- The service-only RPC must reject all roles except `service_role`; authenticated users must not be able to write verification rows.
- The verification record is immutable. Changing packet, digest, or claimed hash requires a new publication draft.
- All local verification uses Docker/local Supabase only.

## Acceptance

- Bad claimed hashes, malformed schemas, wrong owners, stale digests, and non-drafts do not create verification rows.
- Correct drafts can be verified, but still cannot publish without distinct A/B approvals.
- Correctly approved drafts cannot publish or load without the matching server verification record.
- Packet mutation after verification is rejected by the existing immutable digest rules.
- Real local PostgreSQL proves both successful verification/publication and rejection of unverified or mismatched drafts.
- Independent review finds no client path to forge a verification row or bypass the publication/load gates.

## Remaining to the builder

Use the project's Edge Function request/response and environment patterns. Keep the handler dependency-injected for tests; production wiring must authenticate with the user's bearer token and use the service key only for the internal verification write.
