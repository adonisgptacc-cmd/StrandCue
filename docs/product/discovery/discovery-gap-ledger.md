# Discovery Gap Ledger (Discovery Only)

**Status: DRAFT DISCOVERY — NOT evidence, HUMAN REVIEW REQUIRED.** Missing
material is reported as absent. Contents of absent files are never
reconstructed here.

## 1. Missing files (verified absent from approved repo paths)

- `colourcare-batch-01.md` — **briefed but missing.** `wave3-brief.template.md`
  (Sub-wave 4A) tasks a 20–30-version colour-care batch (`ZA-COLOUR-NNNN`;
  Excellence, Feria, Olia, Nutrisse, ColorSilk, Koleston, Dark & Lovely, …).
  No such file exists under `docs/product/discovery/master-catalogue/` or
  anywhere else in the worktree. Colour-chemistry leads therefore have no
  discovery coverage at all.
- `strandcue-protocol.md` and `research-brief-context.md` — referenced as
  required pre-reads by the template's universal rules; absent from the repo
  (they lived in the external research workspace). Cited as unrecoverable
  context, not reconstructed.
- Per-category source registers / companion files outside the ten batches —
  none exist in approved repo paths. Each batch's OUTPUT 3 register is
  self-contained; no external register was found or assumed.
- `leavein-batch-02` — named in leavein OUTPUT 7 as a *planned* continuation,
  not a missing file. Recorded as planned, not due.

## 2. Unresolved discrepancies (all open for human review)

1. **289 subtotal has no source anchor** — zero hits repo-wide; recomputed 313. Do not cite 289.
2. **Shampoo 63 vs 62** — OUTPUT 1 claims 63; OUTPUT 2 holds 62 contiguous IDs. One phantom entry; no gap in the ID sequence to investigate.
3. **Masks 35 vs 37** — resolved as counting scope (§1 of reconciliation): 35 tabled, +`ZA-MASK-0040` (OUTPUT 7 continuation), +1 cross-batch mention. No missing row.
4. **Serum 43 tabled vs 30 in OUTPUT 6** — `ZA-SERUMOIL-0031`–`0043` lack candidate records; `-0043` is declared a duplicate of `-0003`.
5. **Conditioner uniform-identity claim** — "26 confirmed / 26 official sources" vs 13 homepage-only + 10 global listing pages + 3 explicit `global` market claims. Flagged, not carried forward.
6. **Feed URLs presented as product URLs** — heatprotect 12/12 and styling 32/32 "direct retailer URLs" are `catalogsearch` queries. No PDP captured.
7. **Selsun classification tension** — the shampoo batch tables Selsun 2.5% while its own conflict note calls it "a registered medicine in many markets". Quarantined here (`excluded_scope`); human to confirm SAHPRA standing.
8. **`ZA-CONDITIONER-0005` category mismatch** — a shampoo row inside the conditioner batch (source-flagged). Kept with a review note; never a capability.
9. **Near-duplicate pairs held separate** — Nilotiqa, Mielle standard, Palmers, Afri Pure cross-batch pairs differ only in variant/size wording; listed for human dedup, not auto-merged.
10. **Personal-use purchasing notes** — none found. The only "my hair" hits are product names ("Fix My Hair", "Nourish My Hair"). Nothing to quarantine as application evidence.

## 3. Quarantine list (`excluded_scope` with reasons in the backlog JSON)

- `ZA-SHAMPOO-0043`, `ZA-SHAMPOO-0044` — Selsun 2.5% (selenium-sulfide medicinal).
- `ZA-SHAMPOO-0060` — Rosemary Anti Fungal Shampoo (therapeutic claim).
- `ZA-INDUSTRIAL-0031` — Wahl Clini-Clip Disinfectant (disinfectant/device; also scope-excluded).
- `ZA-TOOL-0001`–`0017` — heated tools (non-cosmetic scope).
- `ZA-INDUSTRIAL-0001`–`0030` — industrial/salon equipment (non-cosmetic scope).
- Colour chemistry: zero OUTPUT 2 rows; coverage gap per §1 (colour-care batch missing).

## 4. Standing caveats

- Foreign-market manufacturer pages are never ZA evidence without explicit manufacturer proof.
- Retailer feeds and brand homepages never verify identity (all such rows are `identity_unverified`).
- Catalogue identity and single-day feed prices are not uniformly reliable; both claims are removed, not repeated.
- All 313 rows remain discovery leads. Nothing here is importable into intake, evidence, capability, bundle, or migration artifacts.

## 5. Validation hardening (2026-10-13; `packages/domain/src/discovery-backlog.ts`)

Resolved and locked by tests in `tests/domain/discovery-backlog.test.ts`:

- **Calendar validity is now a real check, not shape-only.** `validateDiscoveryDate(value, today)`
  (pure, exported) round-trips date parts through UTC: rejects `2026-02-31` and `2023-02-29`,
  accepts `2024-02-29`. The row schema enforces the same check; the builder calls the validator
  for every row against the `2026-10-12` cutoff. Injected-`today` semantics only — no wall-clock.
- **Timestamps are rejected where dates are required** (validator, schema, and builder). The table
  parser no longer truncates a timestamp to its date prefix; it surfaces the timestamp token so
  validation fails loudly.
- **Fingerprint case semantics are locked.** Brand/name/variant/size are identity-insensitive to
  case (normalization); temporary id, source batch, and source URL are case-significant. A test
  rebuilds all 313 rows from the ten batches and asserts every checked-in fingerprint is
  byte-identical, and a second test asserts no identity state or quarantine reason changed.
- **`possible_reformulation` is exercised synthetically** (zero real-data instances): normalized
  repeats with conflicting exact markers (`(New Formula)` vs `(Old Formula)`, `(v1)` vs
  `(v2 …)`) become `possible_reformulation`; identical, cosmetic-only (`long title variant`),
  or one-sided markers stay `duplicate_candidate`. All 5 real duplicates verified unchanged.
- **Selsun/medicinal/antifungal quarantine is locked with absence proof.** Seven synthetic name
  classes (Selsun, Nizoral, ketoconazole, selenium sulfide, anti-fungal, medicinal, therapeutic
  hair-loss) land in `excluded_scope` with a human-review reason, carry exactly the discovery key
  set, and contain no capability key or token.

Remaining gaps (open for human review):

1. `extractDate` still falls back to the cutoff date when a `lastChecked` cell holds no date at
   all — a fabricated date, not evidence. Human to fix the source cell.
2. One invalid date aborts the whole builder run (loud by design, never silent). Human to fix the
   source cell before the next catalogue batch.
3. A `possible_reformulation` notes-text signal on a row that is also a normalized repeat is still
   overwritten to `duplicate_candidate`. No real-data instance; listed so the signal loss is known.
4. Single-row version-conflict language in free text (e.g. "Version 1 vs Version 2") with no
   dedup collision is not classified as `possible_reformulation`.
5. No discovery record was promoted: the rebuild-vs-checked-in comparison proves all 313 identity
   states, quarantine reasons, and fingerprints are unchanged.
