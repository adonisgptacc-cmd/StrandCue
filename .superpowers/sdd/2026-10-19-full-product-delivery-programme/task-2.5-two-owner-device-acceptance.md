# Task 2.5 — two-owner isolation and local Android acceptance

Date: 21 October 2026. Starting HEAD: `1c9fff7`. Branch:
`codex/full-product-integration`. Node v24.19.0.

## Outcome

Task 2.5 is complete for the local test boundary. The live isolation harness
now runs 42 owner-bound scenarios against real Postgres/PostgREST/Auth, the
two-session concurrency suite proves seven replay and conflict cases, and the
Increment 2 UI journey was exercised on an API 34 x86_64 emulator. All
synthetic users and fixtures were removed afterwards.

Launch remains HOLD. There is no proven isolated hosted target, the tested APK
is debug-signed rather than alpha/release-signed, and physical-device and
TalkBack testing were not run.

## Commits entering the completion round

- `2e18aba` — live two-owner isolation harness and real-PostgreSQL concurrency
  coverage.
- `c6edb08` — internal APK verifier profile, adb/uiautomator driver and local
  synthetic-owner provisioning tooling.
- `1883a71` — select the exact enabled editable field in the Android driver
  and pin the duplicate clickable-label case.

## Harness behaviour

The target verifier fails before any request unless the target is either a
loopback local stack or a hosted project with an explicit isolated label,
matching project reference and non-empty production deny-list. Responses are
parsed as strict JSON and validated with domain schemas. Foreign-owner reads
must return empty data and foreign mutations must be indistinguishable from a
random missing identifier. Scenarios requiring an unavailable privileged
fixture are BLOCKED rather than passed.

The local live run passed 42/42 scenarios and cleaned up its fixtures. The
table-level summary remained 4 PASS / 6 BLOCKED because recommendation and
protocol fixtures do not exist and were not invented. The separately opted-in
real-PostgreSQL concurrency suite passed 7/7.

## Android artifact and environment

The APK was built from a clean archive of `2e18aba`. Its internal receipt and
SHA-256 are stored outside Git in `C:\scb\t25-artifacts`. The internal verifier
accepted the source marker, package, ABI and debug signer; the unchanged
release verifier correctly rejects it. The alpha signing key was not present
on the machine.

The first build was superseded because a shared Metro cache produced a stale
bundle without backend configuration. The replacement used an isolated Metro
temporary directory. A loopback-only cleartext network configuration was
generated outside Git for `10.0.2.2`; no cleartext exception was committed.
The installed artifact launched without a fatal logcat event.

## Device journeys

Owner A completed profile setup and a structured Hair Passport, added a later
concern, and retained the session and history through force-stop/relaunch.
Owner A then completed the Shelf lifecycle: add, edit, identity correction,
catalogue search, secured detail, explicit match, history and archive. The
draft product fixture exposed identity only; directions, claims, evidence and
ingredients stayed unavailable.

Owner A completed the equivalent My Tools lifecycle. The screen retained
`2000 W` while showing temperature as not recorded, proving the app did not
infer temperature from wattage. The draft tool fixture exposed no capability,
claim or evidence. Manual owner facts stayed separate after the explicit
match.

Export first required recent authentication. After reauthentication the JSON
export completed. An aggregate check confirmed Owner A only, no Owner B
identifier, no draft canary, and the expected Shelf and Tool sections. No
export payload or credential was printed into Git evidence.

After sign-out and Owner B sign-in, Hair Passport, Shelf and Tools were empty.
No Owner A frame was observed. Returning to Owner A restored the expected
records. With emulator networking disabled, Shelf and Tools showed a plain
failure/reload state; reconnect plus Reload restored the owner data.

The final database proof found five revisions for each Owner A record (add,
edit, correction, match and archive). Cleanup removed two synthetic owners,
both catalogue fixtures and all export jobs. The credential file was deleted.

## Driver defect fixed during acceptance

The `type` command could select a static label when the label and its text input
shared an accessible name, or type into the previously focused field while the
keyboard covered the next input. The fix adds `findEditableExact`, restricts
typing to an enabled `EditText`, and dismisses the keyboard after entry. The
regression test contains duplicate label/input names. RED was captured when
the exported helper did not exist; GREEN is 4/4.

## Verification

| Gate | Result |
|---|---|
| Runtime | PASS, Node 24.19.0 |
| Typecheck | PASS |
| Lint | PASS, zero warnings |
| Focused tooling/isolation run | PASS: 44 passed, 7 skipped in the generic run; concurrency separately PASS 7/7 with opt-in environment |
| Live local isolation | PASS: 42/42 scenarios; cleanup DONE; table summary 4 PASS / 6 BLOCKED |
| Full coverage | PASS: 168 files passed, 4 skipped; 3211 tests passed, 18 skipped; 95.95 / 90.16 / 98.46 / 97.9 |
| Web export | PASS |
| Control-plane audit | PASS |
| Dependency audit | **HOLD**, exit 1: 0 critical, 20 high, 11 moderate, 4 reviewed; `ADVISORY-UNEXCEPTED`, `RUNNER-REVIEW-DRIFT` |
| Diff check | clean |

## Honest limitations

- The device result is an emulator result, not a physical-device result.
- uiautomator accessibility nodes are not TalkBack evidence.
- The artifact is internal and debug-signed, not an alpha or release build.
- The backend is local. No hosted isolation result is claimed.
- Six harness table checks remain BLOCKED because recommendation/protocol
  fixtures were outside this task and were not fabricated.
- The dependency audit remains HOLD and must not be reported as a pass.
- Screenshots and raw logs remain outside Git; no personal or production data
  was used.

## External actions

Nothing was pushed, merged, deployed or applied to hosted Supabase or
Cloudflare. No product content was published. The Banana Human A/B packet was
not changed. Increment 3 was not started.
