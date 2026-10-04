# Phase 1 Baseline Recovery and Evidence Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a green, reproducible StrandCue baseline and replace stale milestone claims with an evidence-backed Phase 1 reconciliation matrix.

**Architecture:** Treat the Passport and Chemical Services migrations as the last currently replayable database baseline. Preserve later milestone SQL as explicitly unverified candidate migrations outside the executable migration directory, remove unreferenced unsafe Activity UI drafts from the production TypeScript surface, and promote capabilities back only through their own TDD plans. Make the owner-supplied 23 September PRD durable in the repository and record every remaining capability against executable evidence.

**Tech Stack:** TypeScript 7, Node.js 24+, Vitest 5, Expo 57, React Native 0.86, Supabase CLI 2.117, PostgreSQL/PGlite, Markdown.

**Spec:** `docs/superpowers/specs/2026-09-23-strandcue-phase1-rebaseline-design.md`

## Global Constraints

- The owner-supplied PRD v1.1 dated 23 September 2026 is the product authority.
- Phase 1 records facts and history; it does not provide recommendations, diagnosis, product rankings, or shopping advice.
- Existing verified Passport and Chemical Services behavior must remain unchanged.
- Unknown remains distinct from omitted, false, and zero.
- Consumer mutations must not bypass immutable history through direct table writes.
- Every exposed private table requires RLS and explicit owner scoping.
- No mobile code may contain a Supabase service-role or secret key.
- Short user notes remain limited to 2,000 UTF-16 code units unless the authoritative PRD defines a narrower field limit.
- The beta recovery targets are RPO no greater than 1 hour and RTO no greater than 4 hours.
- Source files under `sources/` remain read-only.
- Candidate work is preserved in Git history or an explicitly named draft directory; it is never represented as production-ready evidence.

## Review Focus

- An unverified migration accidentally returned to `supabase/migrations` must fail the migration-inventory test before it can affect a fresh database.
- A draft screen that performs direct writes to `activities` or revision tables must not be routed or compiled as shipped application behavior.
- The repository must distinguish an unavailable network-dependent audit from a passing audit; “not run” cannot be reported as “pass.”
- A documented implementation without current automated/API/device evidence must remain `Implemented, unverified`, not `Proven complete`.
- Rebaselining must not weaken the already-tested Passport or Chemical Services ownership, correction, and historical-truth invariants.

---

### Task 1: Make the current product authority durable

**Files:**
- Create: `StrandCue-PRD-v1.1-audit.md`
- Modify: `README.md`
- Modify: `docs/PHASE_1.md`
- Test: `tests/tooling/product-authority.test.ts`

**Interfaces:**
- Consumes: owner-supplied PRD attachment at `C:\Users\ABADO\.codex\attachments\e527d44b-6a0c-47a7-ba2f-945683568743\Pasted text.txt`
- Produces: canonical product document with line-ending-normalized SHA-256 `6579BD90E7AC420387071B07C6CB379472371CB1109FA4420DFBB6176618209B` and unambiguous authority links

- [ ] **Step 1: Write the failing authority test**

Create `tests/tooling/product-authority.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const canonicalPrd = 'StrandCue-PRD-v1.1-audit.md';
const expectedSha256 = '6579BD90E7AC420387071B07C6CB379472371CB1109FA4420DFBB6176618209B';

describe('Phase 1 product authority', () => {
  it('keeps the approved 23 September PRD unchanged across checkout line endings', async () => {
    const contents = (await readFile(canonicalPrd, 'utf8')).replaceAll('\r\n', '\n');
    expect(createHash('sha256').update(contents, 'utf8').digest('hex').toUpperCase()).toBe(expectedSha256);
  });

  it('points repository entry documents to the approved PRD and rebaseline design', async () => {
    const [readme, phaseOne] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('docs/PHASE_1.md', 'utf8'),
    ]);
    for (const document of [readme, phaseOne]) {
      expect(document).toContain('StrandCue-PRD-v1.1-audit.md');
      expect(document).toContain('2026-09-23-strandcue-phase1-rebaseline-design.md');
    }
  });
});
```

