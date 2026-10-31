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

## Length invariant correction (v4)

Increment 1 failed final integration review: the record-level length guard
had a High-severity blind spot.

### What the review found

The guard asked the projection `project_passport(...,'infinity')->'values'->
'lengthCm'` whether a legacy numeric centimetre length was still current.
The projection is a presentation view: a legacy length whose effective date
is unknown, or two legacy lengths whose effective intervals overlap and
disagree, is reported under `ambiguousFields` instead of `values`. The
guard therefore saw no legacy length and accepted a structured
`lengthMeasurement` append without `lengthCm: null` - a record could
then hold a structured measurement and a still-recorded legacy centimetre
length at the same time.

### RED evidence (both newly discovered bypasses)

``
tests/database/passport.test.ts
  - refuses a structured measurement while a legacy length has an unknown effective date
      AssertionError: promise resolved "{ revision: 3, ...(2) }" instead of rejecting
  - refuses a structured measurement while legacy length entries conflict
      AssertionError: promise resolved "{ revision: 4, ...(2) }" instead of rejecting
  - keeps another owner unable to influence or inspect the length decision
      AssertionError: promise resolved "{ revision: 3, ...(2) }" instead of rejecting
  - lets a correction replace the legacy length with a structured measurement
      error: invalid-passport
tests/mobile/passport-editor.test.tsx
  - retires an ambiguous legacy centimetres entry in the same save
      AssertionError: expected undefined to be null
  - explains an ambiguous legacy length without inventing a number
      AssertionError: expected 'Record a change | ...' to match /earlier entry/i
``

The first two are the two bypasses the review named; the third shows the
first owner's decision was influenced by another owner's writes, the fourth
is a self-review finding (a correction that replaces the legacy entry with
a measurement was wrongly refused), and the last two are the client-side
consequences of the same blind spot.

### The invariant, as enforced now

If any unsuperseded numeric legacy `lengthCm` remains recorded for that
Passport, a new structured `lengthMeasurement` is rejected unless that
same append explicitly retires the legacy field with `lengthCm: null` - and
the retirement has to be one the projection keeps: an explicit null that
follows the earlier entry. A retirement dated before or inside the earlier
entry's own interval would leave that entry as the record's current length
next to the new measurement, so the guard refuses that append too. An
earlier entry the record cannot place in time stays an uncertain entry
rather than a current one, so a retirement of it is accepted and the record
keeps reporting it as uncertain until it is corrected.

The guard reads the owner's stored length facts directly - the unsuperseded
revisions carrying a numeric `lengthCm`, minus the ones a later length fact
definitely replaces - which is the same selection the projection performs
at an unbounded date, read from the facts instead of the presentation
split. A legacy length the projection can only report as ambiguous is still
seen. A correction of the legacy entry itself replaces that entry, so the
length it replaces is not recorded any more after that append. The guard
also refuses a patch that carries a numeric `lengthCm` next to a
measurement, whoever writes it.

### The lock

`strandcue_private.mutate_passport` already locks the owner's
`public.hair_passports` row `for update` before it appends (the
foundation migration, unchanged), so two appends for the same owner through
the public write path are serialized: the second waits for the first to
commit and, because the guard's read is a statement inside that transaction
under PostgreSQL's read-committed snapshot, it sees the first append's
facts. The guard takes no lock of its own, so it adds no privilege
requirement to any insert path - which also means a direct privileged
`INSERT` into `passport_revisions` is not serialized by it. PGlite runs a
single connection, so a literal two-transaction race cannot be executed in
this harness: the lock contract is asserted from the function definition,
and the behaviour that depends on it - a later append reading the facts an
earlier append wrote - is asserted by the retirement cases, which are
sequential appends on one connection, not a race.

### Reviews and what they changed

Two fresh reviews covered the correction: a code review and a database /
security review. Their findings are fixed below, and a re-review of the
corrected snapshot found more - a Critical, two High and four Medium - which
are fixed in turn and listed in the second round below.

- **High (database review): a backdated retirement left two current
  lengths.** `lengthCm: null` was treated as a retirement by the guard
  but as a competing fact by the projection: a retirement dated before the
  earlier entry left that entry as the record's current length next to the
  new measurement, with no ambiguity marker, reachable from the editor's own
  date field. The guard now requires the retirement to be one the projection
  keeps - an explicit null that follows the earlier entry - and the editor
  checks the same condition before it saves, with a plain message instead of
  a server refusal. Asserted by the refusal cases for a retirement dated
  before and inside the earlier entry's interval.
