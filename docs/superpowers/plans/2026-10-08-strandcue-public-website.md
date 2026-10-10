# StrandCue Public Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, verify, and publish the StrandCue public website at `https://strandcue.co.za` with stable privacy, support, terms, and account-deletion resources for Google Play.

**Architecture:** Add a framework-free static site under `website/public` and deploy it as a new Cloudflare Worker Static Assets project named `strandcue-website`. Repository tests enforce page contracts, policy copy, metadata, security headers, and route completeness; the existing App Links and scheduled deletion Workers remain independent and receive regression checks before and after deployment.

**Tech Stack:** Semantic HTML5, CSS, SVG favicon, Cloudflare Workers Static Assets, Wrangler 4.148.0, Vitest 5, Node.js 24.

**Spec:** `docs/superpowers/specs/2026-10-08-strandcue-public-website-design.md`

## Global Constraints

- Operator text is exactly `Common Sense Inc.` and public contact is exactly `support@strandcue.co.za`.
- Canonical origin is `https://strandcue.co.za`; public routes are `/`, `/privacy`, `/delete-account`, `/support`, and `/terms`.
- Use the app palette: paper `#F7F5EF`, ink `#253A30`, sage `#E8EDDF`, accent `#667D49`, error `#8C3B30`.
- Do not add analytics, advertising, cookies, forms, remote fonts, remote scripts, accounts, databases, or third-party embeds.
- Do not claim medical advice, diagnosis, treatment recommendations, legal certification, fixed support times, data residency, or unsupported deletion timing.
- Do not edit, replace, route over, or delete the existing `strandcue` and `strandcue-account-deletion` Workers.
- Keep the Play download action unavailable until a real Play testing or production URL exists.
- All visible text must work at 200% zoom and a 320 CSS-pixel viewport without horizontal scrolling.

## Review Focus

- Unknown and extensionless paths: expected public routes resolve, while an unknown navigation returns the branded 404 page rather than the home page.
- Narrow viewports and long policy text: content wraps without horizontal overflow and navigation remains usable without JavaScript.
- Email request safety: deletion mail links contain only the fixed recipient and subject; no account data or credential prompt appears in a URL.
- Indexing boundaries: canonical metadata and sitemap use the apex domain while temporary `workers.dev` versions receive `X-Robots-Tag: noindex`.
- Infrastructure isolation: deployment leaves the Android association JSON, recovery hostname, and private scheduled Worker unchanged.

---

## File Structure

- `website/wrangler.jsonc` — pinned Worker name, compatibility date, and static-assets routing behavior.
- `website/public/index.html` — product overview and unreleased Play status.
- `website/public/privacy/index.html` — privacy notice.
- `website/public/delete-account/index.html` — deletion instructions and safe email fallback.
- `website/public/support/index.html` — support paths and contact details.
- `website/public/terms/index.html` — service terms and cosmetic-record boundary.
- `website/public/404.html` — branded unknown-route response.
- `website/public/styles.css` — shared app-derived visual system and responsive behavior.
- `website/public/favicon.svg` — compact `strandcue•` brand mark.
- `website/public/robots.txt` and `website/public/sitemap.xml` — crawler discovery for canonical routes.
- `website/public/_headers` — CSP and static-site security headers.
- `tests/website/site-content.test.ts` — route, copy, navigation, metadata, and mail-link contracts.
- `tests/website/site-security.test.ts` — CSP, headers, forbidden third-party content, and Wrangler isolation contracts.
- `scripts/check-website.ts` — local or deployed HTTP smoke check for statuses, canonical content, headers, and redirects.
- `package.json` and `package-lock.json` — site verification/development scripts and Wrangler 4.148.0.
- `docs/verification/release-blockers-2026-10-04.md` — deployed website evidence and remaining launch gates.

### Task 1: Lock the website structure and Cloudflare boundary

**Files:**
- Create: `tests/website/site-content.test.ts`
- Create: `tests/website/site-security.test.ts`
- Create: `website/wrangler.jsonc`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: existing Vitest configuration and Node 24 runtime.
- Produces: `website/public` route contract; `npm run test:website`; `npm run website:dev`; `npm run website:deploy`; Worker project name `strandcue-website`.

- [ ] **Step 1: Write failing structural tests**

