# Task 1.2 — complete the structured Hair Passport (condition and length facts)

Status: implemented and verified for the domain, database and editor layers.
Zone-specific facts and a goal-based completeness explanation remain open
(Task 1.3 / HP-04).

## RED

`tests/domain/passport.test.ts` — 5 new tests, command:

```
node node_modules/vitest/vitest.mjs run tests/domain/passport.test.ts
```

Result: `Tests 5 failed | 6 passed (11)` — the new fields were rejected by the
strict Passport schema.

## GREEN

- `packages/domain/src/passport.ts` — added unknown-aware
  `damageObservation`, `heatPreference`, `lengthUnit`, `lengthPrecision`,
  `lengthMeasuredOn` and `reactionsAvoidances`, and registered them in
  `PASSPORT_FIELDS`. Omission, `unknown` and a recorded value stay distinct.
- `supabase/migrations/20261019120000_passport_condition_length_fields.sql` —
  forward-only replacement of `strandcue_private.validate_passport` that
  whitelists and normalises the new fields. Existing patches are unaffected:
  omitted keys simply remain absent, so no old record gains an invented value.
- `apps/mobile/src/passport-editor.tsx` — the editor now captures length,
  length unit/precision, measurement date, self-reported damage, heat
  preference and known reactions/avoidances. Empty optional text is removed
  rather than written as `undefined`.

`tests/domain/passport.test.ts` → `11 passed`.
`tests/database/passport.test.ts` → `40 passed` (proves the migration applies,
round-trips the new facts and rejects invented/out-of-bounds values).

## Verification

```
node node_modules/vitest/vitest.mjs run \
  tests/domain/passport.test.ts tests/database/passport.test.ts \
  tests/tooling/product-authority.test.ts tests/mobile/navigation.test.tsx \
  tests/mobile/accessibility.test.ts tests/mobile/owner-switch.test.tsx
→ Test Files 6 passed; Tests 69 passed
mobile typecheck → exit 0
git diff --check → exit 0
```

## Correction round (v2) — aligned measurement contracts

The first implementation recorded length as `lengthCm` plus separate
`lengthUnit`/`lengthPrecision`/`lengthMeasuredOn` fields. That shape could
contradict itself (`lengthCm: 42` alongside `lengthUnit: "in"`) and mixed
centimetres and inches in one entry. The delivery is amended in place:

- `packages/domain/src/passport.ts` — a single structured
  `lengthMeasurement` object `{value, unit: 'cm' | 'in', precision?,
  measuredOn?}` replaces the split fields. `precision: 'unknown'` stays
  distinct from omitted precision; `measuredOn` requires a value; numeric
  bounds reject zero, negative, non-finite and values above the documented
  MAX_LENGTH_CM = 300 after inch conversion (×2.54); legacy numeric
  `lengthCm` stays read/replay-only — new patches may only set
  `lengthCm: null`, and `rejectMixedLengthFields` forbids mixing a legacy
  centimetres number with a new measurement. Schema transformations are
  immutable.
- `supabase/migrations/20261019120000_passport_condition_length_fields.sql`
  — amended in place per repo policy (the migration was never applied on a
  hosted database). The validator mirrors the TS accept/reject matrix
  (calendar-day checked dates, jsonb precision enum, 300 cm bound, mixed
  field rejection) without touching grants, policies or old-row defaults.
  `tests/database/migration-inventory.test.ts` registers the migration in
  the promotion-boundary list.
- `apps/mobile/src/passport-editor.tsx` — unit-gated measurement capture
  (unit choice reveals value/precision/date fields), validation messages
  for missing unit or value, non-positive numbers, the 300 cm bound and
  non-calendar dates, an explicit-null clear action, a legacy retirement
  notice plus same-save `lengthCm: null` emission. Heat styling keeps plain
  "personal choice, not a safety rule" wording; damage observation keeps
  self-reported cosmetics wording. `apps/mobile/src/ui.tsx` `Choice` gained
  an optional human-friendly labels map.

TDD evidence (Node 24.19.x, worktree only):

```
tests/domain/passport.test.ts        → 25 passed
tests/database/passport.test.ts      → 43 passed
tests/database/migration-inventory.test.ts → 3 passed
tests/mobile/passport-editor.test.tsx → 28 passed
tests/mobile/** (full suite)          → 674 passed
root + apps/mobile typecheck           → exit 0
```

