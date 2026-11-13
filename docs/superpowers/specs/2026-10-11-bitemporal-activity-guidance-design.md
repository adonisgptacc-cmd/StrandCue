# Bitemporal Activity Guidance Design

## Intent

Today guidance must use the best activity history known when a request is made, while an old recommendation must remain reproducible after later corrections or voids. StrandCue therefore preserves two timelines:

- **Effective time:** when an activity or correction applies in the owner’s hair history.
- **Recorded time:** when StrandCue learned that information.

New guidance uses corrections known by the request cutoff and applies them to their effective dates. Replaying an old recommendation uses the normalized input stored with that recommendation run. Historical source inspection can also reconstruct what StrandCue knew at a supplied recorded-time cutoff.

## Goals

1. Load activity facts with an explicit effective date and recorded-time cutoff.
2. Exclude revisions that were not yet recorded at the cutoff.
3. Apply corrections and voids that were recorded by the cutoff according to the existing domain projection rules.
4. Paginate deterministically even when an activity is edited while a snapshot is loading.
5. Keep all reads owner-scoped and fail closed when any page or row is malformed, incomplete, or changes meaning during the read.
6. Store the exact normalized recommendation input and decision so recommendation replay never depends on mutable source tables.

## Non-goals

- Rewriting existing activity records or backfilling synthetic timestamps.
- Changing how owners create, correct, or void activities.
- Publishing recommendation rules or product capability mappings.
- Making Shelf, Tools, Passport, or chemical-service history bitemporal in this change.
- Deploying the migration to hosted Supabase as part of local implementation.

## User-visible behavior

Suppose an activity effective on 1 June is recorded on 1 June and corrected on 10 June:

- Guidance generated on 5 June keeps the exact original normalized input in its private recommendation run.
- A source snapshot with `effectiveAsOf=5 June` and `recordedAsOf=5 June` sees the original revision.
- New guidance generated on 11 June uses the correction because it was known by then, while the activity remains effective on 1 June.
- The correction never changes the stored input or decision of the 5 June recommendation.

If the activity is voided on 12 June, a snapshot whose recorded cutoff is before 12 June still sees the activity; one whose cutoff is on or after 12 June applies the void.

## Architecture

### Purpose-built guidance read

Add an owner-scoped RPC named `list_guidance_activity_histories`. It accepts:

- `p_effective_as_of date`
- `p_recorded_as_of timestamptz`
- `p_limit integer` constrained to 1–100
- `p_cursor jsonb` containing exactly `{baselineRecordedAt, activityId}` or null

The RPC returns `{items, nextCursor}`. Each item contains an activity ID and every revision for that activity whose `recorded_at <= p_recorded_as_of`, with the fields required by `ActivityRevisionSchema`. It does not project business meaning in SQL. The existing TypeScript `projectActivityHistory(revisions, {asOf})` remains the single projection implementation.

This avoids the current list-then-detail race and removes the N+1 activity-detail requests from Today.

### Stable pagination

Activities are ordered by the immutable baseline revision tuple `(baseline.recorded_at, activity_id)`, descending. The cursor uses that same tuple. Later corrections cannot move an activity between pages because they do not change its baseline timestamp. Activities whose baseline was recorded after `p_recorded_as_of` are excluded.

The RPC fetches `p_limit + 1` activity identities, returns at most `p_limit`, and sets `nextCursor` from the last returned identity only when another identity exists. All revisions for a returned identity are aggregated in ascending sequence order.

Add indexes that support the actual access path: a partial baseline index on `(owner, recorded_at desc, activity_id desc)` where `kind = 'baseline'`, and a revision lookup index on `(owner, activity_id, recorded_at, sequence)`. Existing rows use their existing `recorded_at` values; no earlier knowledge time is invented.

### Snapshot preparation

`loadGuidanceSnapshot` passes:

- `effectiveAsOf = asOf.slice(0, 10)`
- `recordedAsOf = loadedAt`

For every returned activity history, the mobile boundary validates the strict response schema and calls `projectActivityHistory`. Guidance receives only unambiguous primitive projected values. If projection reports ambiguous fields, the activity source is incomplete for guidance and the loader marks the source failed; it does not guess between candidates.

