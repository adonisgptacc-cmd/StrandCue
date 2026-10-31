# Task 24 — dependency advisory disposition and isolated-runner gate

Base: `c580d18`, branch `codex/security-audit-remediation`. Date: 2026-10-17.
No subagents/reviewers were spawned by this implementer. Work stayed local except
read-only npm registry metadata/audits/downloads. No hosted Auth, database,
Cloudflare, EAS build, publish, push, merge or deployment was performed.
Android acceptance remains **0/9**. This report does not approve a release.

## Delivered behavior

- The combined `npm run audit:dependencies` now audits all four committed npm
  trees: root, `workers/account-deletion`, `tools/eas-runner`, and
  `tools/mutation-runner`. Root/worker retain the existing application policy.
  The isolated runners use `scripts/runner-dependency-policy.ts` and separate
  review records under `docs/verification/`. The root Expo-only high-exception
  scope was not broadened, and tools were not added to npm workspaces.
- The runner policy binds the full locked dependency tree using an LF-normalized
  lock SHA-256. It compares package identities, severities, affected nodes,
  affected ranges, complete advisory metadata and `via` dependency edges with
  the reviewed report. Any substantive lock change, unreviewed advisory, new
  path/edge, severity change, missing/malformed record, overdue recheck or
  Critical advisory fails closed. Duplicate advisory reviews also fail.
  A successful policy run prints each tree's summary and review count.
- npm nondeterministically switches its derived `effects`/`fixAvailable` metadata
  between `@expo/pkcs12` and `jks-js` even when versions, IDs, nodes and `via`
  edges are unchanged. Prefix and cwd audits reproduced the difference. Those
  derived fields are retained in the raw evidence but excluded from comparison;
  installed edges remain bound by both the complete lock and audit `via` graph.
  Array order is normalized without dropping entries. CRLF/LF equivalence has a
  regression test; substantive whitespace/content changes still require review.
- The Android verify job already invokes the combined policy through `verify`.
  The mutation workflow now invokes it before Stryker. The Task-21 Medium
  advisory-coverage gap is resolved in source/tests. CI-001 remains open for
  accountable human ownership/risk acceptance; the existing runbook owner field
  is still legitimately unassigned. No human identity or release approval was
  invented. A PASS means reviewed residual risk, never a dependency fix.
- Both new/changed logic files are now subject to the existing 80% per-file
  statements/branches/functions/lines floors. Existing thresholds were not lowered.

## Raw audit disposition

Counts below are vulnerable package entries reported by npm, including propagated
parent entries; they are not counts of distinct GHSA advisories. Commands were
`npm audit --include=dev --json --prefix <tree>`, with separate per-directory
`npm audit --include=dev --json` verification used to diagnose derived metadata.

| Tree | Before (Critical / High / Moderate / Low) | Final |
| --- | --- | --- |
| Root | 0 / 19 / 11 / 0 | 0 / 19 / 11 / 0 |
| Account-deletion worker | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| EAS runner | 0 / 15 / 16 / 1 | 0 / 11 / 13 / 1 |
| Mutation runner | 0 / 0 / 2 / 0 | 0 / 0 / 0 / 0 |

**Zero Critical in every final raw audit.** Raw audit exits are respectively
1, 0, 1, 0 because known noncritical vulnerabilities remain. The combined
review policy passes with four root and six EAS advisory reviews, zero for the
clean trees. Passing the review policy does not change these raw counts.

`npm update --package-lock-only` and non-force `npm audit fix --package-lock-only`
could not move the exact upstream pins. Scoped overrides therefore select only
same-major patch/minor releases; all direct EAS/Stryker/Vitest/TypeScript pins
remain unchanged. `npm audit fix --force` was never executed. Root and worker
lockfiles and the application manifests were left unchanged.

