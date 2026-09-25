# Release workflow — ordered outstanding work

Status: HOLD. This file sequences every outstanding item from the working session
by dependency. A phase starts when the one before meets its exit criteria.
Owner tags: HUMAN (device, credentials, signatures) / AGENT (subagent-driven).

## Phase 0 — Close Plan A (unblocks B, C)

| # | Item | Owner | Exit |
|---|---|---|---|
| 0.1 | Username normal + duplicate flows on emulator | HUMAN | Both outcomes reported |
| 0.2 | Plan A Task 4: reconciliation update + final review | AGENT | Ledger cites flow evidence |
| 0.3 | Full signup → confirm-on-device → signin loop | HUMAN | Signed-in session on emulator |
| 0.4 | expo-doctor cleanup (react dedupe + patch alignment) | AGENT | `npx expo install --check` clean, verify green |

Dependency: 0.2 needs 0.1. 0.4 runs only after 0.2 commits (no tree churn mid-evidence).

## Phase 1 — Device proof (Plans B, C)

| # | Item | Owner | Exit |
|---|---|---|---|
| 1.1 | Maestro flows 01–04 on signed-in emulator | HUMAN | 4/4 PASS in device-evidence.md |
| 1.2 | Fallout triage (app/flow/environment per failure) | AGENT+HUMAN | Zero open FAILs or named deferrals |
| 1.3 | TalkBack traversal pass | HUMAN | Per-screen verdicts logged |
| 1.4 | Largest-text pass + scaling guard (already in test) | HUMAN | No clipped controls |
| 1.5 | Contrast spot-measure (6 pairs vs WCAG AA) | HUMAN | Table complete, FAILs fixed |
| 1.6 | Accessibility review packet sign-off | HUMAN | Reviewer signature + date |

Dependency: needs Phase 0 build (signed-in emulator). 1.2 fixes may force rebuild → re-run 1.1.

## Phase 2 — Links cutover (Plan D)

| # | Item | Owner | Exit |
|---|---|---|---|
| 2.1 | Serve assetlinks.json + fingerprint + Supabase allowlist | HUMAN | curl checks green (runbook) |
| 2.2 | Flip redirectTo to HTTPS (scheme fallback kept) | AGENT | Tests green, committed |
| 2.3 | HTTPS recovery device proof | HUMAN | Link opens app, not browser |

Dependency: needs Phase 0 (working build pipeline). Independent of Phase 1 — may run in parallel.

## Phase 3 — Observability (Plan E)

| # | Item | Owner | Exit |
|---|---|---|---|
| 3.1 | D5 decision (regions, subprocessors, adequacy) | HUMAN | beta-decisions.md DECIDED |
| 3.2 | PostHog sink + Sentry transport + consent wiring | AGENT | Tests green, committed |
| 3.3 | Dashboards, crash alert, live proof on internal build | HUMAN | Events observed, alert routed |

Dependency: hard-gated on 3.1. Independent of Phases 1–2 — may run in parallel once decided.

## Phase 4 — External gates (all HUMAN)

| # | Item | Owner | Exit |
|---|---|---|---|
| 4.1 | Alain signs security-review-packet (F1/F2 verdicts) | HUMAN | Signature + date |
| 4.2 | POPIA legal opinion (Marion + counsel) | HUMAN | Opinion attached |
| 4.3 | Penetration test commissioned + remediated | HUMAN | Report, zero critical/high open |
| 4.4 | RPO decision F2: accept / hourly dumps / PITR | HUMAN | Recorded in D1 |
| 4.5 | Internal-track build + Play listing | HUMAN | Track screenshot, cohort ≤50 + KPI date |

Dependency: 4.5 needs Phases 0–2 (signed build chain). Others independent — start anytime.

## Phase 5 — Gate review

| # | Item | Owner | Exit |
|---|---|---|---|
| 5.1 | Convene founder/tech lead/QA against beta-gate-review-checklist | HUMAN | Verdict: HOLD or SOFT LAUNCH |
| 5.2 | If SOFT LAUNCH: rota, rollback contact, KPI review date | HUMAN | Named in checklist |

Dependency: entrance criteria (decisions recorded, verify green on release commit, ledger consistent, no open Critical/High).

## Parking lot (acknowledged, unscheduled)

- Misleading fresh-install session notice ("could not be verified" with no session yet) — app-bug follow-up, low severity.
- Unverified assetlinks candidate fingerprints in Plan A ledger — Plan D re-verifies from Play Console; discard after.
- Weekly Stryker mutation run — config + CI exist; first report pending schedule.