- [ ] **Step 2: Run the test and verify the missing canonical file is reported**

Run:

```powershell
npx vitest run tests/tooling/product-authority.test.ts
```

Expected: FAIL with `ENOENT` for `StrandCue-PRD-v1.1-audit.md`.

- [ ] **Step 3: Copy the approved PRD without editorial changes**

Copy the attachment text exactly to `StrandCue-PRD-v1.1-audit.md`. Do not renumber sections or repair wording in this step. Confirm the copied file has the expected SHA-256 after normalizing CRLF to LF, matching the test above.

Run:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'StrandCue-PRD-v1.1-audit.md'
```

Expected hash: `6579BD90E7AC420387071B07C6CB379472371CB1109FA4420DFBB6176618209B`.

- [ ] **Step 4: Update the authority notices**

In `README.md`, replace the sentence that names only `docs/PHASE_1.md` as the active contract with:

```markdown
The product authority is [PRD v1.1 — Revised Audit Edition](StrandCue-PRD-v1.1-audit.md). The reconciled engineering direction is [the Phase 1 rebaseline design](docs/superpowers/specs/2026-09-23-strandcue-phase1-rebaseline-design.md); [the Phase 1 build specification](docs/PHASE_1.md) remains applicable where it does not conflict with those documents.
```

Add this block after the title in `docs/PHASE_1.md`:

```markdown
> **Authority notice — 23 September 2026:** Product policy and beta requirements are governed by [PRD v1.1 — Revised Audit Edition](../StrandCue-PRD-v1.1-audit.md). Implementation reconciliation is governed by [the Phase 1 rebaseline design](superpowers/specs/2026-09-23-strandcue-phase1-rebaseline-design.md). This document remains the detailed engineering contract only where it does not conflict with those sources.
```

- [ ] **Step 5: Run the focused and complete documentation tests**

Run:

```powershell
npx vitest run tests/tooling/product-authority.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Commit the authority update**

```powershell
git add -- StrandCue-PRD-v1.1-audit.md README.md docs/PHASE_1.md tests/tooling/product-authority.test.ts
git commit -m "docs: adopt revised phase 1 product authority"
```

---

### Task 2: Pin the trusted migration boundary before moving files

**Files:**
- Create: `tests/database/migration-inventory.test.ts`
- Create: `supabase/drafts/2026-09-unverified-milestones/README.md`
- Move: the 19 migration files listed below from `supabase/migrations/` to `supabase/drafts/2026-09-unverified-milestones/`
- Test: `tests/database/migration-inventory.test.ts`

**Interfaces:**
- Consumes: committed migration filenames and the approved rebaseline rule that only replayable migrations belong in the executable directory
- Produces: `trustedMigrationNames` contract enforced by Vitest; candidate SQL remains reviewable but cannot enter a fresh database accidentally

The trusted executable set for this baseline is:

```ts
export const trustedMigrationNames = [
  '20260909172924_passport_foundation.sql',
  '20260912070752_chemical_services.sql',
] as const;
```

The unverified candidate set is:

```ts
export const candidateMigrationNames = [
  '20260918154343_brands_products_product_versions.sql',
  '20260918154920_user_products_revisions.sql',
  '20260918155718_tool_brands_tools_user_tools.sql',
  '20260918160720_activities_heat_links.sql',
  '20260918162005_username-change-30day.sql',
  '20260918162839_email-password-changes.sql',
  '20260919064318_analytics-consent.sql',
  '20260919064840_cosmetic-boundary-support.sql',
  '20260919065826_account-session-info.sql',
  '20260919070841_recent-auth-foundation.sql',
  '20260919072155_export-jobs.sql',
  '20260919072557_export-json-generation.sql',
  '20260919073216_export-csv-generation.sql',
  '20260919073529_export-download-auth.sql',
  '20260919073818_export-retention-cleanup.sql',
  '20260919075003_account-deletion-tombstone.sql',
  '20260919075458_account-deletion-rpc.sql',
  '20260919081022_session-revocation-old-token-denial.sql',
  '20260919082240_tombstone-survival-restore.sql',
] as const;
```