Add tests named `defines every canonical route`, `keeps the website on a separate worker`, `uses extensionless static HTML routing`, and `does not claim the existing worker host`. Assert the five page paths, `404.html`, assets, `name: "strandcue-website"`, `assets.directory: "./public"`, `assets.html_handling: "auto-trailing-slash"`, `assets.not_found_handling: "404-page"`, and compatibility date `2026-10-08`.

- [ ] **Step 2: Run the structural tests and verify RED**

Run: `npx vitest run tests/website/site-content.test.ts tests/website/site-security.test.ts`

Expected: FAIL because `website/wrangler.jsonc` and public files do not exist.

- [ ] **Step 3: Add the Worker configuration and package scripts**

Create `website/wrangler.jsonc` with only the new Worker name, compatibility date, `workers_dev: true` for pre-domain preview, `preview_urls: false`, and the static-assets directory/routing values asserted above. Add exact `wrangler@4.148.0` dev dependency and scripts:

- `test:website`: focused website tests;
- `website:dev`: local Wrangler development server;
- `website:deploy`: deploy using `website/wrangler.jsonc`;
- `check:website`: invoke `scripts/check-website.ts`.

- [ ] **Step 4: Add empty route files only as needed to reach the intended test failures**

Create the required directories and minimal valid HTML documents so tests fail on content and metadata requirements rather than missing files. Do not add final copy yet.

- [ ] **Step 5: Run the focused tests**

Run: `npm run test:website`

Expected: structural Worker tests PASS; content tests remain FAIL with named missing-copy assertions owned by Tasks 2 and 3.

- [ ] **Step 6: Commit the boundary**

```bash
git add package.json package-lock.json website/wrangler.jsonc website/public tests/website
git commit -m "test: define public website contracts"
```

### Task 2: Build the shared visual system and product overview

**Files:**
- Modify: `tests/website/site-content.test.ts`
- Create: `website/public/styles.css`
- Create: `website/public/favicon.svg`
- Modify: `website/public/index.html`
- Modify: `website/public/404.html`

**Interfaces:**
- Consumes: Task 1 route and metadata contract.
- Produces: shared `.site-header`, `.site-nav`, `.content-shell`, `.policy-layout`, `.site-footer`, `.button`, `.card`, `.skip-link` styling conventions reused verbatim by all pages.

- [ ] **Step 1: Add failing home-page and shell tests**

Test `renders the factual product overview`, `uses the app visual tokens`, `provides complete navigation without JavaScript`, `marks Play availability honestly`, `supports keyboard and reduced-motion users`, and `renders a useful 404`. Assert the wordmark, “Your hair record,” all eight implemented product areas, cosmetic-record boundary, five-route navigation, skip link, visible unavailable Play text, CSS palette values, `:focus-visible`, `@media (prefers-reduced-motion: reduce)`, and Home/Support links on the 404 page.

- [ ] **Step 2: Run the home-page tests and verify RED**

Run: `npx vitest run tests/website/site-content.test.ts -t "product overview|visual tokens|navigation|Play availability|keyboard|404"`

Expected: FAIL on missing copy, styles, and favicon.

- [ ] **Step 3: Implement the shared stylesheet and favicon**

Use only local CSS and SVG. Establish palette custom properties, fluid layout and type, 44-pixel control targets, skip-link/focus behavior, narrow policy measure, responsive wrapping navigation, and reduced-motion handling. The favicon uses the ink/accent `strandcue•` motif and remains recognizable at 16 pixels.

- [ ] **Step 4: Implement the home and 404 pages**

Write the approved factual product copy and complete static header/footer navigation. Use ordinary links; do not add a hamburger menu or JavaScript. Present the future Play action as unavailable text with no false store URL.

- [ ] **Step 5: Run the focused tests and inspect both viewports**

Run: `npm run test:website`

Then run `npm run website:dev`, inspect `/` and an unknown route at 1440×900 and 360×800, and verify no horizontal overflow or browser-console errors.

Expected: Task 2 tests PASS; policy-copy tests remain RED.

- [ ] **Step 6: Commit the product shell**

```bash
git add website/public tests/website/site-content.test.ts
git commit -m "feat: build StrandCue website shell"
```

### Task 3: Publish privacy, deletion, support, and terms content

