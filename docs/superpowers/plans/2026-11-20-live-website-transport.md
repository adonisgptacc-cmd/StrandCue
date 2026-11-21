# Live website transport implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public StrandCue site redirect HTTP to HTTPS and send HSTS on HTTPS.

**Architecture:** Discover the Cloudflare service that actually serves `strandcue.co.za` before selecting a rule or deployment change. Apply the smallest reversible change there, then verify the public endpoint with the existing transport script.

**Tech Stack:** Cloudflare zone routing, Workers/Pages as discovered, Node.js fetch, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-20-repository-health-repairs-design.md`

## Global Constraints

- Preserve the site's existing CSP, nosniff, frame, referrer, and permissions headers.
- Require HTTP redirect to the same HTTPS host and canonical path and HSTS `max-age >= 86400`.
- Do not change the unrouted `strandcue` Worker based only on its name.
- Record rollback before changing production routing; obtain external-action approval at deployment time.

## Review Focus

- HTTP `/` must redirect to HTTPS `/` on the same host; Task 2 probes it.
- HTTP nested paths must preserve their path; Task 2 probes `/privacy`.
- HTTPS must return HTML with HSTS; Task 2 runs the existing script.
- HTTPS must preserve security headers and site content; Task 2 compares baseline and post-change responses.
- A wrong or unowned Cloudflare zone must halt deployment; Task 1 establishes ownership.

---

### Task 1: Identify the active serving path

**Files:** Modify only `docs/verification/website-transport-repair.md` to record non-secret facts and rollback; do not add credentials or zone IDs.

**Interfaces:** Produces the active Cloudflare zone, DNS target, route/service, deployment source, and reversible change mechanism for Task 2.

- [ ] **Step 1:** Record DNS records, Cloudflare zone status, active route or Pages custom domain, and current deployment version in the repair note.
- [ ] **Step 2:** Compare an HTTP and HTTPS response from the public hostname with the identified service; require a matching deployment marker or asset fingerprint before declaring the path active.
- [ ] **Step 3:** Record the exact rollback control and baseline response headers; if no controlled active path is found, stop and request the correct account/service.

### Task 2: Correct and verify transport

**Files:** Modify the active Cloudflare setting or Worker/Pages configuration found in Task 1; modify `website/public/_headers` or `website/wrangler.jsonc` only if that service consumes them. Extend `tests/website/site-security.test.ts` only if code/config behavior changes.

**Interfaces:** Consumes Task 1's active service and rollback. Produces a verified public HTTP redirect and HTTPS HSTS response.

- [ ] **Step 1:** Write failing checks for HTTP `/`, HTTP `/privacy`, HTTPS HSTS, and preserved security headers against the active target; confirm the expected failures.
- [ ] **Step 2:** Make the smallest route/header change on the active service; use the staged HSTS floor of 86400 seconds.
- [ ] **Step 3:** Run `npm run check:website` and `npm run check:website-transport`; both must pass. Probe `/privacy` and the root directly for same-host redirects and headers.
- [ ] **Step 4:** Verify the existing website content and certificate, record the deployed version and rollback in the repair note, then commit only repository-side changes with `fix: enforce website transport security`.