- [ ] **Step 1: Write the failing migration-inventory test**

Create `tests/database/migration-inventory.test.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const trustedMigrationNames = [
  '20260909172924_passport_foundation.sql',
  '20260912070752_chemical_services.sql',
] as const;

const candidateMigrationNames = [
  '20260918154343_brands_products_product_versions.sql',
  '20260918154920_user_products_revisions.sql',
  '20260918155718_tool_brands_tools_user_tools.sql',
  '20260918160720_activities_heat_links.sql',
  '20260918162005_username-change-30day.sql',
  '20260918162839_email-password-changes.sql',
  '20260919064318_analytics-consent.sql',
  '20260919064840_cosmetic-boundary-support.sql',
  '20260919065826_account-session-info.sql',
  '20260919070841_recent-auth-foundation.sql',
  '20260919072155_export-jobs.sql',
  '20260919072557_export-json-generation.sql',
  '20260919073216_export-csv-generation.sql',
  '20260919073529_export-download-auth.sql',
  '20260919073818_export-retention-cleanup.sql',
  '20260919075003_account-deletion-tombstone.sql',
  '20260919075458_account-deletion-rpc.sql',
  '20260919081022_session-revocation-old-token-denial.sql',
  '20260919082240_tombstone-survival-restore.sql',
] as const;

const sqlFiles = async (directory: string) =>
  (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();

describe('migration promotion boundary', () => {
  it('executes only the reviewed, replayable migrations', async () => {
    await expect(sqlFiles('supabase/migrations')).resolves.toEqual([...trustedMigrationNames]);
  });

  it('keeps every unverified milestone migration in the candidate archive', async () => {
    await expect(sqlFiles('supabase/drafts/2026-09-unverified-milestones')).resolves.toEqual([...candidateMigrationNames]);
  });

  it('labels the candidate archive as non-executable and evidence-free', async () => {
    const readme = await readFile('supabase/drafts/2026-09-unverified-milestones/README.md', 'utf8');
    expect(readme).toContain('must not be applied');
    expect(readme).toContain('promotion requires a capability-specific migration test');
    expect(readme).toContain('does not constitute completion evidence');
  });
});
```

- [ ] **Step 2: Run the test and confirm that the current mixed migration directory fails**

Run:

```powershell
npx vitest run tests/database/migration-inventory.test.ts
```

Expected: FAIL because `supabase/migrations` contains 21 SQL files and the draft directory does not exist.

- [ ] **Step 3: Move the candidate migrations without editing their contents**

Create `supabase/drafts/2026-09-unverified-milestones/` and move exactly the 19 candidate files listed above into it. Preserve filenames and bytes so later capability plans can inspect or replace them without confusing them with executable history.

- [ ] **Step 4: Document the candidate status**

Create `supabase/drafts/2026-09-unverified-milestones/README.md` with:

```markdown
# Unverified Phase 1 milestone migrations

These SQL files were committed during the 18–19 September milestone drafts but do not form a replayable or security-reviewed migration chain. They must not be applied to development, staging, or production databases.

The first known replay failure is `20260918154920_user_products_revisions.sql`, which contains invalid SQL (`GRANT ... USING`) and references nonexistent revision columns. Later files have not earned execution trust merely because an earlier failure prevented them from running.

Promotion requires a capability-specific migration test, fresh replay through the non-superuser migration harness, RLS/API tests, and review against the 23 September product authority. Presence in this directory preserves investigation material and does not constitute completion evidence.
```

- [ ] **Step 5: Run inventory and replay tests**

Run:

```powershell
npx vitest run tests/database/migration-inventory.test.ts tests/database/migration.test.ts tests/database/passport.test.ts tests/database/services.test.ts
```

Expected: PASS. The replay test applies the two trusted migrations in lexical order; Passport and Chemical Services suites no longer skip because of the invalid Shelf migration.

- [ ] **Step 6: Commit the migration boundary**

