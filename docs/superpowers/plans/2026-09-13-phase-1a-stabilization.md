# Phase 1A Engineering Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make StrandCue's development baseline reproducible under Node 24, lint-enforced, dependency-policy-aware, Android-only, and ready for the Phase 1B product work.

**Architecture:** Add small, independently tested policy modules for runtime and dependency auditing, then make one root verification command the canonical local and CI gate. Keep security exceptions machine-readable, make Android-only scope explicit in configuration and authoritative documents, and treat host/worktree cleanup as verified local operations rather than application changes.

**Tech Stack:** Node.js 24, npm workspaces, TypeScript 7, Vitest 5, ESLint 10 with `eslint-config-expo` 57, Expo SDK 57, React Native 0.86, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-phase-1-delivery-design.md`

## Global Constraints

- Use Node 24 for every release-evidence command; Node 22, 25, 26, and later majors are unsupported for Phase 1.
- Preserve the pinned Expo SDK 57 dependency set unless `npx expo install --check` or `npx expo install --fix` identifies a compatible correction.
- Never run `npm audit fix --force`.
- Critical and high production advisories always fail verification.
- A moderate production advisory passes only with a complete, unexpired exception matching its GHSA identifier.
- Android and web are the only configured Phase 1 platforms; iOS work is outside Phase 1.
- The Phase 1 Android beta candidate will use a Google Play internal test track.
- Keep domain coverage at or above 80% for statements, branches, functions, and lines; do not describe this as whole-application coverage.
- Treat root `AGENTS.md` and every file under `sources/` as read-only host/project reference material.
- Do not remove a branch or worktree without proving it is clean and merged and obtaining explicit user confirmation for the exact targets.
- Preserve the existing factual-record, immutable-history, ownership, RLS, privacy, and no-recommendation boundaries.

---

### Task 1: Enforce Node 24 and prove a reproducible dependency tree

**Files:**

- Create: `scripts/runtime-policy.ts`
- Create: `scripts/check-runtime.ts`
- Create: `tests/tooling/runtime-policy.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Verify: `.nvmrc`

**Interfaces:**

- Produces: `SUPPORTED_NODE_MAJOR: 24`
- Produces: `auditNodeVersion(version: string): RuntimeFinding[]`
- Produces: `RuntimeFinding = { code: 'NODE-VERSION'; message: string }`
- Produces: root scripts `check:runtime` and `preverify`
- Consumes: `process.version`, `.nvmrc`, and `package.json#engines.node`

- [ ] **Step 1: Select Node 24 before changing repository files**

Run:

```powershell
node --version
where.exe node
```

Expected: `node --version` begins with `v24.`. If the active executable is still Node 25, pause and obtain approval to select/install an official Node 24 runtime through the user's preferred Windows version manager or the official Node installer. Do not install global software silently.

- [ ] **Step 2: Write the failing runtime-policy tests**

Create `tests/tooling/runtime-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { auditNodeVersion, SUPPORTED_NODE_MAJOR } from '../../scripts/runtime-policy';

describe('Node runtime policy', () => {
  it('accepts Node 24 only', () => {
    expect(SUPPORTED_NODE_MAJOR).toBe(24);
    expect(auditNodeVersion('v24.21.0')).toEqual([]);
  });

  it.each(['v22.13.0', 'v25.1.0', 'v26.0.0', 'not-a-version'])(
    'rejects unsupported runtime %s',
    version => expect(auditNodeVersion(version).map(item => item.code)).toContain('NODE-VERSION'),
  );
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
npm test -- tests/tooling/runtime-policy.test.ts
```

Expected: FAIL because `scripts/runtime-policy.ts` does not exist.

- [ ] **Step 4: Implement the pure runtime policy**

Create `scripts/runtime-policy.ts`:

```ts
export const SUPPORTED_NODE_MAJOR = 24 as const;

export type RuntimeFinding = {
  code: 'NODE-VERSION';
  message: string;
};

export function auditNodeVersion(version: string): RuntimeFinding[] {
  const match = /^v?(\d+)\./.exec(version);
  const major = match ? Number(match[1]) : Number.NaN;
  return major === SUPPORTED_NODE_MAJOR
    ? []
    : [{
        code: 'NODE-VERSION',
        message: `Node ${SUPPORTED_NODE_MAJOR}.x is required; received ${version}.`,
      }];
}
```

