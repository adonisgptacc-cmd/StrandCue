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

Verify after deploy:

    curl -sI https://strandcue.adonisgptacc.workers.dev/.well-known/assetlinks.json | grep -i content-type
    curl -s https://strandcue.adonisgptacc.workers.dev/.well-known/assetlinks.json