```powershell
git add -- supabase/migrations supabase/drafts tests/database/migration-inventory.test.ts
git commit -m "test: establish trusted migration boundary"
```

---

### Task 3: Remove unsafe, unreferenced Activity UI drafts from the production surface

**Files:**
- Delete: `apps/mobile/src/screens/ActivityScreen.tsx`
- Delete: `apps/mobile/src/screens/ActivityCorrectScreen.tsx`
- Delete: `apps/mobile/src/screens/ActivityVoidScreen.tsx`
- Delete: `apps/mobile/src/screens/HeatEventForm.tsx`
- Create: `docs/verification/activity-draft-disposition.md`
- Modify: `tests/tooling/rebaseline.test.ts`
- Test: `tests/tooling/rebaseline.test.ts`

**Interfaces:**
- Consumes: unreferenced draft screens from commit `53a88a5` and the immutable-mutation boundary
- Produces: a compile-safe runtime surface with no direct Activity table mutation; a durable record of what may be salvaged later

- [ ] **Step 1: Write the failing production-surface test**

Create `tests/tooling/rebaseline.test.ts`:

```ts
import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const removedDrafts = [
  'apps/mobile/src/screens/ActivityScreen.tsx',
  'apps/mobile/src/screens/ActivityCorrectScreen.tsx',
  'apps/mobile/src/screens/ActivityVoidScreen.tsx',
  'apps/mobile/src/screens/HeatEventForm.tsx',
];

describe('rebaselined production surface', () => {
  it.each(removedDrafts)('does not compile the unsafe draft %s', async (path) => {
    await expect(access(path)).rejects.toThrow();
  });

  it('records why the drafts were removed and where their history remains', async () => {
    const disposition = await readFile('docs/verification/activity-draft-disposition.md', 'utf8');
    expect(disposition).toContain('53a88a5');
    expect(disposition).toContain('direct table writes');
    expect(disposition).toContain('not routed');
    expect(disposition).toContain('separate Activity implementation plan');
  });
});
```

- [ ] **Step 2: Run the test and confirm that the four files are still present**

Run:

```powershell
npx vitest run tests/tooling/rebaseline.test.ts
```

Expected: FAIL for all four `access()` assertions and the missing disposition document.

- [ ] **Step 3: Remove the four unreferenced drafts**

Delete only the four files listed above. Do not remove the domain activity schemas or the archived candidate migration; those remain inputs to the later Activity capability design. The draft source remains recoverable from commit `53a88a5`.

- [ ] **Step 4: Record the disposition**

Create `docs/verification/activity-draft-disposition.md`:

```markdown
# Activity draft disposition — 23 September 2026

Commit `53a88a5` preserved four Activity UI drafts. They were not routed from `apps/mobile/app/index.tsx` or `apps/mobile/src/records.tsx`, did not compile, imported unsupported React Native controls, and performed direct table writes to `activities` and `activity_revisions`. Those writes bypassed the immutable operation, correction, ownership, and idempotency boundary required by the current Phase 1 design.

The files were removed from the production TypeScript surface during baseline recovery. Their Git history and domain/schema ideas remain available for review. No behavior from those files is treated as implemented or verified. Activity recording, correction, voiding, heat facts, drafts, duplicate review, and history integration will be rebuilt through the separate Activity implementation plan.
```

- [ ] **Step 5: Run the focused test and mobile typecheck**

Run:

```powershell
npx vitest run tests/tooling/rebaseline.test.ts
npm run typecheck --workspace @strandcue/mobile
```

Expected: both PASS.

- [ ] **Step 6: Commit the draft disposition**

```powershell
git add -- apps/mobile/src/screens docs/verification/activity-draft-disposition.md tests/tooling/rebaseline.test.ts
git commit -m "chore: remove unsafe activity screen drafts"
```

---

### Task 4: Normalize workspace verification metadata

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `package.json`
- Modify: `tests/tooling/rebaseline.test.ts`
- Test: `tests/tooling/rebaseline.test.ts`

**Interfaces:**
- Consumes: current npm workspace scripts
- Produces: one definition per mobile script and a canonical local verification sequence that reports the dependency audit separately

