# Website transport security

HSTS source policy and the operator steps that upgrade the public website's
transport. This runbook is the operator summary; the migration ladder below is
the staged plan and only the first stage is implemented in source.

## What this repository controls

`website/public/_headers` carries a host-scoped HSTS block. Cloudflare Workers
static assets apply it to responses on the production host:

    https://strandcue.co.za/*
      Strict-Transport-Security: max-age=86400

The header is scoped to the production host block rather than `/*` on purpose.
The browser commitment persists for the host this repository controls, and a
later `includeSubDomains` escalation cannot reach a `*.workers.dev` preview
subtree that this repository does not control.

The general `/*` block keeps its existing security headers
(`Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, `X-Frame-Options`) and deliberately carries **no** HSTS;
only the production-host block adds it.

## HSTS staged ladder

Implement one stage at a time, each with its own review:

1. `max-age=86400` — **current stage**, in `website/public/_headers`.
2. `max-age=31536000` — raise only after stage 1 has run in production without
   breaking the site.
3. add `includeSubDomains` — after confirming no subdomain depends on plain
   HTTP.
4. add `preload` — only after a `preload` eligibility review.

Stages 2–4 are **not implemented now**. No `includeSubDomains` and no `preload`
are present. Do not jump stages.

## Required Cloudflare zone configuration (operator action)

The `http://strandcue.co.za` → `https://strandcue.co.za` redirect lives at the
Cloudflare zone, not in this repository. This repository does not change
Cloudflare. On the `strandcue.co.za` zone the operator must either:

- enable **"Always Use HTTPS"**, or
- add an equivalent Redirect Rule from `http://strandcue.co.za/*` to
  `https://strandcue.co.za/*`.

Either change is an operator action that requires its own authorization and is
recorded outside this repository. Without it the HTTP origin does not redirect
and the transport check reports `WEBSITE-TRANSPORT-HOLD`.

## Operator verification

Run from the repository root with the pinned Node runtime:

    npm run check:website-transport

The command is **read-only**: it issues HTTP requests only, uses
`redirect: 'manual'` so a redirect is inspected rather than followed, never
calls the Cloudflare API, and never mutates Cloudflare or the deployment. It
accepts `STRANDCUE_WEBSITE_TRANSPORT_HTTP` (default `http://strandcue.co.za`)
and `STRANDCUE_WEBSITE_TRANSPORT_HTTPS` (default `https://strandcue.co.za`).
The HTTP probe origin must be the plain HTTP origin of the approved host,
without credentials, path, query, or fragment; the secure origin accepts HTTP
only for a localhost test origin. Credentialed, path-bearing, query-bearing,
and fragment-bearing origins are rejected for both.
Remote probes use default HTTP/HTTPS ports only. Explicit numeric-loopback
fixture ports remain supported. Redirect destinations must match the entire
secure origin, including its port.

It performs three checks and prints one line each:

- `http-redirect` — the HTTP origin returns a redirect status (301/302/303/
  307/308) whose `Location` targets the secure origin scheme.
- `http-redirect-host` — the redirect stays on the approved host
  (`strandcue.co.za`), preserves the canonical path, and carries no
  credentials. Suffix and lookalike hosts (for example
  `strandcue.co.za.evil.test` or `evilstrandcue.co.za`) are rejected.
- `https-strict-transport-security` — the final HTTPS response is HTTP 200
  `text/html` and carries `Strict-Transport-Security` with a `max-age` at or
  above the staged floor of `86400`.
  The checker requires exactly one integer `max-age` directive and parses
  every complete directive; malformed values, lookalike names without a real
  max-age, duplicate/conflicting directives and garbage suffixes fail closed.

Each satisfied check prints `WEBSITE-TRANSPORT-PASS ...`; each failure prints
`WEBSITE-TRANSPORT-HOLD ...` and the command exits with code 1. Redirect
destinations, query strings, credentials, and remote error text are never
echoed.

## What is not claimed

The live HTTP → HTTPS redirect and HSTS behaviour are **UNVERIFIED** in this
repository. No live run has been performed and no `WEBSITE-TRANSPORT-PASS` is
claimed here. Only the source-controlled `_headers` policy is proven, by the
static tests in `tests/website/site-security.test.ts` (the production-host HSTS
block, the absence of `includeSubDomains`/`preload`, and the unchanged general
and `workers.dev` preview blocks). The deployed header behaviour and the
zone redirect are **not** proven by those tests.

Record the exact live result of `npm run check:website-transport` before making
any HSTS or redirect claim. Audit finding WB-001 stays `open` until that
happens.
