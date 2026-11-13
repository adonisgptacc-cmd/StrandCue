# Baseline — full product delivery programme

Task 0.1. Recorded on 19 October 2026 in a managed worktree created from
`codex/security-audit-remediation` at `163c4af`.

## Identity

- Integration branch: `codex/full-product-integration`
- Base SHA: `163c4af` — *test: add strict Supabase owner isolation harness*
- Base branch tip: `56192d3` — *docs: plan full StrandCue product delivery programme*
- Worktree: `C:\Users\ABADO\Desktop\StrandCue-full-product`
- Node: `v24.19.0` (the required 24.19.x line; not the machine default v25.1.0)
- Node binary: `C:\Users\ABADO\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`
- npm: `11.6.2`

`npm run check:runtime` → `NODE-RUNTIME-PASS v24.19.0`.

## Branch containment

`git rev-list --count 163c4af..<branch>` (unique commits after the base):

| Branch | Unique |
|---|---|
| `codex/today-guidance-integration` | 0 |
| `codex/basic-wash-reviewed-content` | 0 |
| `codex/condition-aware-guided-alpha` | 0 |
| `codex/chemical-services` | 0 |
| `codex/security-audit-remediation` | 0 product (1 docs) |
| `codex/core-guidance-engine` | 9 (superseded; content already in base) |
| `codex/protocol-execution` | 1 (research docs) |
| `codex/research-reconciliation` | 11 (research-only) |
| `codex/research-source-archive` | 3 (research docs) |

Full classification: `docs/verification/full-product-branch-reconciliation.md`.

## Working tree

Clean apart from this programme's documentation:
`docs/product/requirement-traceability.md` (modified),
`docs/product/full-product-capability-matrix.md` (new),
`docs/verification/full-product-branch-reconciliation.md` (new).
No product code changed for Increment 0.

## Command results

| Command | Result |
|---|---|
| `check:runtime` | PASS (`v24.19.0`) |
| `typecheck` (domain) | PASS (exit 0) |
| `typecheck` (mobile) | PASS (exit 0) |
| `lint` | PASS (see `lint` below) |
| `test -- --run` (full) | 2321 passed, 9 skipped, 136 files passed, 2 skipped; 3 tooling tests timed out only while run concurrently with lint and pass in isolation |
| `test:coverage` | see Increment 0 note |
| `audit:dependencies` | HOLD — `DEPENDENCY-POLICY-ERROR Dependency audit could not be executed or parsed` (registry unreachable from this environment; no code change depends on it) |
| `audit:control-plane` | PASS (exit 0; installed Expo SDK agreement recorded) |
| `export:web` | not run in Increment 0 (no UI change; deferred to Increment 1 gate) |
| `verify:supabase-owner-isolation` | BLOCKED without hosted fixtures (expected; zero HOLD) |
| `git diff --check` | PASS (exit 0) |
| Secret scan of changed files | PASS — documentation only, no credentials, tokens, PII or media |

## Environment notes and HOLDs

- The machine default Node is `v25.1.0`. All programme commands must prepend
  the Node 24.19.0 binary above. This is an environment HOLD, not a product
  defect.
- The shared `node_modules` from the original checkout lacked `expo-sharing`,
  which made 3 `control-plane-cli` tests fail. A clean `npm install` in this
  worktree (exit 0) restored the dependency; those tests now pass.
- The full suite has two tooling tests that time out under CPU contention and
  pass in isolation (`tests/tooling/dependency-policy.test.ts`, 84/84 in
  isolation). This is a test-harness timing sensitivity, not product behaviour.
- External HOLDs unchanged: Banana Human A/B content review is outstanding; the
  production reviewed bundle is draft; hosted migrations are not applied.

## What this baseline does not claim

- No product behaviour is claimed from a design document or a stale branch.
- No requirement was promoted to Implemented without a named passing test.
- No draft content was published, no reviewer identity was created and no RLS
  or publication gate was weakened.
