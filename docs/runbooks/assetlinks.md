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
