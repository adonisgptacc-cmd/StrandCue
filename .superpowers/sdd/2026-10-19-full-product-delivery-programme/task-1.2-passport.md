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

## Boundaries honoured

- No invented values for existing records.
- Damage observation is self-reported, never a diagnosis.
- Unknown remains a valid answer for every new field.
- No reviewer identity, draft publication or RLS change.

## Remaining for Increment 1

- Task 1.3 My Hair overview and goal-specific completeness explanation.
- Task 1.4 device/offline Passport acceptance evidence.
- Zone-specific Passport facts (HP-04) beyond `naturalPattern: 'mixed'`.
