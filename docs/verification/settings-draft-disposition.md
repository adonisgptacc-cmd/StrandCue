# Settings draft disposition — 24 September 2026

Three unrouted milestone screens (`AccountInfoScreen.tsx`,
`CosmeticModeScreen.tsx` and `SupportScreen.tsx`) were removed on 4 October 2026.
Import/route searches and call-graph traces confirmed no active consumer.
Their prior `// @ts-nocheck` markers concealed imports of nonexistent hooks.

Each depends on tables or columns that do not exist in the trusted replay
chain and were deliberately not rebuilt:

- `AccountInfoScreen` reads `user_sessions` and writes `analytics_consent` /
  `cosmetic_mode` profile columns. No session table exists (Supabase Auth
  owns sessions; stale JWTs are denied by the existing active-profile
  predicates), and consent columns belong to a future settings pass.
- `CosmeticModeScreen` toggles a `cosmetic_mode` profile flag with no
  product definition or acceptance row behind it.
- `SupportScreen` writes `support_requests`, a table with no schema,
  retention policy or support owner behind it.

Their Git history remains available for review. They are not treated as
implemented. The Settings journey now
routes the trusted surfaces instead: username change, data export and
account deletion. Email/password changes stay in Supabase Auth by design
(P1-AUTH-01: credentials are never duplicated into application tables).
The archived `recent_auth_events` parallel table was superseded by the
JWT-`amr` helper (`recent_auth`), which cannot drift from the session.
