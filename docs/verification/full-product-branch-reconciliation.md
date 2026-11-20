# Full product branch reconciliation

Reconciliation of every active StrandCue branch against the integration base
`codex/security-audit-remediation` at `163c4af` (19 October 2026).

Method: `git rev-list --count <base>..<branch>` for unique commits,
`git diff --shortstat <base> <branch>` for content divergence, and file-level
inspection for anything not already present in the base. No branch was merged
wholesale. Only a reviewed selective port would change product files, and none
was required for Increments 0–2.

## Result

| Branch | Tip | Unique commits vs base | Diff vs base | Classification |
|---|---|---|---|---|
| `codex/security-audit-remediation` | `56192d3` | 0 product; 1 docs | base + plan doc | **Contained** (base of record) |
| `codex/today-guidance-integration` | `d7add92` | 0 | 256 files, mostly deletions | **Contained** (ancestor) |
| `codex/basic-wash-reviewed-content` | `7460751` | 0 | 199 files, mostly deletions | **Contained** (ancestor) |
| `codex/condition-aware-guided-alpha` | `a8ee7b7` | 0 | 192 files, mostly deletions | **Contained** (ancestor) |
| `codex/chemical-services` | `4edc346` | 0 | 503 files, mostly deletions | **Contained** (ancestor) |
| `codex/core-guidance-engine` | `67d2fd0` | 9 | 472 files, mostly deletions; recommendation engine diff is 7 lines | **Superseded** — content already in base under different SHAs; no port |
| `codex/protocol-execution` | `9d511aa` | 1 | adds extended research archive docs only | **Research-only** — no product code |
| `codex/research-reconciliation` | `2f45dc2` | 11 | adds research reconciliation scripts/tests/docs; base is ahead on security/acceptance work | **Research-only / pending review** — not required for Increments 0–2; porting would reintroduce superseded security files |
| `codex/research-source-archive` | `242cb35` | 3 | research source docs only | **Research-only** |

## Evidence for the superseded branch

`codex/core-guidance-engine` has 9 commits not reachable from `163c4af`
(`0375d50` … `67d2fd0`), but its tree is older than the base:

- `git diff 163c4af codex/core-guidance-engine -- packages/domain/src/recommendations`
  is 7 lines, i.e. the audited recommendation engine that branch introduced is
  already present in the base.
- `git diff 163c4af codex/core-guidance-engine -- apps/mobile/src/navigation.ts`
  is empty, i.e. product destinations already exist in the base.
- The branch is behind on 103,188 lines of security, guidance, execution and
  acceptance work. Merging it would delete base work.

Conclusion: **do not merge**. No selective port is needed.

## Evidence for research branches

- `codex/protocol-execution`'s only unique commit (`9d511aa`) adds
  `research/researchstrandcue-2026-10-14/` documents and a manifest.
- `codex/research-reconciliation` adds deterministic research reconciliation
  scripts and tests, but its diff also *removes* current CI, security,
  acceptance and dependency-policy files that the base keeps. Porting it
  wholesale would weaken the security baseline.
- `codex/research-source-archive` adds product research source batches.

These remain draft research input. Per programme decision 5 they may only enter
moderation; they cannot publish facts, capabilities or rules.

## Protected artefacts

The Banana shampoo/conditioner Human A/B packet, reviewer placeholders and
draft publication status are unchanged. Reconciliation touched documentation
only. Evidence status is recorded in
`baseline.md` and `full-product-capability-matrix.md`.

## Cross-branch mechanism normalization

The GitHub workflows and `.assistant/tooling/external-claims.json` differences
observed on `codex/research-reconciliation` are mechanism files, not product
work. They are deliberately **not** ported here; the security baseline keeps
its own reviewed versions.
