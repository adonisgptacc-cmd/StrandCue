# Increment 2 local Android owner journey — 21 October 2026

## Decision

The Increment 2 journey passes on the API 34 x86_64 emulator against the
disposable local Supabase stack. This closes the local emulator acceptance row.
It does not close launch acceptance: hosted isolation, a physical Android
device, TalkBack and the alpha/release signing identity remain unproven.

## Test boundary

- App source: `2e18aba`.
- Artifact: internal emulator APK, SHA-256 recorded outside Git in the local
  receipt directory.
- Signature: Android debug certificate. This is not the missing alpha identity
  and is not a release artifact.
- Backend: loopback-only local Supabase (real PostgreSQL 17, PostgREST and Auth),
  with the six Increment 2 migrations applied locally in order.
- Network deviation: cleartext permitted only for the emulator alias
  `10.0.2.2`; the configuration was generated outside Git.
- Device: clean API 34 x86_64 emulator with acceleration.
- Automation: adb/uiautomator driver. This is not TalkBack evidence.
- Production Supabase and Cloudflare: untouched.

## Journey results

| Journey | Result | Evidence observed |
|---|---|---|
| Owner A sign-in and profile | PASS | Signed in through local Auth and completed profile setup through the app UI |
| Process restart | PASS | Force-stop and relaunch retained the authenticated session and owner data |
| Hair Passport | PASS | Recorded structured characteristics, goals, concerns and length; added a later concern; history survived restart |
| Shelf add and edit | PASS | Added a manual conditioner with owner facts, changed availability, and retained the record |
| Shelf correction | PASS | Corrected the product name with a reason; immutable history showed the original, change and correction |
| Product catalogue search and detail | PASS | Found the synthetic exact version; draft directions, claims, evidence and ingredients remained unavailable |
| Product match | PASS | Explicit confirmation matched the version while preserving manual identity and history |
| My Tools add and edit | PASS | Added a dryer with wattage, attachment and heat method; unknown temperature stayed `Not recorded`; condition changed |
| Tool correction | PASS | Corrected the model with a reason and retained immutable history |
| Tool catalogue search, detail and match | PASS | Explicitly matched the synthetic tool; unpublished capabilities and claims remained unavailable; owner facts stayed separate |
| Export | PASS | Recent authentication was required; completed JSON export was owner-bound and contained Shelf and Tools without the foreign owner or draft canary |
| Owner switch | PASS | Owner B saw empty Hair Passport, Shelf and Tools; no Owner A frame or fact was observed |
| Offline/reconnect | PASS | Shelf and Tools showed a plain reload state offline and restored Owner A data after reconnect and reload |
| Archive | PASS | Owner A archived the product and tool; the database recorded one archive in each append-only lineage |
| Cleanup | PASS | Two synthetic owners, both catalogue fixtures and export jobs were removed; zero remained |

Screenshots and raw local logs remain outside Git in `C:\scb\t25-evidence`.
They contain test-only data and are not release assets.

## Isolation and concurrency

- Live local harness: 42/42 scenarios passed; strict JSON and domain-schema
  checks covered Passport, Shelf, My Tools, both catalogues, direct-write
  refusal, anonymous access, export and idempotency.
- Table-level summary: 4 passed and 6 blocked. The blocked checks require
  recommendation/protocol fixtures, which were not invented for this task.
- Two-session real-PostgreSQL suite: 7/7 passed. Identical retries converged,
  conflicting payloads sharing an operation id conflicted, and concurrent
  Shelf and Tool changes landed exactly once.
- Hosted target: BLOCKED. No isolated hosted project was configured or proven.

## Verification

| Gate | Result |
|---|---|
| `npm run check:runtime` | PASS, Node 24.19.0 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, zero warnings |
| `npm run test:coverage -- --maxWorkers=4` | PASS: 168 files passed, 4 skipped; 3211 tests passed, 18 skipped; 95.95 / 90.16 / 98.46 / 97.9 |
| `npm run export:web` | PASS |
| `npm run audit:control-plane` | PASS |
| `npm run audit:dependencies` | **HOLD**, exit 1: 0 critical, 20 high, 11 moderate; `ADVISORY-UNEXCEPTED`, `RUNNER-REVIEW-DRIFT` |
| `git diff --check` | clean |

## Remaining launch blockers

- Prove the same isolation against an explicitly identified disposable hosted
  Supabase project.
- Recover or replace the alpha signing identity, then build and verify the
  intended release-signed artifact.
- Run the journey on a physical Android device.
- Run and record TalkBack acceptance separately.
- Resolve or formally review the dependency-policy HOLD.
- Complete the pending Banana Human A/B review before publishing product
  directions, capabilities, claims or evidence.
