# Release and mutation tooling

Two supply-chain-sensitive tools run in CI from their own committed, non-workspace
lockfiles: the EAS CLI used by the manual signed Android build, and the Stryker
mutation runner used by the optional mutation-testing workflow. They are
deliberately outside the npm workspaces so each tool installs from its own
versioned lock rather than the application dependency tree.

## The two isolated runners

| Runner | Path | Exact pins | Lockfile |
| --- | --- | --- | --- |
| EAS CLI runner | `tools/eas-runner` | `eas-cli` `24.10.0` | `tools/eas-runner/package-lock.json` (committed) |
| Mutation runner | `tools/mutation-runner` | `@stryker-mutator/core` `10.0.0`, `@stryker-mutator/vitest-runner` `10.0.0`, `typescript` `6.0.3`, `vitest` `5.0.0` | `tools/mutation-runner/package-lock.json` (committed) |

Each runner keeps its own committed lockfile. The root `package.json`
`workspaces` list is `["apps/*", "packages/*"]`; `tools/*` is deliberately outside
the npm workspaces, so a runner is not a workspace member and CI installs it only
from its committed lock with `npm ci`. This is what keeps the credential-bearing
release step from fetching anything from the registry at run time.

## Install and invoke

`android-build.yml`:

    - run: npm ci --ignore-scripts
    - name: Install the locked EAS CLI runner
      run: npm ci --ignore-scripts --prefix tools/eas-runner
    # inside the credential-bearing build step:
    EAS_CLI="$GITHUB_WORKSPACE/tools/eas-runner/node_modules/.bin/eas"
    test -x "$EAS_CLI"
    "$EAS_CLI" build --platform android --profile "$BUILD_PROFILE" --non-interactive --wait --json > eas-build-result.json

The step fails rather than fetching if the locked binary is absent (`test -x`).
Before the artifact is uploaded it scans `eas-build-result.json` and fails closed
if the release credential appears in the file.

`mutation-testing.yml`:

    - run: npm ci --ignore-scripts
    - run: npm ci --ignore-scripts --prefix tools/mutation-runner
    - run: node tools/mutation-runner/node_modules/@stryker-mutator/core/bin/stryker.js run

## The coverage gap: both runners are outside the dependency-policy audit surface

**Both `tools/eas-runner` and `tools/mutation-runner` are outside the dependency-policy
audit surface.** `scripts/audit-dependencies-cli.ts` builds its
surface context from `workspaceManifestGlobs(root)` in
`scripts/workspace-manifests.ts`, which admits only the `apps/*` and `packages/*`
workspace roots. A directory outside those roots is invisible to it, so
`npm run audit:dependencies` never sees either runner's dependency tree and neither
tree appears in the reviewed advisory gate.

Measured exposure (each runner's own `npm install` then `npm audit`, captured for
this task; the columns are high / moderate / low / total):

| Runner | high | moderate | low | total |
| --- | --- | --- | --- | --- |
| `tools/eas-runner` | 15 | 16 | 1 | 32 |
| `tools/mutation-runner` | 0 | 2 | 0 | 2 |

## Why the EAS CLI cannot live in the audited workspace

Placing `eas-cli` in `apps/mobile` `devDependencies` and regenerating the root
lockfile adds the whole `eas-cli` subtree to the audited dependency surface
(measured: 23 new vulnerable packages, 11 high / 11 moderate / 1 low) and produces
an unexceptable `ADVISORY-SEVERITY` finding. `isExpoOrMetroBuildToolPath`
(`scripts/dependency-policy.ts:252-262`) admits only `@expo/cli`,
`@expo/code-signing-certificates`, `@react-native/community-cli-plugin`,
`@react-native/metro-config`, `metro`, `metro-*` and `@expo/metro*`, and
`EXCEPTION-HIGH-SCOPE` (`scripts/dependency-policy.ts:537-553`) requires every path
in a high-severity exception to be one of those. No entry in
`docs/verification/dependency-advisory-exceptions.json` can satisfy that
constraint, so the workspace placement cannot be made green without weakening a
control.

## Open decision

Whether the isolated runner lockfiles should be brought into a reviewed advisory
gate is an open decision, not one this placement settles. Either:

1. bring `tools/*/package-lock.json` into a reviewed advisory gate — extend the
   audit surface to the `tools/*` roots, or add a separate pinned audit per tree
   with its own exception policy; or
2. explicitly accept the risk that both runners' advisories stay out of
   `npm run audit:dependencies`.

Coverage decision owner: <UNASSIGNED - must be named before CI-001 can be closed>

CI-001 stays open until that field names an accountable person and the decision
above is recorded.