The snapshot records the projected revision count and the applied revision IDs needed to explain its source. It must never call the mutable current-state `getActivity` endpoint.

### Recommendation replay

The recommendation-run row remains the authority for reproducing an already generated decision. `input_fingerprint` is SHA-256 over the exact normalized `input` JSON sent to the engine, and that same input is stored in the row. Source reconstruction is for auditing and new generation; it is not substituted for the stored input during replay.

## Database security

- The public wrapper is `SECURITY INVOKER` with a fixed empty `search_path`.
- The private core is in `strandcue_private`, uses `SECURITY DEFINER` only to read protected rows, fixes `search_path = ''`, derives the owner from `strandcue_private.request_uid()`, and rejects a missing or inactive account.
- No owner ID is accepted from the caller.
- Revoke default execution from `PUBLIC`, `anon`, and `authenticated`; grant the public wrapper and the private core only as required by the repository’s invoker-wrapper convention.
- Validate dates, limit, cursor shape, cursor timestamp finiteness, and cutoff ordering. `p_recorded_as_of` must be finite and must not be later than the database transaction time, preventing a caller from treating future knowledge as recorded.
- Return no email, token, account metadata, or operation key. Correction and void reasons may cross this owner-only boundary because the domain revision validator requires them, but guidance preparation must not copy them into engine facts or recommendation-run input. Free-form activity notes are likewise excluded from guidance facts and stored recommendation input.

## Data contract

Each revision returned to the mobile client contains:

- `id`, `activityId`, `sequence`, `baseRevision`, `kind`
- `effectiveDate` reconstructed from the stored precision/value representation: `exact_day` becomes `{precision: 'day', value: 'YYYY-MM-DD'}`, `exact_month` becomes `{precision: 'month', value: 'YYYY-MM'}`, `exact_year` becomes `{precision: 'year', value: 'YYYY'}`, and `unknown` becomes `{precision: 'unknown', value: null}`
- `recordedAt`, `source`, and `patch`
- `correctsId` and `correctionReason` only for correction revisions
- `voidReason` only for void revisions

The mobile schema is a strict discriminated union matching the domain revision schemas. Unknown fields, missing fields, duplicate identities, broken sequences, invalid correction targets, and malformed dates fail the entire activity source closed. The guidance fact allowlist is `activityKind`, `precision`, and `status`; structured zones and free-form notes are not flattened or persisted as recommendation inputs.

## Failure behavior

- Authentication or inactive-account failures are returned as stable authorization errors.
- Invalid cursor, date, cutoff, or limit is rejected by the RPC.
- Any network, schema, projection, pagination, or ambiguity failure marks activities as `failed`; Today produces no guidance.
- Cancellation rethrows `AbortError` and does not convert it into an empty source.
- The 500-activity ceiling remains; reaching it marks activities as `truncated` and blocks guidance.

## Verification

Database integration tests must cover owner isolation, inactive accounts, exact cutoff boundaries, late corrections, late voids, stable pagination during later edits, strict cursors, bounded limits, grants, and absence of sensitive fields.

Cutoff tests insert fixed `recorded_at` values through the trusted test setup rather than depending on wall-clock timing. Pagination tests add a correction between page reads and prove the immutable baseline cursor neither duplicates nor skips an activity.

Mobile tests must cover schema validation, multi-page reads, correction-before/after-cutoff behavior, void-before/after-cutoff behavior, ambiguous projection failure, truncation, cancellation, and proof that Today no longer calls `getActivity`.

The complete Node 24 offline gate, dependency policy audit, migration inventory, PGlite migration suite, typecheck, lint, and coverage thresholds must pass before integration review.

## Delivery order

1. Implement and locally verify the bitemporal activity read.
2. Run a whole-branch integration and security review.
3. Keep the migration local until explicitly approved for hosted Supabase.
4. Begin a separate evidence project for exact product/tool versions and the first `basic_wash` publication bundle.

## Decisions made by the builder

- Use a new guidance-specific RPC instead of changing `get_activity`, preserving existing editor and activity-screen behavior.
- Use immutable baseline time for pagination rather than mutable activity `updated_at`.
- Keep projection logic in the TypeScript domain instead of duplicating it in SQL.
- Treat ambiguous activity projection as a blocking source failure for this milestone.
