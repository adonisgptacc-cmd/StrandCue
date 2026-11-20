# Heat Coach acceptance record

**Recorded:** 1 November 2026

**Decision:** PARTIAL / HOLD
**Scope:** Local Increment 6 verification only. No hosted Supabase changes, publication, push, deployment or merge.

## Verified

| Gate | Result | Evidence |
| --- | --- | --- |
| Runtime | PASS | Node 24.19.0; `npm run check:runtime` returned `NODE-RUNTIME-PASS`. |
| Typecheck | PASS | `npm run typecheck` completed for domain and mobile workspaces. |
| Lint | PASS | `npm run lint -- --concurrency=4` completed with zero warnings or errors. |
| Focused Heat Coach mobile tests | PASS | 10/10 across `heat-coach-journey` and `use-heat-assessment-preview`. Includes explicit accessibility announcement and stale-copy A→none→A regression. |
| Previously affected Today test files | PASS | 113/113 after adding the missing active `AppState` test mock to five files. |
| Full coverage | PASS | 231 files passed, 8 skipped; 4,807 tests passed, 47 skipped; 0 failed. Statements 95.61%, branches 90.13%, functions 98.13%, lines 97.59%. |
| Real PostgreSQL races | PASS | 16/16 across `heat-coach-concurrency.pg.test.ts` and `assessed-heat-concurrency.pg.test.ts`, against a fresh disposable local Supabase project with the branch's full migration chain. This includes quota/withdrawal races and product-correction/start invalidation. The local `pg` driver lived in a temporary directory; package manifests and lockfile were unchanged. |
| Web export | PASS | `npm run export:web` completed; generated `dist` output is ignored local build output. |
| Control-plane metadata audit | PASS | `METADATA-PASS`, no findings. This checks installed local metadata only; it does not establish device or host integrity. |
| Guidance research validation | PASS | `rows=2 catalogue=2 evidence=6`. Node emitted the existing nested-package module-type performance warning. |
| Dependency policy | HOLD | 26 findings: 0 critical, 6 high, 22 moderate; stale/due/unexcepted advisory and review-lock findings remain. |
| Device and screen-reader acceptance | NOT RUN | `adb` is unavailable; no emulator/physical device, TalkBack or VoiceOver evidence was produced. |

The first full-suite diagnostic run exposed 92 failures because five older React Native mocks lacked the newly required `AppState` export. Those mocks were corrected; all five affected files then passed 113/113, and the final full-coverage run passed.

## Independent reviews

- Code/state: passed after the request-token guard was re-reviewed; cached copy is hidden across background/resume and A→none→A binding changes while a fresh read runs.
- Database/privacy: the added product-correction/start race setup and lock expectation were reviewed; the full real-PostgreSQL race set then passed 16/16.
- Accessibility/owner switch: explicit `AccessibilityInfo.announceForAccessibility` and alert semantics pass code review and an exact-call test. Device speech behavior remains unverified; Android may announce both the live region and explicit call.
- Product truth/wording: TL-05/TL-06 descriptions pass review and remain Partial. Dependency-policy clearance is recorded on both matrix and traceability rows.

## Release holds

I6.6 remains **PARTIAL / HOLD**. Production heat rules and technique content remain empty/draft. No authoritative production product/tool source set or distinct Human A/B approvals were supplied. Device, TalkBack and VoiceOver acceptance is outstanding. The dependency-policy audit still holds release. The passing synthetic and database tests establish local mechanism behavior only; they do not authorize production guidance.

No hosted migrations were applied. No production content was published. No push, deployment, merge or Increment 7 work occurred.