- [ ] **Step 1: Extend the metadata test**

Append to `tests/tooling/rebaseline.test.ts`:

```ts
it('defines each mobile workspace script once in source text', async () => {
  const source = await readFile('apps/mobile/package.json', 'utf8');
  for (const script of ['start', 'web', 'typecheck', 'export:web']) {
    expect(source.match(new RegExp(`"${script}"\\s*:`, 'g'))).toHaveLength(1);
  }
});

it('keeps the canonical verify gate deterministic and separates the network audit', async () => {
  const root = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  expect(root.scripts.verify).toBe(
    'npm run typecheck && npm test && npm run test:coverage && npm run audit:control-plane && npm run export:web',
  );
  expect(root.scripts['audit:dependencies']).toBe('npm audit --omit=dev --audit-level=high');
  expect(root.scripts.verify).not.toContain('audit:dependencies');
});
```

- [ ] **Step 2: Run the focused test and confirm duplicate scripts and the missing coverage gate fail**

Run:

```powershell
npx vitest run tests/tooling/rebaseline.test.ts
```

Expected: FAIL because `apps/mobile/package.json` defines four scripts twice and the root `verify` command omits `test:coverage`.

- [ ] **Step 3: Remove duplicate mobile script keys**

Make the mobile scripts object exactly:

```json
"scripts": {
  "start": "expo start",
  "web": "expo start --web",
  "typecheck": "tsc --noEmit",
  "export:web": "expo export --platform web",
  "build:android:debug": "eas build --platform android --profile development",
  "build:android:preview": "eas build --platform android --profile preview",
  "build:android:release": "eas build --platform android --profile release",
  "build:android:play-internal": "eas build --platform android --profile playInternal",
  "submit:android:internal": "eas submit --platform android --profile production"
}
```

- [ ] **Step 4: Add coverage to the deterministic local gate**

Change the root script to:

```json
"verify": "npm run typecheck && npm test && npm run test:coverage && npm run audit:control-plane && npm run export:web"
```

Keep `audit:dependencies` separate because it requires the npm registry. A network or sandbox failure must be reported as unavailable, not converted to a passing local result.

- [ ] **Step 5: Run the metadata and JSON parse checks**

Run:

```powershell
npx vitest run tests/tooling/rebaseline.test.ts
npm pkg get scripts --workspace @strandcue/mobile
```

Expected: PASS and one value per mobile script.

- [ ] **Step 6: Commit workspace cleanup**

```powershell
git add -- apps/mobile/package.json package.json tests/tooling/rebaseline.test.ts
git commit -m "chore: normalize verification scripts"
```

---

### Task 5: Prove and record the recovered automated baseline

**Files:**
- Create: `docs/verification/rebaseline-2026-09-23.md`
- Modify: `README.md`
- Test: all current automated suites

**Interfaces:**
- Consumes: canonical verification commands after Tasks 1–4
- Produces: a dated evidence record that distinguishes passing, failing, skipped, and externally unavailable checks

- [ ] **Step 1: Run the deterministic verification gate**

Run:

```powershell
npm run verify
```

Expected: exit 0. TypeScript, Vitest, coverage thresholds, the local control-plane audit, and Expo web export all pass.

- [ ] **Step 2: Run the dependency audit separately**

Run:

```powershell
npm run audit:dependencies
```

Expected in a network-enabled environment: exit 0 with no high or critical production dependency findings. If registry access is unavailable, record `Unavailable — registry access required` and preserve the release gate as open; do not mark it passed.

- [ ] **Step 3: Run the local Supabase replay when Docker is available**

Discover commands rather than guessing:

```powershell
npx supabase --version
npx supabase db --help
npx supabase migration --help
```

Then reset the local development database using the supported CLI command shown by `--help`, and run the authenticated API suite documented by the existing repository setup. Expected: the two trusted migrations apply from an empty database and the existing Passport/Chemical Services owner-isolation checks pass. If Docker is unavailable, record the PGlite replay as passed and local Supabase as `Unavailable — Docker required`.