| Compatible update | Advisory IDs removed from this runner's raw audit |
| --- | --- |
| EAS minimatch 5.1.2 -> 5.1.9 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj |
| EAS nanoid 3.3.8 -> 3.3.20 | GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8, GHSA-xwg4-73v4-xw9w |
| EAS joi 17.11.0 -> 17.13.8 | GHSA-6h2x-m376-mqjq, GHSA-6w3j-5fw6-r9vr, GHSA-gg4h-3hg2-grpc, GHSA-q7cg-457f-vx79, GHSA-wr44-6hxh-3jwq |
| EAS tar 7.5.19 -> 7.5.22 | GHSA-r292-9mhp-454m |
| EAS ajv 8.11.0 -> 8.18.0 | GHSA-2g4f-4pwh-qvx6 |
| EAS yaml 2.6.0 -> 2.8.3 | GHSA-48c2-rrv3-qjmp |
| Mutation qs 6.15.1 -> 6.16.1 | GHSA-4mjr-xmp4-gh2g, GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx |

The high advisory entry points were inspected: EAS nanoid credential/new-project
helpers, tar download/archive helpers, direct minimatch, and the EAS JSON Joi
schema. The overrides stay inside the installed major API contracts; major EAS,
Expo, UUID and ts-deepmerge migrations were not forced to silence audit output.

## Remaining advisories: exact evidence and exposure

`dependency-advisory-exceptions.json` retains the root policy's complete reviewed
path/surface tuples and now records installed versions, current upstream status,
constraints, controls and near-term dates. `eas-runner-advisory-review.json` retains
the full raw report plus exact affected node/version strings, every lock-derived
caller chain and a separate assessment for each of its six advisories. These
records, rather than this abbreviated table, are the exhaustive path evidence.

| Advisory | Installed version(s) and reachability / constraint |
| --- | --- |
| GHSA-vfj7-8cjw-p6xm (High), braces | 3.0.3 in root Metro/micromatch and EAS fast-glob/micromatch paths. Latest published release remains affected. Trusted build glob patterns limit stack-exhaustion exposure; the Node tree is outside app runtime. No upstream fixed release was available. |
| GHSA-86w9-cpqp-85rv (High), node-forge | 1.4.0 in root Expo signing tooling and EAS signing, pkcs12 and JKS paths. Latest published release remains affected. The EAS process holds EXPO_TOKEN/credential access; vulnerable verifier reachability on the selected build command remains uncertain. Trusted signing material mitigates exposure but is not a fix. |
| GHSA-vcc3-ghjq-m6fr (Moderate), decode-uri-component | Root 0.2.2 through expo-router -> query-string 7.1.3 (^0.2.2). Fixed 0.5.0 lies outside that pre-1.0 minor contract. Hostile URL decoding is potentially runtime-reachable; callback filtering reduces exposure without proving the decoder unreachable. |
| GHSA-w5hq-g745-h8pq (Moderate), uuid | Root xcode 3.0.1 -> 7.0.3; EAS nested xcode -> 7.0.3 and Rudder/Bunyan -> 8.3.2. Fixed 11.1.1 requires incompatible major changes to these older constraints. Xcode/Rudder use v4() and Bunyan uses v1(), without supplied output buffers; advisory v3/v5/v6 buffer call shapes do not match inspected calls. iOS remains outside the release scope. |
| GHSA-87mf-gv2c-c62c (Moderate), ts-deepmerge | EAS 6.2.0 merges trusted build configuration. Fixed 8.0.0 is a major change; hostile method keys could cause denial of service if input trust expands. |
| GHSA-hp3w-g68c-fv3c (Moderate), sprintf-js | EAS 1.0.3 under old oclif -> js-yaml -> argparse. Latest 1.1.3 remains affected. Trusted CLI/configuration inputs and fixed workflow commands limit precision-format denial of service. |
| GHSA-73rr-hh4g-fpgx (Low), diff | EAS 7.0.0; fixed 8.0.3 is a major change. Patch parse/apply entry points are vulnerable; no untrusted patch ingestion was established for the reviewed build command. |

The two high GHSA IDs above explain all eleven remaining EAS high package
entries; those entries were not silently waived. Every runner review expires
2026-10-31 and rechecks 2026-10-24 (14-day maximum enforced). Root exceptions use
those same near-term dates. Runner risk owner is explicitly
`<UNASSIGNED - dependency risk owner must be named before CI-001 closes>`;
source review does not substitute for named-human acceptance before release.

## RED -> GREEN and verification