- [ ] **Step 5: Implement the runtime CLI**

Create `scripts/check-runtime.ts`:

```ts
import { auditNodeVersion } from './runtime-policy.ts';

const findings = auditNodeVersion(process.version);
if (findings.length > 0) {
  process.stderr.write(`${findings[0].message}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`NODE-RUNTIME-PASS ${process.version}\n`);
}
```

- [ ] **Step 6: Tighten the repository runtime contract**

Modify `package.json`:

```json
{
  "engines": { "node": ">=24.0.0 <25.0.0" },
  "scripts": {
    "check:runtime": "node scripts/check-runtime.ts",
    "preverify": "npm run check:runtime"
  }
}
```

Keep the existing scripts not shown above. Ensure the root package entry in `package-lock.json` records the same engine range.

- [ ] **Step 7: Run runtime tests and CLI and verify GREEN**

Run:

```powershell
npm test -- tests/tooling/runtime-policy.test.ts
npm run check:runtime
```

Expected: the focused tests pass and the CLI prints `NODE-RUNTIME-PASS` followed by the active `v24.x` version.

- [ ] **Step 8: Rebuild from the committed lockfile under Node 24**

Run inside the isolated implementation worktree:

```powershell
npm ci --ignore-scripts
npm ls --all
npx expo install --check
```

Expected: all commands exit 0 and Expo reports `Dependencies are up to date`.

If `npm ls --all` still reports invalid required relationships after the clean install:

1. Capture the exact packages, beginning with `npm explain metro` for the currently observed mismatch and repeating `npm explain` with each explicit package name reported by the clean tree.
2. Confirm the mismatch with `npx expo install --check`.
3. Use `npx expo install --fix` only for SDK-compatible corrections.
4. Review `package.json` and `package-lock.json`; reject any Expo downgrade or unrelated major change.
5. Repeat `npm ci --ignore-scripts`, `npm ls --all`, and `npx expo install --check`.

Do not carry a known-invalid required tree into Task 2.

- [ ] **Step 9: Run the surrounding test suite**

Run:

```powershell
npm test
npm run typecheck
```

Expected: 245 existing tests plus the new runtime tests pass, with the three intentional Supabase-dependent tests still reported explicitly if their environment is absent.

- [ ] **Step 10: Commit the runtime baseline**

```powershell
git add scripts/runtime-policy.ts scripts/check-runtime.ts tests/tooling/runtime-policy.test.ts package.json package-lock.json
git commit -m "chore: enforce Node 24 runtime"
```

---

### Task 2: Enforce the dependency advisory exception policy

**Files:**

- Create: `scripts/dependency-policy.ts`
- Create: `scripts/audit-dependencies-cli.ts`
- Create: `tests/tooling/dependency-policy.test.ts`
- Create: `docs/verification/dependency-advisory-exceptions.json`
- Modify: `package.json`

**Interfaces:**

- Produces: `auditDependencyPolicy(report: unknown, exceptions: unknown, today: string): DependencyFinding[]`
- Produces: `DependencyFinding = { code: string; message: string }`
- Produces: CLI output `DEPENDENCY-POLICY-PASS` when all findings are acceptable
- Consumes: npm audit report version 2 JSON and the exception registry
- Exception identity: exact GHSA ID derived from each advisory URL

- [ ] **Step 1: Write the failing policy tests**

Create `tests/tooling/dependency-policy.test.ts` with small npm-audit-v2 fixtures. Cover these cases:

```ts
it('fails every high or critical advisory even when an exception exists');
it('fails a moderate advisory without a matching GHSA exception');
it('fails malformed, future-approved, expired, and incomplete exceptions');
it('passes a current complete exception for an observed moderate advisory');
it('flags stale exceptions whose advisory no longer exists');
it('rejects malformed audit JSON instead of treating it as clean');
```

Use fixed dates such as `2026-09-13`; tests must not depend on the wall clock.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm test -- tests/tooling/dependency-policy.test.ts
```

