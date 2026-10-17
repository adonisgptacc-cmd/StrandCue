# assetlinks.json deploy

Serve this byte-exact at
https://strandcue.adonisgptacc.workers.dev/.well-known/assetlinks.json
with `Content-Type: application/json` and no redirects:

    [{
      "relation": ["delegate_permission/common.handle_all_urls"],
      "target": {
        "namespace": "android_app",
        "package_name": "za.co.strandcue.app",
        "sha256_cert_fingerprints": ["<RELEASE-KEYSTORE-SHA256>"]
      }
    }]

Fingerprint source: Play Console → Setup → App integrity → App signing key
(preferred — survives key rotation) or `keytool -list -v -keystore <release.keystore>`
for a locally-signed internal build.

This is a template, not deployment evidence. The signing fingerprint is still
unverified; never replace it with a made-up value or a debug key for a Play release.
Set `STRANDCUE_ANDROID_CERT_SHA256` to the reviewed certificate fingerprint and run:

    npm run check:release-links

The check requires the configured HTTPS host to serve a matching app/certificate
association as JSON, without redirects. Missing configuration, HTTP errors and
certificate mismatches block the check. `npm run verify:release-preflight` includes
this gate as well as full repository verification; it does not certify device
recovery, privacy workflows or authorize publication.

Verify after deploy:

    curl -sI https://strandcue.adonisgptacc.workers.dev/.well-known/assetlinks.json | grep -i content-type
    curl -s https://strandcue.adonisgptacc.workers.dev/.well-known/assetlinks.json

## Local APK distribution before Play Console

The user selected a locally signed APK on 4 October 2026. The generated public
certificate is recorded in `%LOCALAPPDATA%/StrandCue/private-signing/assetlinks.json` for the
real `za.co.strandcue.app` package. This JSON is a deployable association draft,
not proof that a matching APK or hosted endpoint has passed verification. An
acceptance build using another application ID does not match this association.

The private key and DPAPI-encrypted password are outside the repository under
`%LOCALAPPDATA%/StrandCue/private-signing/`. Preserve them: app updates must use
the same signing key. DPAPI ties password recovery to this Windows user; arrange
a protected, portable key/password backup before distributing an APK widely.
Never commit either credential. A different signing key cannot update the
existing debug installation in place without a signing-compatible migration.

When Play Console is available, add the actual **App signing key** SHA-256 from
App integrity to `sha256_cert_fingerprints`. Keep the local fingerprint while
locally signed installations remain supported. The Play upload key may differ
from the key signing installed apps; it is not a substitute. Verify each binary
against its own package and certificate, and rerun the hosted and device checks.

The tested association-only Worker is `scripts/cloudflare-worker.ts`. Configure
its public `ANDROID_CERT_SHA256` runtime variable with the certificate from the
local association file. Multiple supported certificates are comma-separated.
Missing or malformed configuration returns 503; GET/HEAD on the association path
returns JSON without redirect. Auth callback paths intentionally remain outside
this handler: preserve custom-scheme recovery until the existing HTTPS cutover
plan's hosted allowlist and native callback tests pass.

Production version `6a8cda08` was deployed with user approval on 4 October.
The live release-link gate passed against the local signing certificate;
HEAD returned HTTP 200, JSON content type, and an empty body. A matching
signed binary and device verification remain separate requirements.

## Compatibility window

The legacy custom-scheme callback `strandcue://auth/callback` stays accepted on
the inbound side during a bounded compatibility window. Expiry: the first release
cut after the HTTPS recovery path passes the device proof in the operator
checklist below.

Cutover owner: <UNASSIGNED - must be named before the first release cut>

The owner is a role that must be **assigned to a named accountable person**; this
repository currently records no release owner, so the field above is deliberately
blank rather than pointing at a record that names nobody. Removing the
compatibility branch (operator checklist step 5) is **blocked until that field
names an accountable person**: an unowned window must not be closed by default,
and an unowned window must not run indefinitely either.

Do not cut a release from the HTTPS-only tree before checklist steps 1-4 are recorded.
Until then a recovery link does not open the app, because the hosted allowlist
still rejects the HTTPS redirect.

The same expiry and the same required owner field appear as a code comment at the
compatibility branch in `apps/mobile/src/contracts.ts`.

## Fingerprint separation (Play App Signing)

The Play App Signing certificate fingerprint is the association source for a
Play-distributed build. The locally signed release certificate is for internal
builds only. The two are never interchangeable, and a made-up or debug
fingerprint must never be used for a Play release. Keep the
`<RELEASE-KEYSTORE-SHA256>` placeholder above; it is a template, not deployment
evidence, until the reviewed fingerprint is supplied.

## Operator checklist for the HTTPS cutover — NOT DONE

No step below has been performed from this repository. This repository changes
neither the Supabase dashboard nor Cloudflare; each step requires its own
authorization.

1. Supabase dashboard, project `bomudijjqmoommndhxib`: Authentication → URL
   Configuration → Redirect URLs, add exactly
   `https://strandcue.adonisgptacc.workers.dev/auth/callback`. The installed
   client appends `sb_flow_id` to the redirect
   (`experimental.appendPkceFlowIdToRedirects` in `apps/mobile/src/client.ts`), so
   Supabase receives
   `https://strandcue.adonisgptacc.workers.dev/auth/callback?sb_flow_id=...` and
   matches the allow list **including the query string**. Confirm the entry
   matches by tapping a real link (step 4); if it does not, add the documented
   wildcard form `https://strandcue.adonisgptacc.workers.dev/auth/callback**`
   instead. The wildcard stays on the app's own origin and the app-side
   predicate is unchanged either way.
2. Confirm the association is live with `npm run check:release-links` and a
   reviewed `STRANDCUE_ANDROID_CERT_SHA256`.
3. Rebuild the signed Android build and check that
   `adb shell pm get-app-links za.co.strandcue.app` reports `verified`.
4. Tap a real recovery link on the device and record the result in
   `docs/verification/device-evidence.md`.
5. Only then remove the compatibility branch.

