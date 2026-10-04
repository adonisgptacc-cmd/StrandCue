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