Expected: FAIL because `scripts/dependency-policy.ts` does not exist.

- [ ] **Step 3: Implement the pure policy module**

Create `scripts/dependency-policy.ts` using Zod schemas. The implementation must:

1. Require `auditReportVersion: 2` and `vulnerabilities`.
2. Find concrete advisory objects in every vulnerability's `via` array.
3. Derive exact GHSA IDs from advisory URLs matching `https://github.com/advisories/GHSA-...`.
4. Fail every observed critical/high advisory.
5. Fail every observed moderate advisory without one matching exception.
6. Validate `approvedOn <= today <= expiresOn`, `approvedOn <= reviewOn <= expiresOn`, and all required text/array fields.
7. Fail an exception that no longer matches an observed advisory so resolved exceptions are removed.
8. Return new finding arrays without mutating the report or exception registry.

The exception schema must require:

```ts
{
  advisoryId: string;
  packages: string[];
  severity: 'moderate';
  surfaces: Array<'android' | 'web' | 'development' | 'production'>;
  reachable: 'yes' | 'no' | 'uncertain';
  assessment: string;
  mitigation: string;
  owner: string;
  approvedOn: string;
  reviewOn: string;
  expiresOn: string;
  upgradePath: string;
}
```

- [ ] **Step 4: Populate the initial reviewed exception registry**

Create `docs/verification/dependency-advisory-exceptions.json` with exactly two records:

- `GHSA-vcc3-ghjq-m6fr` for `decode-uri-component` through `expo-router > query-string`; classify route parsing as potentially production-reachable and record the strict callback/route allowlisting as partial mitigation, not a complete fix.
- `GHSA-w5hq-g745-h8pq` for `uuid` through Expo's `xcode` tooling; record that the affected iOS configuration path is outside the Android-only Phase 1 runtime while build-tool exposure remains reviewed.

Use:

- `approvedOn`: `2026-09-13`
- `reviewOn`: `2026-09-27`
- `expiresOn`: `2026-10-13`
- `owner`: `StrandCue maintainer`

Do not list all 13 derived npm vulnerability nodes as separate exceptions; the two concrete GHSA advisories are the review units.

- [ ] **Step 5: Implement the registry-backed CLI**

Create `scripts/audit-dependencies-cli.ts`. It must:

1. Invoke the current npm CLI through `process.execPath` and `process.env.npm_execpath` with `audit --omit=dev --json`.
2. Accept npm exit 1 when valid JSON contains audit findings.
3. Treat process launch, network, empty output, invalid JSON, or unsupported report shape as failures.
4. Read `docs/verification/dependency-advisory-exceptions.json`.
5. Call `auditDependencyPolicy(report, exceptions, new Date().toISOString().slice(0, 10))`.
6. Print a redacted summary only; never print environment variables or registry credentials.
7. Exit 0 only when the policy module returns no findings.

- [ ] **Step 6: Replace the old high-only audit script**

Modify `package.json`:

```json
{
  "scripts": {
    "audit:dependencies": "node scripts/audit-dependencies-cli.ts"
  }
}
```

- [ ] **Step 7: Verify focused and live policy behaviour**

Run:

```powershell
npm test -- tests/tooling/dependency-policy.test.ts
npm run audit:dependencies
```

Expected: fixture tests pass. The live audit reports 0 critical, 0 high, 13 derived moderate vulnerability nodes covered by the two current GHSA exceptions, then prints `DEPENDENCY-POLICY-PASS`.

- [ ] **Step 8: Prove expiry fails**

Temporarily change one fixture exception's expiry date inside the test fixture, not the production registry, and run:

```powershell
npm test -- tests/tooling/dependency-policy.test.ts -t "expired"
```

Expected: PASS because the policy returns an expiry finding.

- [ ] **Step 9: Run type checking and the tooling suite**

```powershell
npm run typecheck
npm test -- tests/tooling
```

Expected: PASS.