- [ ] **Step 4: Write the baseline evidence report**

Create `docs/verification/rebaseline-2026-09-23.md`. Add one table row for each command from Steps 1–3 with these columns: Check, Command, Required result, Recorded result, and Evidence classification. Copy the command's exit code, test counts, coverage percentages, or named status into Recorded result. Use `Automated pass`, `Build smoke pass`, `Limited automated pass`, or `External gate` as the classification; never use `Pass` when the command did not execute successfully.

After the evidence table, add this exact scope statement:

```markdown
## Scope of this evidence

This report proves only the trusted Passport and Chemical Services baseline plus project-authored domain/mobile contracts that execute in the listed suites. It does not promote archived candidate migrations, unintegrated screens, device journeys, provider configuration, POPIA review, accessibility review, backup recovery, or beta readiness.
```

If a network, Docker, provider, or device dependency prevents execution, the Recorded result must name that dependency and the Evidence classification must remain `External gate`.

- [ ] **Step 5: Update the README status paragraph**

Replace the stale list of missing features with a link to the reconciliation matrix created in Task 6 and state that only Passport and Chemical Services migrations currently belong to the trusted replay chain.

- [ ] **Step 6: Commit the baseline evidence**

```powershell
git add -- README.md docs/verification/rebaseline-2026-09-23.md
git commit -m "docs: record recovered phase 1 baseline"
```

---

### Task 6: Replace stale acceptance claims with the reconciliation matrix

**Files:**
- Create: `docs/verification/phase-1-reconciliation.md`
- Modify: `docs/verification/phase-1-acceptance-status.md`
- Modify: `docs/milestone8-acceptance-matrix.md`
- Create: `tests/tooling/reconciliation.test.ts`
- Test: `tests/tooling/reconciliation.test.ts`

**Interfaces:**
- Consumes: canonical PRD, rebaseline design, recovered automated evidence, archived candidate inventory, routed application surface
- Produces: one status vocabulary and an evidence-backed capability ledger used by every subsequent implementation plan

- [ ] **Step 1: Write the failing reconciliation contract test**

Create `tests/tooling/reconciliation.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const requiredCapabilities = [
  'Authority and scope',
  'Authentication and recovery',
  'Hair Passport',
  'Chemical Services',
  'My Shelf and provenance',
  'My Tools',
  'Activities and unified history',
  'Settings and consent',
  'Export and portability',
  'Deletion and restore enforcement',
  'Security and RLS',
  'UX and accessibility',
  'Analytics and observability',
  'CI and automated quality',
  'Performance and resilience',
  'Backup and disaster recovery',
  'POPIA and operating ownership',
  'Beta release evidence',
];

describe('Phase 1 reconciliation matrix', () => {
  it('uses the approved evidence vocabulary and includes every capability', async () => {
    const matrix = await readFile('docs/verification/phase-1-reconciliation.md', 'utf8');
    for (const status of [
      'Proven complete',
      'Implemented, unverified',
      'Partial',
      'Missing',
      'Conflict',
      'External gate',
    ]) expect(matrix).toContain(status);
    for (const capability of requiredCapabilities) expect(matrix).toContain(`| ${capability} |`);
  });

  it('keeps the release on hold and retires stale completion tables', async () => {
    const [matrix, legacy, milestone] = await Promise.all([
      readFile('docs/verification/phase-1-reconciliation.md', 'utf8'),
      readFile('docs/verification/phase-1-acceptance-status.md', 'utf8'),
      readFile('docs/milestone8-acceptance-matrix.md', 'utf8'),
    ]);
    expect(matrix).toContain('Release status: **HOLD**');
    expect(legacy).toContain('SUPERSEDED by `phase-1-reconciliation.md`');
    expect(milestone).toContain('SUPERSEDED by `verification/phase-1-reconciliation.md`');
    expect(milestone).not.toContain('RPO ≤24h');
    expect(milestone).not.toContain('RTO ≤8h');
  });
});
```

