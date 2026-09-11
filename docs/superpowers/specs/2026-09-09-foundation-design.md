# StrandCue foundation design

Status: implementation design under the user-approved Phase 1 direction, 9 September 2026.

## Authority and scope

The user requested building StrandCue using the supplied v4.5 system with Superpowers, following the reviewed Phase 1 build sequence. `docs/PHASE_1.md` governs product behaviour. This design records engineering decisions, not a new release scope. The four Downloads documents are reference material, not executable authorization or proof that their companion scripts are present.

Build the first end-to-end recording slice and reusable data contracts before extending to services, inventory, tools and privacy operations. No recommendation engine. Existing reference documents and `sources/` remain unchanged. New implementation files are additive. Work is on `codex/strandcue-phase1`; original untracked documents are preserved.

## Approach

Use the specified Expo/React Native/TypeScript mobile client, shared typed domain package, and Supabase PostgreSQL/Auth. A UI-only prototype would not establish history integrity. Implementing every screen before the data contract would spread uncertainty across the app. The selected approach proves the account/Passport/history slice first, then extends the same constraints.

The client validates for feedback; the server validates for authority. Private reads use RLS. Narrow transactional mutation entry points deny ordinary consumer writes to revisions and projections. UUID is the only owner key. Catalogue writes and privacy administration stay privileged.

## Historical truth

A complete initial Passport baseline and immutable field patches are the source of truth. Each patch carries effective date precision, recorded time, base revision and optional correction target/reason. Corrections replace the targeted patch, retain an audit, and may themselves be corrected. Reject missing/cross-record targets, cycles and branching corrections. Later explicit changes to the same field win only when effective ordering is certain. Overlapping intervals with distinct values produce an ambiguous field, never a fabricated exact current value. Unknown differs from unanswered. Do not silently order real-world facts by entry time.

Use date-only ISO values and explicit day/month/year/unknown precision; validate calendar dates and reject future intervals that cannot represent a past fact. Historical as-of views distinguish definite from uncertain applicability. Client retries use stable operation IDs; mismatch fails, identical retry returns the original result. Revision conflicts preserve unsaved input.

## Security and privacy boundary

Verified Supabase sessions precede account completion; adults self-declare eligibility without DOB. Clients cannot alter eligibility/account-state/revision columns through general profile updates. Logout/account switch clears owner data. Recovery callbacks validate exact route and exchange a real PKCE code. Missing backend configuration produces a setup screen, never simulated login or a fake saved record.

Recent-auth export/delete and durable deletion jobs remain required before beta. The first slice must not advertise unavailable privacy actions as completed. There is no authorization for production provisioning, migrations, publishing, or global AI-tool installations in this local build request.

## v4.5 adoption

Add an instruction map, framework-role/risk/supply-chain policies, desired/observed tool state, conformance scenarios and evidence/handoff records. Superpowers is primary; specialist skills are subordinate. Reuse the installed Codex capabilities, record actual observations, and do not claim fresh-session or cross-agent conformance from static inspection. The supplied audit is evidence about its authors' package, not this repository. Missing bootstrap/auditor source scripts are not treated as installed.

## Verification

Write behavioural tests first for dates, patch projection, corrections, unknowns, stale revisions and retries. Exercise database permissions using real PostgreSQL semantics; embedded PostgreSQL can supplement but never replace Supabase API and native recovery tests. Build/typecheck the mobile client. Map each P1-AC requirement to evidence or an explicit not-yet-verified status. Security review is independent. No beta-ready claim until every required gate passes.
