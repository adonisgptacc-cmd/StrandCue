# Task I5.1 report — canonical confirmed care-event ledger

## outcome

Task I5.1 is complete on top of `f3f60e0`. It adds an internal pure domain ledger for confirmed wash, application and heat events. Task I5.2 was not started.

## interruption recovery and correction round

OpenCode timed out with four uncommitted files and three failing focused tests. The first root cause was an activity with an unknown effective date: the general as-of projector correctly marked timing uncertain, while the ledger incorrectly treated that as ambiguity in the recorded activity kind. The ledger now preserves a single recorded fact while keeping the date unknown.

Independent reviews then found that the interrupted implementation counted substituted and modified steps, emitted corrected and voided activity audit rows, and changed a wash occurrence's identity and date after metadata corrections. These behaviors contradicted the canonical Increment 5 plan and were corrected with regression tests.

## final boundary

- Only a timestamped `confirmed` execution step can produce an execution event.
- Confirmed wait, rinse and leave-in steps require an explicit `none` classification and produce no care event.
- Corrected history and voided activities do not enter the active canonical ledger.
- An activity's event identity and occurrence date stay tied to its baseline while current corrected facts may update its visible fields.
- Unknown and approximate precision remain unknown or approximate; no clock supplies an event date.
- Heat method, temperature, setting, passes, duration, zones and attachment stay independently known or unknown. Wattage and tool identity never imply temperature.
- Source inputs are bounded, strict, immutable and owner-consistent. Classification rows bind to the exact execution and recommendation run.
- The module is intentionally absent from `packages/domain/src/index.ts`. I5.4 must construct source envelopes from an authenticated owner-scoped server join; client/API construction is forbidden and remains a mandatory security review gate.

## verification

- Node runtime: 24.19.0
- Focused care-event suite: 46 passed
- Full coverage: 191 files passed, 5 skipped; 4057 tests passed, 22 skipped
- Global coverage: 96.03 statements / 90.44 branches / 98.22 functions / 97.88 lines
- `care-events.ts`: 95.16 statements / 89.28 branches / 100 functions / 95.88 lines
- Root and mobile typecheck: passed
- Lint with zero warnings: passed
- Independent correctness and security/privacy re-reviews: no Critical, High or Medium findings

## requirement status

- TR-01: Partial — confirmed event truth and exclusions are proven; named-unit counting and authenticated persistence integration remain.
- TR-02 to TR-08: Not started.
- TL-04: remains Partial with added confirmed-event preservation evidence.

## holds and limits

- Dependency audit remains a HOLD from I5.0 and must be rerun and reported separately.
- Hosted owner isolation, hosted migrations, real-database UI and device/screen-reader acceptance were not run.
- No production treatment rule, product capability, reviewer identity or catalogue evidence was invented or published.
- Nothing was pushed, merged, deployed or applied to hosted services.