- [ ] **Step 2: Run the test and verify all three reconciliation requirements fail**

Run:

```powershell
npx vitest run tests/tooling/reconciliation.test.ts
```

Expected: FAIL because the new matrix does not exist and the legacy files still claim stale completion and recovery targets.

- [ ] **Step 3: Create the evidence vocabulary and initial capability ledger**

Create `docs/verification/phase-1-reconciliation.md` with the following initial classifications, refining only the evidence links and exact automated counts observed in Task 5:

```markdown
# Phase 1 PRD-to-code reconciliation

Release status: **HOLD**

## Status vocabulary

- **Proven complete:** Required implementation and current evidence pass through the required surface.
- **Implemented, unverified:** Implementation exists, but required API, device, security, or operational evidence is missing.
- **Partial:** Only part of the product promise or invariant exists.
- **Missing:** No qualifying implementation exists in the trusted baseline.
- **Conflict:** Existing behavior or documentation contradicts the current authority.
- **External gate:** Completion depends on a provider, device, named owner, legal review, or production configuration.

## Capability ledger

| Capability | Current classification | Trusted implementation/evidence | Gap and owning follow-up plan |
|---|---|---|---|
| Authority and scope | Proven complete | Canonical PRD hash test; rebaseline design | Maintain through documentation tests |
| Authentication and recovery | Partial | Auth UI and callback contracts exist | Real email, cold/warm links, expiry/reuse, rate-limit and device evidence — Journey/Quality plans |
| Hair Passport | Implemented, unverified | Trusted migration, domain/database/mobile tests | Full device journey, accessibility and large-data evidence — Journey/Quality plans |
| Chemical Services | Implemented, unverified | Trusted migration, domain/database/mobile tests | Authenticated Supabase replay and device journey — Journey/Quality plans |
| My Shelf and provenance | Partial | Domain contracts and archived candidate SQL | Rebuild schema, immutable ownership, claim provenance, consumer UI and operator evidence — Shelf plan |
| My Tools | Partial | Domain contracts and archived candidate SQL | Rebuild schema, explicit unknowns, ownership/history and consumer UI — Tools plan |
| Activities and unified history | Partial | Domain contracts and archived candidate SQL; draft disposition | Build immutable RPC boundary, UI, drafts, duplicates, corrections/voids and history — Activity plan |
| Settings and consent | Partial | Unintegrated screens/contracts and archived candidate SQL | Promote through tested schema/RPC and integrate routed Settings journey — Journey plan |
| Export and portability | Partial | Unintegrated screen/contracts and archived candidate SQL | Rebuild job lifecycle, complete dataset, signed authorization, retention and device evidence — Journey plan |
| Deletion and restore enforcement | Partial | Unintegrated screen/contracts and archived candidate SQL | Rebuild lifecycle, session revocation, ordered purge, restore tombstones and device evidence — Journey/Beta plans |
| Security and RLS | Partial | Passport/Services owner-isolation tests | Review every promoted table/function, authenticated API suite and independent security review — every capability/Beta plan |
| UX and accessibility | Partial | Shared controls and selected label tests | Complete navigation, states, TalkBack, large text, contrast and external WCAG review — Journey/Quality plans |
| Analytics and observability | Missing | Consent contract only; no approved collection pipeline | Consent-gated PostHog allowlist, scrubbed Sentry, logs, dashboards and alerts — Quality plan |
| CI and automated quality | Partial | Local scripts and Vitest coverage threshold | GitHub Actions, dependency scanning, Maestro and mutation-test scope — Quality plan |
| Performance and resilience | Missing | No current representative-device or poor-network evidence | Pagination, fixtures, offline/conflict tests and p95 measurements — Journey/Quality plans |
| Backup and disaster recovery | External gate | Restore script and archived tombstone candidates are not proof | Provider backups and rehearsal proving RPO ≤1h/RTO ≤4h — Beta plan |
| POPIA and operating ownership | External gate | Product policy exists | Named officers/owners, retention validation, cross-border review and legal sign-off — Beta plan |
| Beta release evidence | External gate | EAS configuration and device-matrix drafts exist | Signed build, internal track, complete device/security/accessibility/operations evidence and gate review — Beta plan |

## Promotion rule

A capability moves to **Proven complete** only when its trusted implementation and all required evidence are linked in this document. A commit, archived migration, screen file, plan checkbox, or local-only test cannot independently establish completion.
```

