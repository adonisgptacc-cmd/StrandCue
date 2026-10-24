# Task I5.5 report: treatment-programme mobile journey

Plan: `docs/superpowers/plans/2026-10-22-increment-5-wash-and-treatment-truth.md` (Task I5.5). Task I5.6 was not started.

## Starting point

Branch `codex/increment-5-wash-and-treatment-truth`, worktree `C:\Users\ABADO\Desktop\StrandCue-increment-5-wash-and-treatment-truth`, starting commit `ec2c717`, clean tree, Node v24.19.0.

## Result

The mobile app now exposes owner-only treatment programmes under Journey > Programmes. It can list and page programmes, open an authoritative detail, show the named counting unit, reviewed range, counted owner events, missing facts and append-only history, enrol only from a server-confirmed offer, and explicitly pause, complete or stop an active programme. The UI does not compute programme state, counts or completion snapshots.

The API adapter accepts only four RPCs (`enrol_programme`, `change_programme`, `list_programmes`, `get_programme`). Strict request and response schemas reject unknown fields and contradictory records. Results are deeply frozen. Server errors map to bounded owner-safe copy. No owner id, count, due state, publication object, evidence list, reviewer fact or completion snapshot is supplied by the client.

The owner-keyed reducer/controller drops all prior-owner lists, detail, drafts, failures, pagination and pending operations synchronously. Request and owner tokens reject late responses. One command keeps one operation id across retry. Conflicts require an authoritative reload. A reviewed-content withdrawal or mismatch clears stale confirmation and pending state; pause and completion are refused while blocked, while an explicit confirmed stop remains available because it only closes the owner's record and the I5.4 server boundary permits abandon without reviewed guidance.

Owner-visible text preserves `wash` versus `shampoo session`, preserves reviewed ranges, explains missing facts and routes to My Shelf, Journey activities or Journey history. Technical URLs, UUIDs, rule keys and digests are replaced with neutral product wording. An impossible calendar date such as 30 February now fails to `Date not recorded` rather than being displayed.

## Files

- Mobile boundary/state: `programme-api.ts`, `programme-errors.ts`, `programme-state.ts`, `programme-controller-view.ts`.
- Screens/copy: `ProgrammeJourney.tsx`, `ProgrammeList.tsx`, `ProgrammeDetail.tsx`, `ProgrammeHistory.tsx`, `ProgrammeActions.tsx`, `programme-copy.ts`.
- Integration: `records.tsx` and `vitest.config.ts`.
- Tests: 12 programme suites, shared fake server/render harness, navigation integration and Expo crypto mock.

## Verification

- Focused I5.5 and navigation suites: 13 files, 181 passed, 0 failed.
- Full coverage: 206 files passed, 6 skipped; 4454 tests passed, 29 skipped. Global statements 95.75%, branches 90.15%, functions 98.16%, lines 97.73%.
- Selected new-file coverage (statements / branches / functions / lines): `programme-api.ts` 98 / 96.19 / 100 / 99.34; `programme-copy.ts` 98 / 97.05 / 100 / 100; `programme-state.ts` 86.85 / 80.06 / 98.46 / 95.94; `ProgrammeDetail.tsx` 100 / 87.71 / 100 / 100; every registered critical module clears 80% on all four axes.
- `check:runtime` PASS v24.19.0; root/mobile typecheck PASS; lint PASS with zero warnings; `export:web` PASS; `audit:control-plane` METADATA-PASS; `validate:guidance-research` PASS (`rows=2 catalogue=2 evidence=6`); `git diff --check` clean; package manifests unchanged.
- `audit:dependencies` exits 1 with **DEPENDENCY-POLICY-HOLD**: 0 critical, 5 high, 9 moderate, 4 reviewed advisories. This is recorded as HOLD, not PASS.

## Review findings resolved

- Repeated identical announcements now include request identity so separate saves are announced; failures take precedence over success text.
- Detail focus targets the conditionally mounted heading; start dates have visible labels; accessible row names omit empty segments.
- Reviewed offers do not display a false blocked state. Blocked details suppress schedule/evaluation output and expose only Stop, never Pause or Complete.
- A blocked refresh clears stale confirmations, pause reason and pending commands. Only `abandon` may be confirmed and sent while blocked; a controller/UI regression proves exactly one abandon RPC and an abandoned status.
- Recovery buttons navigate to My Shelf, Journey activities or Journey history as requested. `journey_routines` no longer opens Activities.
- Every selectable pause code has specific safe history wording, including `need-more-time` -> `More time needed`.
- Product labels containing URLs, UUIDs, rule keys or digests are replaced with `Treatment product`.

Independent accessibility and wording/product-truth re-reviews found no remaining Critical, High or Medium findings. Separate final code/security reviewer agents were attempted but unavailable because their service quota was exhausted. The final staged changes were therefore also checked manually for strict input validation, owner-state reset, late-response rejection, safe errors, absence of direct table access, no secret material and no dependency changes.

## Boundaries and holds

Production programme rules and trusted step classifications remain empty, so no real treatment programme is published or activated. The Banana content and Human A/B review package are untouched. Nothing was pushed, merged, deployed, published or applied to hosted Supabase, Cloudflare or GitHub.

NOT RUN: mobile UI against a real local or hosted database; hosted owner isolation; emulator or physical device; TalkBack; VoiceOver. The exact display timezone remains unstated in copy and is deferred to I5.6 integration/device review. Task I5.6 was not started.