- **High (code review): the notice promised a retirement the record could
  not perform.** The screen said the save "retires that old entry" even
  where the earlier entry stays visible as an uncertain entry. The notice is
  now built from one shared helper that states what the save does, names
  both numbers when two earlier entries conflict, and says that only
  correcting that entry clears it for good.
- **Medium (code review): the guard read "recorded" as "current at today"**,
  which was narrower than the old trigger and than the stated invariant: a
  legacy length dated in the future would have been invisible. The guard now
  reads the record as of an unbounded date, like the projection it mirrors,
  and the future-dated case is asserted.
- **Medium (code review): the goal list and the overview could disagree**
  about whether a length is recorded. Completeness now reads the same
  projection the overview reads, so an ambiguous earlier length counts as
  recorded in both.
- **Medium (code review): the lock comment asserted more than it proved.**
  The comment now states that the write path's row lock is what serializes
  appends, that the insert is a separate statement in a volatile function
  taking a fresh read-committed snapshot, and that the guarantee depends on
  those two properties.
- **Medium (database review): the guard's own `for update` added a
  privilege requirement to every insert path** and was a no-op on the only
  client path. It is removed: the guard now relies on the write path's
  existing lock, which is the narrowest lock there is, and adds no privilege
  requirement anywhere.
- **Medium (database review): a privileged writer could insert a mixed
  patch** (a numeric `lengthCm` next to a measurement), because the
  whitelist validator only runs inside the write path. The guard now
  refuses that patch too, whoever writes it.
- **Medium (database review): the concurrency test asserted a regex over
  two function bodies.** It is renamed to what it is - a structural
  assertion of the lock the write path declares - and points at the
  retirement cases that assert the behaviour the lock guarantees.
- **Medium (database review): one test did not assert the post-state it
  described.** The post-state assertions are now in place for the undated
  case as well.
- **Low (code review): the notice mis-described the overlapping reason.**
  The reason and the candidate numbers now travel with the fact, so the
  copy distinguishes an entry the record cannot place in time from two
  entries that record different lengths.
- **Low (code review): the client was stricter than the database for a
  correction of a legacy entry** (it attaches a retirement the database
  does not need). Both accept the payload; the difference is recorded here
  rather than changed, because the retirement is what the screen's own
  notice promises.

### The re-review round

The re-review of the corrected snapshot found one Critical, two High and
four Medium. All of them are fixed:

- **Critical: the record could still end up with two current lengths.** The
  guard read the record before the append, but a correction of a *retirement*
  supersedes the fact that had replaced the earlier length, so the earlier
  length became current again - next to the new measurement, with no
  ambiguity marker, through the public API and the app's own correction
  screen. The guard now excludes the entry the append corrects from the set
  of facts that can replace an earlier length, and the screen checks the
  same condition. Asserted by a regression test that corrects a retirement.
- **High: the editor crashed on a record whose history holds an entry the
  record cannot place in time** (a future or impossible date in stored
  history), because the interval helper validates and throws. The screen now
  reads such an entry as one it cannot place, so the screen opens and the
  only remedy - correcting that entry - stays reachable.
- **High: a save failed silently** when the owner typed an impossible
  effective date on a record that holds an earlier length: the check ran
  before the date was validated, so the promise failed and no message was
  shown. The date is now validated first, and the plain message answers.
- **Medium: the guard was one-directional** - a privileged writer could
  still write a new legacy number next to a measurement the record already
  held. The guard refuses that patch too, whoever writes it.
- **Medium: the two client helpers read the same history differently** (one
  applied the "a later length fact replaces it" rule, the other did not), and
  the test named for the already-retired case used a fixture with no
  revisions, so it never exercised the case it claimed. Both helpers now
  read the history the way the database reads it, and the fixture is real.
- **Medium: the notice pointed at a remedy the screen could not perform** -
  correcting an earlier entry also needs the length that replaces it. The
  copy now says so.
- **Medium: the delivery record asserted things the code did not do** (a
  guard lock that no longer exists, findings claimed fixed before they
  were). This section is the corrected record.
