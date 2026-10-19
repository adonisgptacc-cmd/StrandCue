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