- [ ] **Step 10: Commit the dependency policy**

```powershell
git add scripts/dependency-policy.ts scripts/audit-dependencies-cli.ts tests/tooling/dependency-policy.test.ts docs/verification/dependency-advisory-exceptions.json package.json
git commit -m "chore: enforce dependency advisory policy"
```

---

### Task 3: Add Expo-compatible linting without weakening checks

**Files:**

- Create: `eslint.config.mjs`
- Create: `tests/tooling/lint-policy.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify only when reported by ESLint: existing `*.ts` and `*.tsx` files under `apps/mobile`, `packages/domain`, `scripts`, and `tests`

**Interfaces:**

- Produces: root script `lint`
- Consumes: `eslint@10.10.0`, `eslint-config-expo@57.0.2`, the Expo flat configuration, and all project-authored TypeScript/TSX surfaces

- [ ] **Step 1: Write the failing lint-policy test**

Create `tests/tooling/lint-policy.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('lint policy', () => {
  it('pins Expo-compatible ESLint and exposes a zero-warning lint command', async () => {
    const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.devDependencies.eslint).toBe('10.10.0');
    expect(pkg.devDependencies['eslint-config-expo']).toBe('57.0.2');
    expect(pkg.scripts.lint).toContain('--max-warnings=0');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm test -- tests/tooling/lint-policy.test.ts
```

Expected: FAIL because the lint dependencies and script are absent.

- [ ] **Step 3: Install the pinned lint dependencies under Node 24**

```powershell
npm install --save-dev --save-exact eslint@10.10.0 eslint-config-expo@57.0.2
```

Review the manifest and lockfile. Reject unrelated Expo, React Native, React, or Supabase version changes.

- [ ] **Step 4: Create the flat ESLint configuration**

Create `eslint.config.mjs`:

```js
import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat';

export default defineConfig([
  ...expoConfig,
  {
    ignores: [
      '.worktrees/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'sources/**',
      'supabase/.temp/**',
    ],
  },
]);
```

- [ ] **Step 5: Add the lint script**

Modify `package.json`:

```json
{
  "scripts": {
    "lint": "eslint apps/mobile packages/domain scripts tests vitest.config.ts eslint.config.mjs --max-warnings=0"
  }
}
```

- [ ] **Step 6: Run the focused policy test and linter**

```powershell
npm test -- tests/tooling/lint-policy.test.ts
npm run lint
```

Expected: the policy test passes. The first lint run may fail on existing authored code; capture every finding.

- [ ] **Step 7: Remediate findings without blanket disables**

For each file reported by ESLint:

1. Fix correctness and unused-code findings directly.
2. Preserve existing immutable transformations and public interfaces.
3. Use the narrowest line/file override only when a framework-generated pattern cannot comply, and document why next to that override.
4. Do not disable an entire recommended ruleset or reduce `--max-warnings=0`.
5. Add or update a focused test before any behavioural correction discovered by lint.

Run `npm run lint` after each small group until it exits 0 with zero warnings.

- [ ] **Step 8: Run the regression gates**

```powershell
npm run typecheck
npm test
npx expo install --check
```

Expected: PASS and Expo dependencies remain compatible.

- [ ] **Step 9: Commit lint enforcement**

```powershell
git add eslint.config.mjs tests/tooling/lint-policy.test.ts package.json package-lock.json
# Add each lint-remediated source file by its explicit path after reviewing it.
git diff --cached --check
git commit -m "chore: add Expo lint enforcement"
```

Before committing, inspect `git diff --cached --name-only` and unstage any file not changed specifically for lint compliance.

---

### Task 4: Make one verification command authoritative locally and in CI

**Files:**

- Create: `tests/tooling/verification-policy.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/verify.yml`
- Modify: `README.md`

**Interfaces:**

- Produces: one canonical `npm run verify` gate
- Consumes: `preverify`, `typecheck`, `lint`, `test:coverage`, `audit:control-plane`, `audit:dependencies`, `check:expo`, and `export:web`
- CI contract: install from lockfile, then invoke the canonical verification command

- [ ] **Step 1: Write the failing verification-policy tests**

Create `tests/tooling/verification-policy.test.ts`. Read `package.json` and `.github/workflows/verify.yml`, then assert:

```ts
expect(pkg.scripts.preverify).toBe('npm run check:runtime');
expect(pkg.scripts.verify).toBe(
  'npm run typecheck && npm run lint && npm run test:coverage && npm run audit:control-plane && npm run audit:dependencies && npm run check:expo && npm run export:web',
);
expect(workflow).toContain('npm ci --ignore-scripts');
expect(workflow).toContain('npm run verify');
```

Also assert that the workflow does not duplicate individual `typecheck`, `test`, `lint`, audit, or export steps after `npm run verify` is introduced.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm test -- tests/tooling/verification-policy.test.ts
```

Expected: FAIL because `verify` and the workflow are not yet canonical.

- [ ] **Step 3: Add Expo dependency validation and canonical verification**

Modify `package.json`:

```json
{
  "scripts": {
    "check:expo": "expo install --check",
    "verify": "npm run typecheck && npm run lint && npm run test:coverage && npm run audit:control-plane && npm run audit:dependencies && npm run check:expo && npm run export:web"
  }
}
```

`preverify` from Task 1 runs automatically before `verify`.

- [ ] **Step 4: Collapse CI onto the canonical gate**

Keep checkout, setup-node, npm caching, least-privilege permissions, timeout, and `npm ci --ignore-scripts`. Replace the duplicated post-install commands in `.github/workflows/verify.yml` with:

```yaml
      - run: npm run verify
```

- [ ] **Step 5: Update developer verification instructions**

Modify `README.md` so the primary command is:

```powershell
npm run verify
```

Document that it requires Node 24 and registry access for the live dependency/Expo checks. Retain focused commands for diagnosis, and state accurately that configured percentage coverage is the shared domain surface.

- [ ] **Step 6: Run focused policy tests**

```powershell
npm test -- tests/tooling/verification-policy.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the complete canonical gate under Node 24**

```powershell
npm run verify
```

Expected sequence and result:

1. `NODE-RUNTIME-PASS`.
2. Type checking passes.
3. ESLint exits with zero warnings.
4. Tests and domain coverage thresholds pass.
5. Control-plane audit prints `METADATA-PASS`.
6. Dependency audit prints `DEPENDENCY-POLICY-PASS`.
7. Expo reports compatible dependencies.
8. Web export succeeds.

- [ ] **Step 8: Commit canonical verification**

```powershell
git add tests/tooling/verification-policy.test.ts package.json .github/workflows/verify.yml README.md
git commit -m "ci: make verification gate canonical"
```

---

### Task 5: Amend Phase 1 and application configuration to Android-only

**Files:**

- Create: `tests/tooling/platform-scope.test.ts`
- Modify: `apps/mobile/app.json`
- Modify: `docs/PHASE_1.md`
- Modify: `docs/verification/phase-1-acceptance-status.md`
- Modify: `docs/verification/foundation-review.md`
- Modify: `docs/verification/chemical-services-review.md`
- Modify: `README.md`

**Interfaces:**

- Produces: Expo platform list `['android', 'web']`
- Produces: authoritative Android-only Phase 1 release language
- Preserves: web preview/export as a development smoke surface, not the native beta target

- [ ] **Step 1: Write the failing platform-scope tests**

Create `tests/tooling/platform-scope.test.ts`. Read `apps/mobile/app.json` and the active Phase 1 documents, then assert:

```ts
expect(app.expo.platforms).toEqual(['android', 'web']);
expect(app.expo).not.toHaveProperty('ios');
expect(phaseOne).toContain('Android is the sole Phase 1 native release target');
expect(phaseOne).not.toContain('iOS/Android');
expect(phaseOne).not.toContain('Android/iPhone');
expect(phaseOne).not.toContain('44 pt iOS');
expect(acceptance).toContain('Android-only');
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm test -- tests/tooling/platform-scope.test.ts
```

Expected: FAIL because `app.json` still has an `ios` section and the active specification still requires both native platforms.

- [ ] **Step 3: Restrict Expo application platforms**

Modify `apps/mobile/app.json`:

```json
{
  "expo": {
    "platforms": ["android", "web"]
  }
}
```

Remove the existing `ios` object. Preserve the name, slug, scheme, version, orientation, theme, web configuration, and plugins.

- [ ] **Step 4: Amend the authoritative Phase 1 contract**

Modify `docs/PHASE_1.md` to state:

- Android is the sole Phase 1 native release target.
- iOS implementation and validation are deferred beyond Phase 1.
- Real recovery and primary journeys require Android development/release builds, not only Expo Go.
- Performance is measured on a declared mid-range Android device.
- Touch targets use the Android 48 dp minimum for Phase 1.
- The release matrix uses Android versions/devices only.
- The signed beta candidate is distributed through a Google Play internal test track.

Do not change the product, privacy, security, or factual-record requirements.

- [ ] **Step 5: Align release evidence without rewriting history**

Modify the forward-looking language in:

- `docs/verification/phase-1-acceptance-status.md`
- `docs/verification/foundation-review.md`
- `docs/verification/chemical-services-review.md`
- `README.md`

Replace generic future `native` release blockers with explicit Android evidence where appropriate. Preserve statements describing what was actually tested in earlier reviews. Add a dated note that Android-only scope is an approved Phase 1 amendment and does not mark any acceptance case Complete.

- [ ] **Step 6: Run focused contract tests**

```powershell
npm test -- tests/tooling/platform-scope.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 7: Verify Expo configuration**

```powershell
npx expo config --type public
npx expo install --check
npm run export:web
```

Expected: public config includes Android and web only, dependency validation passes, and the web smoke export remains successful.

- [ ] **Step 8: Commit the Android-only amendment**

```powershell
git add tests/tooling/platform-scope.test.ts apps/mobile/app.json docs/PHASE_1.md docs/verification/phase-1-acceptance-status.md docs/verification/foundation-review.md docs/verification/chemical-services-review.md README.md
git commit -m "docs: scope Phase 1 release to Android"
```

---

### Task 6: Record Phase 1A evidence and prepare safe local cleanup

**Files:**

- Create: `docs/verification/phase-1a-stabilization-review.md`
- Local-only modify: `.git/info/exclude`
- Inspect only: `.worktrees/codex-chemical-services`
- Inspect only: `.worktrees/docker-local-env-fix`

**Interfaces:**

- Produces: an evidence record for Phase 1A
- Produces: a clean ordinary Git status while preserving the host-provided `AGENTS.md`
- Produces: an exact cleanup proposal; worktree/branch deletion remains separately authorized
- Consumes: outputs from Tasks 1-5 and current Git reachability/status

- [ ] **Step 1: Verify the repository root and host file before local exclusion**

```powershell
$strandcueRoot = 'C:\Users\ABADO\Desktop\StrandCue'
git -C $strandcueRoot rev-parse --show-toplevel
Get-Item -LiteralPath "$strandcueRoot\AGENTS.md" | Select-Object FullName,Attributes,Length
git -C $strandcueRoot status --short --untracked-files=all
```

Expected: the root resolves exactly to `C:/Users/ABADO/Desktop/StrandCue` and the only host-context finding is the root `AGENTS.md`. If other untracked files exist, do not hide them.

- [ ] **Step 2: Add a local-only literal exclusion**

Using `apply_patch`, add this one line to `C:\Users\ABADO\Desktop\StrandCue\.git\info\exclude` if it is absent:

```gitignore
/AGENTS.md
```

Do not modify, delete, move, stage, or commit `AGENTS.md`. Confirm `git -C C:\Users\ABADO\Desktop\StrandCue check-ignore -v AGENTS.md` points to `.git/info/exclude`.

- [ ] **Step 3: Inventory old worktrees and prove reachability**

```powershell
git worktree list --porcelain
git -C .worktrees/codex-chemical-services status --short --branch
git -C .worktrees/docker-local-env-fix status --short --branch
git merge-base --is-ancestor codex/chemical-services main
git merge-base --is-ancestor codex/docker-local-env-fix main
```

Expected: both ancestor checks exit 0. Record each worktree's exact status. If either worktree contains changes, stop cleanup planning for that target and report them.

- [ ] **Step 4: Request exact cleanup confirmation**

Present the user with the clean, merged worktree paths and local/remote branch names. Do not run `git worktree remove`, `git branch -d`, or remote branch deletion until the user explicitly confirms those exact targets.

- [ ] **Step 5: Run the final clean-install verification under Node 24**

From the isolated implementation worktree:

```powershell
node --version
npm ci --ignore-scripts
npm ls --all
npm run verify
git diff --check
git status --short --branch
```

Expected:

- Node reports `v24.x`.
- Clean install and dependency tree checks exit 0.
- The complete canonical verification exits 0.
- Lint reports zero warnings.
- Domain coverage stays at or above 80% in all four configured dimensions.
- Dependency policy reports no high/critical advisories and only current moderate exceptions.
- Git has no generated, environment, or unrelated application changes.

- [ ] **Step 6: Write the Phase 1A verification record**

Create `docs/verification/phase-1a-stabilization-review.md` with the actual observed values from Step 5:

1. commit and branch tested;
2. exact Node and npm versions;
3. clean-install and `npm ls` results;
4. test counts and all skips with reasons;
5. coverage percentages and the explicit domain-only scope;
6. lint, typecheck, control-plane, dependency-policy, Expo check, and export results;
7. the two GHSA exceptions, review/expiry dates, and mitigations;
8. Android-only contract/config confirmation;
9. host `AGENTS.md` local handling;
10. worktree reachability/status and whether cleanup was authorized;
11. remaining release blockers;
12. explicit statement that Phase 1A alone completes none of P1-AC-01 through P1-AC-25.

Do not use placeholders; write only observed evidence.

- [ ] **Step 7: Update acceptance evidence conservatively**

Modify `docs/verification/phase-1-acceptance-status.md` only if the final evidence changes a row's wording. P1-AC-23, P1-AC-24, and P1-AC-25 remain Partial because Phase 1A does not supply the missing product, Android journey, accessibility, or backup/restore evidence.

- [ ] **Step 8: Commit the evidence**

```powershell
git add docs/verification/phase-1a-stabilization-review.md docs/verification/phase-1-acceptance-status.md
git diff --cached --check
git commit -m "docs: record Phase 1A stabilization evidence"
```

- [ ] **Step 9: Review the complete branch**

```powershell
git diff --stat main...HEAD
git diff --check main...HEAD
git log --oneline main..HEAD
npm run verify
```

Expected: only the approved Phase 1A policy, tooling, configuration, documentation, and necessary lint-remediation files differ; verification remains green.

- [ ] **Step 10: Request code and security review**

Use `superpowers:requesting-code-review` after all tasks pass. The review must inspect runtime enforcement, process spawning and JSON parsing, advisory identity/expiry logic, CI permissions, lint suppressions, Android scope consistency, secrets, and unintended product behaviour.

Address every critical/high review finding, repeat the full verification, then use `superpowers:finishing-a-development-branch` to offer integration options. Do not push or create a PR without the user's approval.

## Phase 1A Completion Checklist

- [ ] Node 24 is active and repository-enforced.
- [ ] A clean lockfile install produces a valid required dependency tree.
- [ ] ESLint covers all project-authored TypeScript/TSX and permits zero warnings.
- [ ] The two current moderate GHSAs have complete, unexpired exceptions.
- [ ] Critical/high advisories and missing/expired moderate exceptions fail verification.
- [ ] `npm run verify` is the single local and CI-equivalent quality gate.
- [ ] Expo configuration and authoritative documentation are Android-only for Phase 1.
- [ ] Coverage claims state their actual domain-only scope.
- [ ] The host `AGENTS.md` remains untouched and locally excluded only.
- [ ] Old worktrees are inventoried; deletion occurs only after exact approval.
- [ ] Phase 1A evidence is current, reproducible, and does not overstate acceptance completion.