**Files:**
- Modify: `tests/website/site-content.test.ts`
- Modify: `website/public/privacy/index.html`
- Modify: `website/public/delete-account/index.html`
- Modify: `website/public/support/index.html`
- Modify: `website/public/terms/index.html`

**Interfaces:**
- Consumes: Task 2 shared visual/navigation conventions.
- Produces: Google Play-ready privacy and deletion URLs and consistent legal/support identity.

- [ ] **Step 1: Add failing policy-page tests**

Test `identifies the operator and contact consistently`, `describes only verified privacy behavior`, `provides a safe deletion request path`, `covers the support journeys`, and `states the cosmetic-record terms boundary`. Assert the exact operator/contact, effective date `8 October 2026`, in-app path `Settings → Account → Delete account`, deleted record categories, catalogue-fact retention, export availability/expiry facts, Supabase/Cloudflare provider descriptions, the fixed mailto recipient/subject, credential warning, identity-verification statement, and the absence of diagnosis/prescription claims.

- [ ] **Step 2: Run policy tests and verify RED**

Run: `npx vitest run tests/website/site-content.test.ts -t "operator|privacy|deletion|support|terms"`

Expected: FAIL on placeholder policy files.

- [ ] **Step 3: Write the four approved pages**

Use plain-language headings, narrow readable sections, effective dates, current-page navigation state, canonical links, and the shared footer. The deletion email URL contains only `mailto:support@strandcue.co.za` and a percent-encoded fixed subject; display the address separately for users without a configured mail client.

- [ ] **Step 4: Run policy and link tests**

Run: `npm run test:website`

Expected: all content tests PASS.

- [ ] **Step 5: Inspect policy usability**

Using the retained local preview, inspect all four pages at 360×800, keyboard-tab through every link, and test 200% browser text zoom. Confirm headings remain ordered, current-page state is announced, email destination is visible, and no content clips.

- [ ] **Step 6: Commit the policy pages**

```bash
git add website/public/privacy website/public/delete-account website/public/support website/public/terms tests/website/site-content.test.ts
git commit -m "feat: add StrandCue public policy pages"
```

### Task 4: Add metadata, crawler files, security headers, and HTTP verification

**Files:**
- Modify: `tests/website/site-content.test.ts`
- Modify: `tests/website/site-security.test.ts`
- Create: `website/public/_headers`
- Create: `website/public/robots.txt`
- Create: `website/public/sitemap.xml`
- Create: `scripts/check-website.ts`
- Modify: `website/public/index.html`
- Modify: `website/public/privacy/index.html`
- Modify: `website/public/delete-account/index.html`
- Modify: `website/public/support/index.html`
- Modify: `website/public/terms/index.html`

**Interfaces:**
- Consumes: complete Task 2–3 static routes.
- Produces: `checkWebsite(origin: string): Promise<readonly WebsiteCheckResult[]>` and CLI input `STRANDCUE_WEBSITE_ORIGIN`, defaulting to `https://strandcue.co.za`.

- [ ] **Step 1: Add failing metadata and security tests**

Test `uses unique canonical metadata`, `publishes only canonical sitemap routes`, `sets restrictive static headers`, `blocks indexing on workers.dev previews`, `contains no third-party or executable content`, and `rejects unsafe website origins`. Assert unique title/description/canonical/Open Graph text per page; exact five sitemap URLs; CSP `default-src 'self'`, `script-src 'none'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer`; `Permissions-Policy`; and no `<script>`, remote asset URL, form, cookie API, or tracking term.

- [ ] **Step 2: Run metadata/security tests and verify RED**

Run: `npx vitest run tests/website/site-content.test.ts tests/website/site-security.test.ts`

Expected: FAIL on missing metadata, crawler files, headers, and checker.

- [ ] **Step 3: Implement metadata, crawler files, and `_headers`**

Give each page a canonical URL, unique title/description, matching Open Graph text, local stylesheet/favicon references, and no image metadata. Configure general security headers and a hostname-specific `X-Robots-Tag: noindex` rule for Worker preview URLs.

- [ ] **Step 4: Implement the HTTP checker**

