# Increment 2 baseline — owned products, catalogue matching and tools

Worktree: `C:\Users\ABADO\Desktop\StrandCue-full-product`
Branch: `codex/full-product-integration`
Starting HEAD: `b62c1645da09f7eada52ab2d44bd38b2d506963b` (Increment 1, approved)

## Starting gate (Node 24.19.x, 2026-10-19)

```
HEAD                    b62c1645da09f7eada52ab2d44bd38b2d506963b
branch                  codex/full-product-integration
working tree            clean (git status --porcelain → 0 lines)
node                    v24.19.0
npm run check:runtime   NODE-RUNTIME-PASS v24.19.0
npm run typecheck       exit 0
npm run lint            exit 0
npm run test:coverage   exit 0 — 141 files, 2440 passed, 9 skipped
npm run audit:control-plane  exit 0
git diff --check        clean
```

## Authorities read

- `AGENTS.md` — the project instructions live in the main checkout
  (`C:\Users\ABADO\Desktop\StrandCue\AGENTS.md`); this worktree has no
  tracked `AGENTS.md`.
- The programme plan is `.superpowers/sdd/2026-10-19-full-product-delivery-programme/`
  (`baseline.md`, `status.md`, `task-1.2-passport.md`). The path named in the
  Increment 2 order, `docs/superpowers/plans/2026-10-19-full-product-delivery-programme.md`,
  does not exist in this repository.
- `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` — SH-01…SH-09
  and TL-01…TL-06.
- `docs/superpowers/specs/2026-10-10-product-recovery-audit.md` — the
  product-recovery audit the canonical specification references.
- `docs/product/full-product-capability-matrix.md`,
  `docs/product/requirement-traceability.md` — current product status.
- `.superpowers/sdd/2026-10-19-full-product-delivery-programme/status.md` and
  the Increment 1 task reports with the final correction evidence.

## Code discovery

No code knowledge-graph server or index is configured in this worktree
(`.opencode/opencode.jsonc` declares no MCP server, and no graph index exists
on disk), so discovery was done by systematic inspection of the packages,
apps, tests and migrations listed below. This is recorded rather than
silently skipped.

## What already exists (preserved, not replaced)

### Database foundations

- Catalogue (read-only to consumers, seeded by reviewed migrations):
  `public.brands`, `public.products`, `public.product_versions` (variant,
  market, barcode, formulation_ref, structured_directions, ingredients,
  lifecycle `active|retired`, successor_version_id), `public.product_claims`,
  `public.product_sources`, `public.product_verification_events`. Consumer
  policies are `select ... using (true)` with no write path.
- Shelf: `public.user_products` (owner, version_id, manual_brand, manual_name,
  manual_category, availability, matched/matched_at/match_confirmed, revision,
  notes) and the append-only `public.user_product_revisions` (kinds
  baseline/change/correction/match/archive, effective dates, `match_version_id`),
  plus `strandcue_private.shelf_operations` for idempotent retries. RLS is
  enabled **and forced**; every mutation goes through the transactional RPCs
  `shelf_add`, `shelf_change`, `shelf_correct`, `shelf_match`, `shelf_archive`,
  `shelf_history`, `shelf_list`.
- Tools mirror the Shelf: `public.tools`, `tool_versions`, `tool_claims`,
  `tool_sources`, `tool_brands`, `tool_verification_events`, and the
  transactional tool RPCs.

### Domain and mobile

- `packages/domain/src/shelf.ts`: manual create/change/match/archive command
  schemas, claim-scoped verification, provenance, trust tiers, an explicit
  `confirmed: z.literal(true)` match boundary.
- `packages/domain/src/tools.ts`: the same command family plus tool type and
  capability taxonomies.
- `apps/mobile/src/shelf.tsx`, `shelf-editor.tsx`, `shelf-api.ts`,
  `shelf-drafts.ts`, `shelf-history.ts` and the matching tool modules exist
  and are wired into the app navigation.
