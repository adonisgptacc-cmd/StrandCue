# Increment 5 closure report

## Scope and result

Increment 5 now has an end-to-end alpha mechanism for treatment-programme truth: canonical care events, named wash units, deterministic programme evaluation, owner-only persistence, a mobile programme journey, and a test-only integration closure. It does **not** publish treatment advice or claim that any product works. TR-01 through TR-08 and TL-04 remain Partial; TL-05 remains Not started.

Production guidance remains `content_pending`. The production rule store remains empty. No Banana review field, product capability, treatment rule, evidence row, reviewer identity or catalogue publication was invented.

## I5.6 changes

- `tests/mobile/programme-integration.test.tsx` now proves one integrated alpha journey: a confirmed application, wash accumulation, count/state/due changes, same-enrolment recomputation after a backdated source correction, an owner-recorded unknown-date wash producing `needs_input`, a completed snapshot remaining frozen after later source events, and production guidance remaining `content_pending` with zero recommendation, catalogue or execution writes.
- The owner-switch part captures **every committed render** while owner B's read is held and rejects any prior-owner count or product label.
- `apps/mobile/src/ProgrammeJourney.tsx` now uses an owner-keyed state guard during render, so the prior owner's state cannot paint or be announced before the new controller effect runs. Announcement-deduplication refs reset per controller, including when request numbers repeat.
- `supabase/migrations/20261025130000_programme_execution_retention_scope.sql` repairs review-found over-retention. An active programme now holds only temporally eligible washes, matching exact-product applications, and ambiguous evidence that the canonical reader itself blocks on. Pre-programme washes and unrelated applications return to the normal 90/30-day execution retention policy.
- The offset/day-boundary test proves timestamps are canonicalized before a day-precision programme start is compared.

## TDD evidence

- Retention RED: the new database test failed because the pre-start execution was still held. GREEN: the scoped forward migration plus inventory/replay updates pass.
- Integration RED: the unknown-date journey returned `not_due` because the test server had no owner-recorded unknown-date model. GREEN: the test-only server now represents activity provenance faithfully and rejects impossible unknown-date execution fixtures.
- Owner-paint RED: commit capture exposed owner A's programme for one frame after switching to owner B. GREEN: the owner-keyed visible-state guard removes it from every render and accessibility effect.
- Announcement RED: owner B's first save reused owner A's numeric request id and was not announced. GREEN: dedupe refs reset in a layout effect for each controller.

## Reviews

Four independent review axes were attempted. The configured `reviewer` role could not start because its fixed model was unavailable on this account, so fresh default agents performed the code/state, database/privacy, accessibility/owner-switching and product-truth/wording reviews instead.

Findings fixed:

- Database/privacy Medium: an active programme retained all of the owner's classified executions, including unrelated and pre-programme history.
- Code Medium: day-precision retention used the raw offset date rather than the canonical instant.
- Evidence Mediums: the first correction test created a fresh history, the unknown-date fixture used impossible execution provenance, and owner switching inspected only the final frame.
- Privacy/UI defect exposed during the fix: a real one-frame prior-owner paint.
- Accessibility Medium: announcement dedupe state survived owner changes and could suppress owner B's first save.

Fresh re-reviews found no remaining Critical, High or Medium issues. Low optional database coverage remains for an explicit stale-run binding, malformed timestamp, two simultaneous active programmes, and a combined programme/legal-hold case; the underlying fail-closed and legal-hold paths already have separate coverage.

## Verification

All commands used Node 24.19.0 from the preserved project runtime because the active cached runtime had drifted to Node 24.22.1.

- `npm run check:runtime`: PASS (`v24.19.0`).
- Focused pre-change baseline: 273/273.
- Retention/inventory focused suites: 70/70 after the first fix round; the final treatment-programme suite contains 68 treatment tests.
- Owner-switch/integration/state focused suites: 48/48.
- Root and mobile typecheck: PASS.
- Lint with zero warnings: PASS.
- Guidance research validation: PASS (`rows=2 catalogue=2 evidence=6`).
- Full coverage: PASS — 206 files passed / 6 skipped; 4,458 tests passed / 29 skipped. Global coverage: 95.77% statements, 90.15% branches, 98.21% functions and 97.73% lines; registered per-file floors passed.
- Web export: PASS.
- Control-plane audit: `METADATA-PASS` (its documented local-metadata limitations remain).
- Dependency audit: **HOLD**, not PASS — 0 critical, 5 high, 9 moderate and 4 reviewed advisories across the root and runner/worker trees. No dependency manifest or lockfile changed in I5.6.
- Guidance research validation: PASS (`rows=2 catalogue=2 evidence=6`).
- `git diff --check`: clean.

## Honest external holds

The following were NOT RUN and must not be described as passing:

- Hosted Supabase owner isolation for populated treatment programmes.
- Programme UI against local or hosted PostgreSQL/PostgREST/Auth.
- Android emulator or physical-device programme journey.
- TalkBack or VoiceOver.
- A real production treatment programme, because no reviewed treatment rule or trusted step-classification writer exists.

The dependency policy remains a launch HOLD unless its final run says otherwise. No migration was applied to hosted Supabase; nothing was pushed, merged, deployed or published.