- **Low findings**: the stale duplicated comment above the length helper is
  gone, the shared sentence no longer says "below" (the overview has no
  length field below it), the reason for an uncertain length is used to
  describe it, and the migration comment says the guard reimplements the
  projection's selection rather than mirroring it.

### The last re-review round

The final re-review found no Critical and no High; it found three Medium
and four Low, all now fixed:

- **Medium: the screen refused a correction the database accepts.** The
  screen still treated the entry a correction replaces as an earlier entry
  the record holds, so it demanded a date after the entry it was replacing.
  The screen now reads the entry the append corrects the way the database
  reads it.
- **Medium: the screen sent a payload the database always refuses for an
  earlier entry dated in the future**, and said nothing about it. The screen
  now reads a stored date as the record holds it, refuses the save with the
  reason, and names correcting that entry as the only way to replace it.
- **Medium: this record still claimed the guard takes a row lock.** It does
  not; the paragraph is corrected above, including what a direct privileged
  insert does not get.
- **Low**: the shared sentence now fits the correction screen as well; the
  ambiguous-field argument is optional everywhere it is read; the task list
  in this record no longer lists work that is done; and the dependency
  policy test's load timeout is recorded as an environment limit.

### The last review round

A focused review of the client-side corrections found no Critical, one High
and two Medium, all now fixed:

- **High: a record whose stored history holds a date the write path would
  refuse could not be opened at all.** The read path used the same date
  schema as the write path, so a stored future or impossible date made the
  loader fail and locked the owner out of their own record with a
  connectivity message. The domain now reads a stored date as the record
  holds it - the write path keeps refusing a date that is not a real
  calendar value or that lies in the future - so the record opens, the
  earlier entry is shown, and the correction that replaces it stays
  reachable. The projection excludes such a future entry from the current
  state, as it always did.
- **Medium: the overview spoke about a save it never performs.** The
  read-only overview printed the editor's save sentence, and printed it
  exactly when the record had no current length to show. The overview now
  uses the read-only wording.
- **Medium: the editor refused an unrelated change the database accepts.**
  The checks ran against the whole form, so a stored legacy length the
  owner was not touching blocked any other edit. They now run against the
  patch the save would send.
- **Low**: the migration comment describes the measurement branch the way
  the code reads it; the stored-date reader no longer needs a cast, so a misuse of
  the exported helper shows up in the type checker; and the carried HOLD lists
  every file that times out under full-suite load.

### The final review round

The last review found no Critical, one High, one Medium and five Low, all
now fixed:

- **High: the read path still applied the write path's rules to a stored
  measurement date**, so a record whose measurement was dated after today -
  or on a day that does not exist - still could not be opened and the owner
  was still locked out. The stored measurement is now read as the record
  holds it, and the boundary is tested through the loader itself
  (`tests/mobile/passport-record-schema.test.ts`), not through a
  hand-built record.
- **Medium: the read-only overview claimed the record keeps one current
  length** - in the only state where it renders, which is the state where
  the record cannot say which length is current. The overview now says
  what is true, and the shared sentence no longer carries a stray
  separator.
- **Low**: the overview labels the ambiguous length "Length" rather than
  the raw key; the delivery records describe the stored-date rule as it is
  implemented; and the type checker, not a cast, guards the stored-date
  reader.

### Preserved

Append-only history, owner isolation, legacy history readability,
correction and supersession behaviour, the future-dated `measuredOn`
rejection, the public EXECUTE revocation, and no rewrite or deletion of
historical revisions - each asserted by a named test.

## Remaining for Increment 1

- Zone-specific Passport facts (HP-04) beyond `naturalPattern: 'mixed'`.
- Task 1.3 (My Hair overview and goal-specific completeness) and Task 1.4
  (device acceptance evidence) are done: `757d344` and `1a570bb`.

## Carried HOLD

- Under full-suite parallel load these files time out and pass in isolation:
  `tests/tooling/dependency-policy.test.ts` (it invokes a real `npm audit`),
  `tests/tooling/verify-android-artifact.test.ts`,
  `tests/website/site-security.test.ts` and, under the heaviest load, the
  PGlite setup hooks of a few `tests/database/*` files. The set varies
  between runs; it is an environment limit, not a change in this correction.
- `audit:dependencies` cannot reach the registry in this environment, so it
  stays a HOLD and is never reported as a pass.