Bundled Node **v24.19.0** was selected by prepending
`C:\Users\ABADO\AppData\Local\Temp\opencode\node24\node-v24.19.0-win-x64`
to PATH for accepted gates.

- Six installed-version assertions first failed against the original locks;
  all six passed after compatible overrides/lock refresh.
- New runner policy tests first failed while the implementation was absent;
  then 27 passed. Separate missing-summary regression failed once, then passed.
- The CLI inventory regression produced **1 failed / 22 passed** because it
  saw only root + worker; implementation brought the tools trees into the gate.
- New runbook/workflow requirements produced **3 failed / 5 passed**; all passed
  after the gate wiring/documentation change. The future-approved exception
  fixture moved to 2026-10-18 when the frozen CLI date moved to 2026-10-17;
  its rejection assertion remains intact.
- CRLF and unordered-edge regressions produced **2 failed / 28 passed**, then
  passed after normalization. The npm derived-metadata regression produced
  **1 failed / 30 passed**, then **31/31** after excluding only unstable derived
  fields. Node identities, ranges, via edges, new paths and Critical refusal
  remain negative tests.
- Clean `npm ci --ignore-scripts` completed for both runners. Offline/local
  compatibility smoke verified all three actual Android EAS profiles and
  rejection of invalid schema, AJV validation, YAML parsing, minimatch matching,
  nanoid length, tar create/list roundtrip, and qs parse/stringify (including
  comma/null input). EAS reports 24.10.0; Stryker reports 10.0.0 and its actual
  isolated Vitest plugin resolves (`STRYKER-PLUGIN-RESOLUTION-PASS ['vitest']`).
  No EAS remote build or mutation campaign was started.
- Initial full coverage attempt: 2163 passed / 8 skipped, two named CLI timeouts:
  `rejects npm exit 1 when the registry retains a path absent from the audit report`
  (10 s) and `redacts untrusted audit details from policy failure output` (5 s).
  A concurrent bounded run then hit the 60 s PGlite `protocol executions
  owner-isolated idempotent persistence` beforeAll hook, skipping its 73 cases;
  it also loaded the deliberate derived-metadata RED regression before its
  implementation change. Neither run is claimed as passing or as proof of a
  known flaky test. Final verification runs use unchanged assertions/timeouts
  and all coverage floors, after other heavyweight jobs completed.

Final accepted gates (fresh Node 24.19.0 runs):

| Gate | Result |
| --- | --- |
| check:runtime | NODE-RUNTIME-PASS v24.19.0, exit 0 |
| typecheck (domain + mobile) | exit 0 |
| lint | exit 0, zero warnings |
| focused tests/tooling, maxWorkers=4 | 35 files, 530 tests passed, exit 0 |
| full test:coverage, maxWorkers=4, text + json-summary reporters | 132 files passed / 2 skipped; 2174 tests passed / 8 skipped; exit 0 |
| global coverage (statements / branches / functions / lines) | 96.80 / 91.66 / 98.48 / 98.50 |
| audit-dependencies-cli.ts coverage | 97.41 / 93.15 / 100 / 99.08 |
| runner-dependency-policy.ts coverage | 100 / 100 / 100 / 100 |
| export:web | exit 0; 1032 modules, web bundle exported locally |
| audit:control-plane | METADATA-PASS, zero findings, exit 0; local metadata only |
| audit:dependencies | DEPENDENCY-POLICY-PASS, all four trees explicitly listed, exit 0 |
| all four final raw audits | zero Critical; counts and expected raw exits above |
| git diff --check | exit 0; Git CRLF conversion notices are informational |

No timeouts or threshold values were changed to obtain the passing run. The
previously timed-out CLI cases and all 73 protocol-execution cases pass in this
complete rerun. Self-review checked the staged scope, exact direct pins, lock
integrity tests, redacted policy output and absence of added secret values.
The final runtime/typecheck/lint/combined-audit chain used fail-fast exit checks
and completed with exit 0 after the last logic change.

## Remaining limits

No Android/device evidence, hosted migration/Auth/API/website verification,
remote build, credential change, publication, push or merge is supplied by this
task. Dependency exceptions remain risks with short expiry, not fixes. Release
status stays HOLD for named-human acceptance and the separately tracked launch
obligations; Task 25 owns the final decision packet.
