# Website transport repair

Reviewed 2026-11-20 against the Cloudflare dashboard and public responses.

## Active serving path

- The `strandcue.co.za` Cloudflare zone is active with full DNS setup.
- The `strandcue-website` static-assets Worker is connected to route `strandcue.co.za/*` and was last manually deployed through Wrangler about one month ago. The separate `strandcue` Worker has no custom domain or route and does not serve this hostname.
- The zone's Universal SSL certificate for `strandcue.co.za` is active.
- In **SSL/TLS → Edge Certificates**, **Always Use HTTPS** is off. The HSTS control is available; the public HTTPS response does not contain `Strict-Transport-Security`.

## Baseline probes

- `http://strandcue.co.za/` returns HTTP 200 without a `Location` redirect.
- `https://strandcue.co.za/` returns HTTP 200, the expected HTML and existing CSP/nosniff/referrer/permissions/frame headers, but no HSTS header.
- `npm run check:website` passes all public routes and branded 404. `npm run check:website-transport` fails `http-redirect`, `http-redirect-host`, and `https-strict-transport-security`.

## Proposed production correction

1. On the active zone's **SSL/TLS → Edge Certificates** page, enable **Always Use HTTPS**. Confirm HTTP `/` and `/privacy` redirect to the same HTTPS host and path. If a loop or unexpected destination appears, turn this switch off and diagnose the route before proceeding.
2. Enable HSTS with `max-age=86400` (one day), without `includeSubDomains` or preload during this staged correction. Verify the header on HTTPS `/` and `/privacy`, and confirm existing security headers remain. The browser acknowledgement warns that HTTPS must remain supported for at least the advertised max-age; switching HSTS off does not instantly clear already cached policies.
3. Run `npm run check:website` and `npm run check:website-transport` from an external network and record the observed headers and status codes. Check certificate validity and the site content.

These are production Cloudflare settings. The plan/design approval is not authorization to change them; obtain explicit approval for the two named settings after this baseline is reviewed.

## Applied and verified

The maintainer approved both production changes on 2026-11-20. **Always Use HTTPS** is now on. Cloudflare's built-in HSTS form offered a one-month minimum, so it was left unsaved. Instead, an active Response Header Transform Rule named **Staged HSTS for StrandCue website** matches `https://strandcue.co.za/*` and sets `Strict-Transport-Security: max-age=86400`. It does not include subdomains or preload.

After deployment, HTTP `/` and `/privacy` returned 301 redirects to the same HTTPS host and paths. `npm run check:website` passed all public routes and the branded 404. `npm run check:website-transport` passed all three checks, including the exact one-day HSTS value. To roll back the header, disable the named response rule in Cloudflare Rules; browsers that already received it may retain the policy for up to one day. To roll back the redirect, turn off **Always Use HTTPS** under SSL/TLS → Edge Certificates.