Validate the origin with `new URL`; permit only HTTPS except localhost development. Fetch the five routes and one random unknown route with redirect errors and 10-second timeouts. Verify `200` on public pages, the branded not-found response, canonical markers, HTML content type, required headers when checking the deployed origin, and no cross-origin redirect. Return immutable results and redact query strings from error output.

- [ ] **Step 5: Run focused and full verification**

Run: `npm run test:website && npm run lint && npm run typecheck && npm test`

Expected: all website tests, lint, type checking, and the existing suite PASS.

- [ ] **Step 6: Run automated accessibility and link checks against local preview**

Run the retained preview, crawl all routes, verify internal links and browser-console output, and run an axe accessibility scan on each page.

Expected: no broken internal links, console errors, serious accessibility findings, critical accessibility findings, horizontal overflow, or third-party requests.

- [ ] **Step 7: Commit the hardened site**

```bash
git add website/public tests/website scripts/check-website.ts package.json package-lock.json
git commit -m "test: harden and verify public website"
```

### Task 5: Review, deploy, activate the domain, and record evidence

**Files:**
- Modify: `website/wrangler.jsonc`
- Modify: `docs/verification/release-blockers-2026-10-04.md`

**Interfaces:**
- Consumes: verified static site and `npm run check:website`.
- Produces: live `https://strandcue.co.za` website and Play Console-ready privacy/deletion URLs.

- [ ] **Step 1: Capture predeployment infrastructure evidence**

Run the existing Android association check with `STRANDCUE_ANDROID_CERT_SHA256` set to the reviewed fingerprint, confirm the `strandcue` Worker version/variable and `strandcue-account-deletion` Worker schedule/private route status, and save only non-secret results in the release ledger.

- [ ] **Step 2: Confirm the support mailbox is operational**

Verify MX/DNS for `strandcue.co.za`, then have the operator send and receive a test message at `support@strandcue.co.za`. Do not publish the email as operational if delivery fails; record the blocking result.

- [ ] **Step 3: Present the complete local preview for final content review**

Open the retained preview with Home, Privacy, Delete Account, Support, and Terms available. Do not deploy until the user approves this concrete preview.

- [ ] **Step 4: Deploy the new Worker**

After preview approval, authenticate Wrangler without exposing credentials and run `npm run website:deploy`. Confirm the deployment targets only `strandcue-website`. Record the version ID and temporary URL.

- [ ] **Step 5: Verify the temporary deployment**

Run `STRANDCUE_WEBSITE_ORIGIN=<temporary HTTPS origin> npm run check:website`, visually inspect phone/desktop layouts, and confirm the temporary hostname is not indexable.

Expected: all public route checks PASS; temporary hostname returns `X-Robots-Tag: noindex`.

- [ ] **Step 6: Attach the apex custom domain**

In Cloudflare, add `strandcue.co.za` only to `strandcue-website`, accept the automatically scoped DNS change, and wait for TLS status Active. Do not modify the `strandcue.adonisgptacc.workers.dev` hostname or account-deletion Worker routes.

- [ ] **Step 7: Verify production and infrastructure isolation**

Run `npm run check:website` with its default production origin, then rerun `npm run check:release-links`. Confirm all five routes, 404 behavior, TLS, headers, canonical metadata, and support mail link. Confirm the Android association JSON still contains package `za.co.strandcue.app` and the reviewed local certificate, and observe at least one subsequent deletion-worker invocation with outcome `ok`.

- [ ] **Step 8: Disable the temporary Workers.dev hostname after apex verification**

Set `workers_dev: false`, redeploy only `strandcue-website`, and rerun production checks. Preserve the deployed version that passed before this change for rollback.

- [ ] **Step 9: Record final evidence and run the release gates**

Update the release ledger with the live routes, deployment/version ID, domain/TLS status, support-mail result, accessibility result, header result, and postdeployment App Links/deletion-worker regression evidence. Run `npm run verify` plus the release-link and website checks.

Expected: repository verification PASS; the only launch gate that may remain is physical-device acceptance and independent PR approval.

- [ ] **Step 10: Commit and push the website release evidence**

```bash
git add website/wrangler.jsonc docs/verification/release-blockers-2026-10-04.md
git commit -m "docs: verify StrandCue website deployment"
git push
```

Watch all protected PR checks to completion and confirm only the required `quality`, `dependency-audit`, `supabase-api`, and `secret-scan` checks appear.