- Suites already in place: `tests/domain/{shelf,tools}.test.ts`,
  `tests/mobile/{shelf,tools}.test.ts`, `tests/database/{shelf,tools}.test.ts`,
  plus catalogue intake and seed suites.

## Requirement-by-requirement status

| Requirement | State today | Gap for Increment 2 |
|---|---|---|
| SH-01 manual product + availability | Manual creation works; availability is `available|out_of_stock|archived` | `low` and `empty` states are absent; archive already appends history |
| SH-02 explicit catalogue match | `MatchUserProductCommandSchema` requires `confirmed: true`; `shelf_match` RPC exists | No consumer catalogue **search** surface and no result contract (brand, exact name, variant, market, version state) |
| SH-03 preserve manual identity + match history | `user_product_revisions` is append-only; `manual_*` columns are never overwritten by a match | The **edit** path cannot change owner-entered identity, and there is no consumer match-history view |
| SH-04 opened/expiry/PAO/quantity/repurchase | Absent | All five fields are absent from the domain, the table and the RPCs |
| SH-05 immutable product versions + states | `product_versions` is immutable (no update/delete policy) with `active|retired` and a successor link | `reformulated`, `superseded` and `withdrawn` states are not represented |
| SH-06 notify affected owners | Absent | Out of scope for Increment 2 unless the canonical spec demands it in this increment |
| SH-07 product facts (directions, order, wait, rinse, frequency, activation, incompatibilities, claims, evidence) | `structured_directions`, `product_claims`, `product_sources`, `product_verification_events` exist | No consumer detail surface; the reviewed-capability publication boundary is unexpressed in the app |
| SH-08 ingredients never become efficacy claims | `ingredients` is stored per version | No consumer surface yet, so no boundary to enforce in code |
| SH-09 discovery candidates are never verified facts | Absent (no OCR/photo import in this increment) | Not required by the Increment 2 outcome list |
| TL-01 tool identity, settings, units, attachments, condition | Brand/model/type/availability/notes exist | Settings, units, attachments and condition are absent |
| TL-02 heat-method taxonomy | Catalogue capability flags `contactHeat`/`airHeat` exist for reviewed versions | The owner's own tool record cannot state a heat method; `hood`, `steam` and `unheated` are absent |
| TL-03 no temperature inference from wattage/model | `ToolCapabilitiesSchema` keeps temperature explicitly unknown | The owner-facing path does not exist yet, so the rule has no surface to bind |
| TL-04 actual temperature, passes, duration, zones | Absent | Belongs with the Heat Coach increments (TL-05/TL-06 are explicitly later) |

## Plan

- **2.1** Shelf journey: forward-only migration for the availability states,
  the manual identity fields and the SH-04 fields; the domain command
  schemas; the editor, list and history surfaces; the read-side projection
  of those fields.
- **2.2** Catalogue search and explicit matching: a consumer search read
  contract that identifies the exact version, a candidate screen, explicit
  confirmation, and mismatch recovery that never erases the manual record.
- **2.3** Product detail and evidence: the reviewed/identity/owner-fact
  separation, unknown copy, and the publication boundary that keeps draft
  claims invisible.
- **2.4** Tools: the owner-facing settings, units, attachments, condition and
  the distinct heat methods.
- **2.5** Two-owner isolation harness extension and the device journey.

## Task 2.2 — catalogue search and explicit matching (20 October 2026)

Starting HEAD `c9006e9`; Node 24.19.0. SH-02 now has a consumer surface:
a read-only, bounded, deterministic identity-and-lifecycle search
(`catalogue_search`, migration `20261021120000_catalogue_search.sql`), exact
version candidates with unknown facts named, a side-by-side comparison with the
owner's record, an explicit confirmation through the unchanged `shelf_match`
command, and rematch through append-only history. Retired versions remain
matchable and are labelled retired.

