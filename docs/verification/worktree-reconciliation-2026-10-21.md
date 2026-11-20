# Worktree reconciliation — 21 October 2026

## Result

The primary checkout at `C:\Users\ABADO\Desktop\StrandCue` now uses
`codex/full-product-integration` at `38d64cc`. The superseded
`codex/core-guidance-engine` checkout was cleaned only after its complete dirty
state was preserved outside Git.

## Recovery archive

`C:\Users\ABADO\Desktop\StrandCue-recovery-archive-2026-10-21` contains:

- `core-guidance-engine.bundle`, preserving the branch history;
- `tracked-working-tree.patch`, preserving all seven tracked modifications;
- 94 untracked files under `untracked/` (279,234,944 bytes);
- SHA-256 and size metadata for every archived untracked file; and
- separate copies and manifests for the dirty Today-guidance and
  protocol-execution worktrees before their removal.

The archive includes the review document, screenshots, APKs, database backup
files, Android prebuild files, test logs, specifications, migrations and tests
that had been left in the original checkout. Generated Gradle cache files were
removed after the authored Android prebuild files had been archived.

## Classification

- `codex/core-guidance-engine`: superseded. Its recommendation engine and
  navigation work already exist in the integrated branch under later commits;
  merging it would remove newer security, privacy, guidance and acceptance
  work.
- Today guidance, basic wash, condition-aware guidance, chemical services,
  Docker setup, phase-one stabilization, security remediation and the Claude
  catalogue worktree: contained ancestors or superseded checkouts. Their
  worktree directories were removed; branch refs remain available.
- `codex/protocol-execution`: its unique research commit remains reachable
  through `codex/research-reconciliation`; its two dirty documents were copied
  into the recovery archive before removal.
- `codex/research-reconciliation` and `codex/research-source-archive`: retained
  as the only remaining linked worktrees. They contain draft research that must
  be reviewed and selectively ported; it must not be merged wholesale or treated
  as published product evidence.

## Safety boundaries

No branch was deleted, rebased, reset, merged or pushed. No hosted service was
changed. The primary checkout was clean before and after switching it to the
integration branch. Recovery remains possible from the named branch refs and
the external bundle, patch and file manifests.
