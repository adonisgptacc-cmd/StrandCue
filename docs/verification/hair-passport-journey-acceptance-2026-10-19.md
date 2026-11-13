# Hair Passport journey — Increment 1 device acceptance (2026-10-19)

> Honest status: **1 of 11 runnable scenarios run** (device boot/launch).
> All account-dependent journey scenarios are **BLOCKED** — no isolated
> backend, no provisioned synthetic accounts, and hosted production is out of
> bounds for this programme. No account-dependent action was attempted and no
> scenario PASS is claimed beyond the launch row below.

## What ran (2026-10-19, Africa/Johannesburg times)

### Scenario 0 — fresh install + first launch (boot level)

- **Result: PASS (boot level only).**
- Device/emulator: AVD `strandcue-universal-api34-x86_64` (`emulator-5554`).
- Artifact: the receipt-verified signed universal APK
  `C:\scb\artifacts\strandcue-universal-alpha-task3-fixed.apk`
  (SHA-256 `f68053fa3c9b6b78b7298b59a8574e6cceb3174444d16c8a423ec89eb06fd7d9`,
  source receipt binds application source commit
  `d8c2818a7fac0e996910a5a33d6784875800993b`).
- **Honesty flag: this artifact predates Increment 1's own source.** It
  contains Increment-3-era code; the Task 1.2/1.3 changes are NOT in it. The
  scenario verifies only the install/launch/process-stability layer of the
  same pipeline, not the new measurement or overview screens.
- Timing: uninstall + fresh install completed 16:29:04; cold start via the
  launcher intent; UI dump at +12 s showed the expected signed-in-state-free
  render: "strandcue", "YOUR HAIR RECORD", "DEVELOPMENT BUILD",
  "Your hair, as you know it." and "Connect your development environment"
  (the documented no-backend state: proof that no account or record exists).
- Process stability: `za.co.strandcue.app` still alive (u0_a193, pid 7960)
  17 s after launch; no `AndroidRuntime:E` entry for the package in logcat.
- Screenshots: `strandcue-increment1-launch-01.png` and `-02.png` under the
  session temp store (local only, not committed; byte-identical static
  screen, SHA-256 `918aa6af00c00c349d0844e63f55f1a1bbc16ad82b58aad4d0f2580bde25bc82`).
  Redaction review: the rendered screen contains brand copy only — no
  usernames, emails, tokens or personal data — so no pixel redaction was
  required.

## Why the remaining scenarios are BLOCKED

Grounds probed 2026-10-19 (all real checks, not assumptions):

- Backend: TCP probes to 127.0.0.1 {54321, 54322, 3000, 8080, 8910} all
  closed; Docker daemon not running (`dockerDesktopLinuxEngine` pipe absent);
  no `STRANDCUE_SUPABASE_API_TEST`/URL/key environment configured. The
  app-local "Connect your development environment" state is itself the
  client-side confirmation that no backend is configured.
- Hosted Supabase is forbidden for this programme; no synthetic account,
  hosted record or reserved fixture was touched.
- Fresh-artifact build from the Increment-1 source: the Android local
  preflight **PASSes** for this tree (`ANDROID-LOCAL-PASS source=d8c2818…
  evidenceHead=757d344…  node=24 java=17 sdk=present`), so the pipeline is
  available. It was not exercised for acceptance because a fresh build's
  only backend-free scenario is the same launch render as Scenario 0, an
  equivalent offline Gradle release attempt failed on 2026-10-18 (CMake/
  Reanimated Windows-path failures, `docs/verification/security-audit-launch-decision-2026-10-18.md`),
  and every account-dependent scenario would remain blocked regardless.
- Unprovenanced same-day device session: `C:\scb\artifacts` holds a same-day
  (10:29–10:51) acceptance-session artifact
  `strandcue-acceptance-test-universal-alpha.apk` (SHA-256
  `e7b14cb67be0222ad79bed47d3d8a2e791d4ab60d6ff14c64cd4c969cbb5786d`,
  byte-size identical to the receipted artifact but a different hash) **with
  no source receipt**, plus owner A/B window dumps from an undocumented run.
  That session was displaced by the Scenario 0 reinstall; its results are
  NOT claimed as Increment-1 evidence because its artifact provenance cannot
  be verified from anything recorded here.

## Journey scenarios — all BLOCKED

| # | Scenario | Blocking reason |
|---|----------|-----------------|
| 1 | Signup → email confirm on device → sign-in | Needs email provider + real auth backend; none permitted or running |
| 2 | Create Hair Passport (first record) | Needs a signed-in owner on an isolated backend |
| 3 | Fill structured facts (pattern, diameter, density, porosity, goals, concerns) | ditto |
| 4 | Record a structured length (cm/in, precision, measured date) + 300 cm / future-date refusals | ditto |
| 5 | Legacy centimetre entry retirement in the same save (notice + `lengthCm: null`) | ditto |
| 6 | My Hair overview: current facts vs dated history separation | ditto |
| 7 | Goal-gap sections render (no percentage/score) | ditto |
| 8 | Mixed legacy+measurement projection shows one current length + one earlier-entry note | ditto |
| 9 | Today check-in renders and provably writes nothing to the Passport | ditto |
| 10 | Offline: draft saved locally, retried safely after reload | ditto |
| 11 | Two owners on one device cannot see or mutate each other's passport | ditto |

For each row the code-level behaviour is covered by the automated suites
(domain 40, database 46, editor 33, overview 6, completeness 10 — see the
task reports); the device run would add only the platform-integration layer,
which cannot be executed without the missing backend/accounts.