- [ ] **Step 4: Retire the stale status documents without deleting their history**

At the top of `docs/verification/phase-1-acceptance-status.md`, add:

```markdown
> **SUPERSEDED by `phase-1-reconciliation.md` on 23 September 2026.** This file is retained as historical evidence and must not be used for current release status.
```

At the top of `docs/milestone8-acceptance-matrix.md`, add:

```markdown
> **SUPERSEDED by `verification/phase-1-reconciliation.md` on 23 September 2026.** This draft contains stale completion claims and must not be used for release decisions.
```

Replace the stale backup gate in the legacy milestone matrix with `RPO ≤1h, RTO ≤4h verified` so searches do not continue surfacing the retired target.

- [ ] **Step 5: Run the reconciliation and full verification suites**

Run:

```powershell
npx vitest run tests/tooling/reconciliation.test.ts
npm run verify
```

Expected: both PASS.

- [ ] **Step 6: Commit the reconciliation matrix**

```powershell
git add -- docs/verification/phase-1-reconciliation.md docs/verification/phase-1-acceptance-status.md docs/milestone8-acceptance-matrix.md tests/tooling/reconciliation.test.ts
git commit -m "docs: publish phase 1 reconciliation matrix"
```

---

### Task 7: Close the baseline plan with an independent review gate

**Files:**
- Modify: `docs/verification/rebaseline-2026-09-23.md`
- Modify: `docs/verification/phase-1-reconciliation.md`
- Test: complete verification suite and Git diff review

**Interfaces:**
- Consumes: Tasks 1–6 and their commits
- Produces: reviewed baseline suitable for the Activity, Shelf, Tools, Journey, Quality, and Beta plans

- [ ] **Step 1: Run the final local verification commands from a clean working tree**

Run:

```powershell
git status --short
npm run verify
git diff --check HEAD~6..HEAD
```

Expected: clean status before generated build output, `npm run verify` exits 0, and `git diff --check` reports no whitespace errors. Remove generated `apps/mobile/dist` output if it is ignored but left locally; do not commit build artifacts.

- [ ] **Step 2: Review the security-sensitive diff**

Inspect:

```powershell
git diff HEAD~6..HEAD -- supabase package.json apps/mobile/package.json tests docs/verification README.md docs/PHASE_1.md
```

Confirm that no migration content was silently edited during archival, no service key or credential was added, no source under `sources/` changed, and the release remains HOLD.

- [ ] **Step 3: Request an independent code and security review**

The reviewer must specifically verify:

- The two trusted migrations still replay and preserve existing ownership/history tests.
- Candidate migrations cannot be applied accidentally.
- Removed Activity drafts were unreferenced and violated the intended mutation boundary.
- Documentation does not call archived or unverified work complete.
- External checks are recorded as external gates, not false passes.

- [ ] **Step 4: Address every Critical or High finding and rerun verification**

For each accepted finding, add a failing regression test, implement the smallest correction, and rerun its focused test plus `npm run verify`. Do not weaken tests to accommodate unsafe behavior.

- [ ] **Step 5: Record review outcome**

Append a `Review outcome` section to `docs/verification/rebaseline-2026-09-23.md` with reviewer identity or task reference, review date, findings by severity, resolution commits, and final verification command output summary.

- [ ] **Step 6: Commit review evidence if it changed documentation**

```powershell
git add -- docs/verification/rebaseline-2026-09-23.md docs/verification/phase-1-reconciliation.md
git commit -m "docs: record phase 1 baseline review"
```

The next plan begins only after this gate passes. Use the reconciliation matrix to choose between Activity, Shelf, and Tools; Activity is the default recommendation because its unfinished draft currently causes the most visible repository instability and its event semantics affect the unified History design.
