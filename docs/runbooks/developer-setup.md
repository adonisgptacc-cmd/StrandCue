# Developer setup and verification

Run the [README](../../README.md) setup from the repository root with Node 24.x and `npm ci`. Docker Desktop must run Linux containers. `npx supabase start` can download container images and therefore needs network access on first use. `npx supabase db reset --local` replays every active migration and destroys local data; never use remote reset flags as part of onboarding. No hosted project or Supabase login is needed for local work.

## Browser and Android connectivity

Use `npm run web --workspace @strandcue/mobile -- --host localhost` and open the localhost URL printed by Metro, normally `http://localhost:8081`. Windows may bind IPv6 localhost while `127.0.0.1` refuses the connection. The configured browser auth redirect uses `127.0.0.1`; web sessions use preview storage and are not proof of email callbacks, native persistence or recovery handling. Supabase's local email inbox is `http://127.0.0.1:54324`; confirm synthetic accounts there.

For an Android emulator, the host API is normally `http://10.0.2.2:54321`. For a USB-connected physical device, `adb reverse tcp:54321 tcp:54321` lets the app use `http://127.0.0.1:54321`. Confirm `adb devices` lists the intended device. For a LAN device, use the development machine's LAN IP and restrict firewall access to the trusted network. Never expose a development database to the internet. Update the public API URL in `.env` for the chosen target and rebuild when using a packaged app: Expo public variables are embedded at build time.

`npm run mobile` starts Metro. Expo Go can provide a limited preview when its installed SDK matches the repository; custom `strandcue://` recovery callbacks and native acceptance require an installed app with package `za.co.strandcue.app`. The EAS preview profile produces an installable APK; its `build:android:preview` script requires EAS CLI, an authenticated Expo account, and a separately authorized cloud build. It is not a prerequisite for local browser setup. The development profile requests a development client; verify its dependencies before relying on that profile. Do not assume Metro alone produces an APK.

Native directories are generated from `apps/mobile/app.json` and Expo plugins rather than checked in. Do not hand-edit generated native files as the lasting source of a change. Local Android building requires a compatible Java/Android SDK toolchain and validation separate from the JavaScript checks.

## Live API verification

Default `npm test` runs embedded database tests and skips live API checks. To enable the local API suite in PowerShell, use keys from `npx supabase status` and a disposable local database:

```powershell
$env:STRANDCUE_SUPABASE_API_TEST = '1'
$env:STRANDCUE_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:STRANDCUE_SUPABASE_PUBLISHABLE_KEY = '<local public key>'
$env:STRANDCUE_SUPABASE_SECRET_KEY = '<local secret/service-role key>'
npm test -- tests/database/supabase-api.test.ts
Remove-Item Env:STRANDCUE_SUPABASE_API_TEST, Env:STRANDCUE_SUPABASE_URL, Env:STRANDCUE_SUPABASE_PUBLISHABLE_KEY, Env:STRANDCUE_SUPABASE_SECRET_KEY
```

The secret is exclusively for this Node test process; never place it in the mobile `.env`, commit it, or paste it into evidence. Inspect test output and skipped counts; a successful default suite does not establish live API isolation.

The API suite refuses hosted targets, including hosted staging. It accepts only
`http://127.0.0.1:<explicit-port>` or `http://[::1]:<explicit-port>` without
credentials, paths, query strings or fragments. Every request is confined to
that origin and refuses redirects. Use only a disposable local database with
the complete migration chain and local email confirmation enabled; the suite
creates and deletes synthetic Auth users and runs deletion workers. Never
forward this endpoint to production. A staging rehearsal requires a separately
approved disposable instance and a loopback tunnel; setting an environment
variable alone does not authorize that rehearsal.

The suite covers real email confirmation/password sign-in, owner-scoped table
reads, grants and direct-write denial, recommendation replay/conflicts and
executable-status rejection, foreign/missing run equivalence, untrusted decision
rejection, removed PostgREST RPC signatures, and Auth deletion/refresh revocation.
It does not mint trusted executable decisions or prove successful trusted
execution transitions, native PKCE recovery, hosted settings, or two-session
Postgres locking. Those require separate evidence. Never remove the opt-in or
the target guard to make a skipped test appear green.

## Installed Expo evidence and critical coverage

`audit:control-plane` checks the installed mobile dependency versions against
the mobile manifest, root lockfile and installed Expo SDK mapping. The
`expo-compatible-sdk` claim records SHA-256 hashes of those inputs and the
installed version inventory. Missing, incompatible, stale or mismatched evidence
holds the gate; changing dates alone does not clear it. After a deliberate
dependency change, rerun `EXPO_OFFLINE=1 expo install --check` from `apps/mobile`
with the locked local CLI, inspect the offline warning and compatibility result,
then review the evidence from `collectExpoSdkEvidence` in
`scripts/expo-sdk-evidence.ts` and update the claim with a bounded review date.
This records agreement with the installed SDK, not latest upstream compatibility
or Android/device acceptance.

`npm run test:coverage` enforces 80% statements, branches, functions and lines
for each critical mobile auth/contracts, guidance, execution controller and
Today/execution surface module. The guidance glob also includes future modules.
The same per-file floors cover the lock-agreement and control-plane gates and
the local integration transport guard. Domain-wide coverage cannot compensate
for a critical module falling below its own floor.

## Native and release gates

After installing a test build, follow [the Maestro device runbook](maestro-device.md) and [the device acceptance matrix](../milestone7-device-matrix.md). The first two Maestro flows cover launch/validation and recovery navigation without submitting network requests. Signed-in flows need a configured backend and synthetic test account. Record device, build, backend, and outcomes for each run.

Cold/warm email recovery, HTTPS app-link verification, secure session persistence/revocation, export/deletion, cross-user API isolation, accessibility, and backup restoration need their own evidence. See [app links](assetlinks.md) and [backup restoration](backup-restore-rehearsal.md). Local tests and archived historical PASS entries do not certify current hosted settings or signed builds.

## Troubleshooting

- Runtime errors: check `node --version` is 24.x; reinstall using `npm ci`, not a lockfile-rewriting install.
- Port/container failures: inspect `npx supabase status` and Docker Desktop. Multiple worktrees use the same configured Supabase project ID and ports; coordinate rather than resetting another developer's database.
- Missing confirmation emails: inspect the local inbox and email confirmation/rate-limit settings. Local emails are captured, not delivered externally.
- Callback failures: check the exact configured redirect and that the target app can open it. A browser smoke check does not prove Android recovery.
- Missing environment: copy the example only when `.env` is absent, fill both public variables, and restart Metro. Never resolve an authorization error by substituting a service-role key.