Gates: check:runtime PASS; typecheck PASS; lint PASS; test:coverage PASS
(146 files passed, 3 skipped; 2781 tests passed, 11 skipped; 95.69 / 89.81 /
98.58 / 97.78); export:web PASS; audit:control-plane PASS; git diff --check
clean. **audit:dependencies is a HOLD** (`RUNNER-REVIEW-DRIFT`, exit 1), not a
pass. Hosted owner isolation and real two-session PostgreSQL concurrency stay
external gates. Full evidence:
`.superpowers/sdd/2026-10-19-full-product-delivery-programme/task-2.2-catalogue-search-and-matching.md`.

## Task 2.3 — product details, evidence and the publication boundary (20 October 2026)

Base `95706b0`; Node 24.19.0. The catalogue had no publication state: consumers could read draft claims,
sources, verification events (with reviewer names) and every version's directions and ingredients directly,
and the owner export embedded them. The new migration `20261022120000_product_detail_publication.sql` adds
explicit publication (nothing published), a content-bound two-person review, immutability guards, a
read-only role behind one allowlisted definer core, and gates the export. The detail screen shows exact
identity, version status, reviewed directions, claim-scoped evidence, label-only ingredients and the owner's
private record separately, with a distinct sentence for every reason a section is empty.

Gates: check:runtime PASS; typecheck PASS; lint PASS; test:coverage PASS (151 files passed, 3 skipped;
2898 tests passed, 11 skipped; 95.8 / 89.98 / 98.65 / 97.83); export:web PASS; audit:control-plane PASS;
git diff --check clean. **audit:dependencies is a HOLD** (`RUNNER-REVIEW-DRIFT`), not a pass. SH-07 and
SH-08 stay Partial because no directions, claims, evidence or ingredients are published. The tools export
still embeds whole tool catalogue rows (follow-up, Task 2.4). Full evidence:
`.superpowers/sdd/2026-10-19-full-product-delivery-programme/task-2.3-product-details-and-evidence.md`.

## Task 2.4 — My Tools and the tool catalogue publication boundary (21 October 2026)

Base `50f6311`; Node 24.19.0. Owner facts (three-state: never answered, taken back, recorded or explicit
unknown), settings with units, attachments, condition and distinct heat methods; an append-only trusted write
boundary with idempotent operations, corrections that must change the identity, and explicit confirmed matches;
a publication boundary for the tool catalogue (nothing published, two-person content-bound review, immutability
guards, a read-only role behind one allowlisted core); export v4 with no raw catalogue rows. Migrations
`20261023120000_tool_owner_facts.sql` and `20261023130000_tool_catalogue_publication.sql` are new and no
existing migration was edited.

Gates: check:runtime PASS; typecheck PASS; lint PASS; test:coverage PASS (163 files passed, 3 skipped; 3137 tests
passed, 11 skipped; 95.89 / 90.4 / 98.46 / 97.9); export:web PASS; audit:control-plane PASS; git diff --check
clean. **audit:dependencies is a HOLD** (`ADVISORY-UNEXCEPTED`, `RUNNER-REVIEW-DRIFT`), not a pass. Full evidence:
`.superpowers/sdd/2026-10-19-full-product-delivery-programme/task-2.4-my-tools-and-publication.md`.

## Environmental HOLDs (recorded, never presented as passes)

- `audit:dependencies` cannot reach the npm registry in this environment —
  dependency auditing is a **HOLD**, never a pass.
- No isolated disposable Supabase test project is configured, so
  `verify:supabase-owner-isolation` and the account-dependent device rows stay
  **HOLD/BLOCKED** with evidence, and PGlite cannot prove real PostgreSQL
  concurrency.
- Device rows that need accounts and a backend stay BLOCKED; local and
  PGlite gates are run instead.
- The Banana shampoo/conditioner review remains pending: no capability,
  direction, claim or reviewer identity from it may be published or
  transcribed.