The editor suite runs RED→GREEN on the unit-gated capture, per-unit field
labels, explicit-null clearing, validation messages, legacy retirement,
safe retry from a device draft, draft discard, revision-conflict review
flow, correction with reason, reload from stored projection, per-owner
draft isolation and accessibility labels for every new control. Coverage
floor for `apps/mobile/src/passport-editor.tsx` added to
`vitest.config.ts` with all four metrics above 80%.

## Review reconciliation (v3)

Three fresh reviews covered this change: a code review, a database /
security review and a mobile accessibility review. Every Critical, High
and Medium finding is fixed; no Low was silently dropped.

- High / DB Medium (same seam): the TypeScript submission schemas accepted
  a numeric `lengthCm` write the SQL validator refuses, and correcting a
  legacy revision without recording a length was a dead end that only
  answered as `invalid-passport`. `packages/domain/src/passport.ts` now
  splits the boundary: `PassportSchema` / `PassportPatchSchema` (and the
  editor, which pre-flights the same case with plain retirement guidance)
  refuse new numeric writes, while new `PassportReadSchema` /
  `PassportPatchReadSchema` keep stored legacy history replaying verbatim
  (`history.ts` reads through the read variants).
- Medium (both reviews, same seam): the no-mixing guarantee was enforced
  patch-locally only, so an API caller could project one structured length
  beside a still-recorded legacy centimetre value. The migration now adds
  a record-level `BEFORE INSERT` guard on `passport_revisions` that
  recomputes the would-merge state from all recorded history and refuses
  a measurement whose patch does not also retire the legacy value, and —
  because a validator is immutable and cannot consult a clock — carries
  the measuredOn "never after today" rule that the submission boundary
  already enforces.
- Medium: the editor reproduced a stored measurement through a string
  draft, dropping the explicit `measuredOn: null` state and comparing
  whole objects by `JSON.stringify`, so PostgreSQL's normalised jsonb key
  order could turn an untouched save into a no-op change. The draft now
  carries `dateKnownNull` (the null state survives a round trip), and
  `apps/mobile/src/contracts.ts` compares values with an order-stable
  serialiser, so a value that round-trips through the database is never
  mistaken for a change and unchanged measurements are not re-emitted.
- Medium: the projection field-order catalogue in
  `project_passport` had drifted from the domain field list (no later
  migration had replaced the foundation definition). The migration
  restates the function with the four post-foundation keys added; the
  projection-parity tests continue to pass against the domain replay.
- Low findings: the two numeric casts inside the validator are wrapped in
  `begin...exception -> invalid-passport` (PostgreSQL's numeric parser
  itself rejects beyond-double literals at the JSON boundary with a clean
  SQLSTATE 22003 data exception, which is now the documented and tested
  boundary); the unit check is hoisted above the value casts; the
  unreachable patch-local mixing check is removed (the record-level guard
  supersedes it); the future-day bound on `measuredOn` is enforced in the
  domain and editor; the database test file ends with a final newline.
- Accessibility review findings were fixed in the previous round and are
  asserted by the editor suite (alert-role messages, humanised conflict
  review, checked-state goal toggles, character counter, field labels
  that cannot be silently dropped).

Fresh evidence after reconciliation (Node 24.19.x, worktree only):

```
tests/domain/passport.test.ts        - 26 passed (write/read boundary, future date)
tests/domain/history.test.ts         - 14 passed (legacy replay through read schemas)
tests/database/passport.test.ts      - 46 passed (record-level guard, JSON boundary, legacy history)
tests/database/migration-inventory.test.ts - 3 passed
tests/mobile/passport-editor.test.tsx      - 33 passed (pre-flight, null state, no-op refusal, future date)
tests/mobile/** (full suite)          - 677 passed
root + apps/mobile typecheck           - exit 0
eslint                                  - clean
```

## Boundaries honoured

- No invented values for existing records.
- Damage observation is self-reported, never a diagnosis.
- Unknown remains a valid answer for every new field.
- No reviewer identity, draft publication or RLS change.

## Remaining for Increment 1

- Task 1.3 My Hair overview and goal-specific completeness explanation.
- Task 1.4 device/offline Passport acceptance evidence.
- Zone-specific Passport facts (HP-04) beyond `naturalPattern: 'mixed'`.
