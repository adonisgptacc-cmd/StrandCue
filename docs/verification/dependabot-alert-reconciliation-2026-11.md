# Dependabot alert reconciliation

On 2026-11-20 at 17:20 UTC, the paginated GitHub Dependabot API returned seven open alerts after the squash merge of PR #13. The fetched `main` commit was `205f436d17bc90610f16be448837b88f3736651f`. The local comparison used `codex/health-repair-plan-2026-11-20` at `ade395db7207a9ba42c8179fa579ee57d44ac5d6`. [PR #13](https://github.com/adonisgptacc-cmd/StrandCue/pull/13) · [Dependabot alerts](https://github.com/adonisgptacc-cmd/StrandCue/security/dependabot)

For each reported manifest, the comparison checked every package entry in the committed npm lockfile against GitHub's exact vulnerable range, including nested copies. Bold versions match the range. The local working copies agreed with the local commit.

| Alert | Advisory | Package | GitHub manifest | Vulnerable range | Locked on main | Locked locally | First patched version | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [#22](https://github.com/adonisgptacc-cmd/StrandCue/security/dependabot/22) | GHSA-g3hv-75wg-m249 (medium) | `minimatch` | `package-lock.json` | `>= 7.0.0, < 11.0.1` | 3.1.5, **10.2.6** | 3.1.5, **10.2.6**, 11.0.9 | 11.0.1 | Actionable. The root copy is still in range. |
| [#23](https://github.com/adonisgptacc-cmd/StrandCue/security/dependabot/23) | GHSA-73rr-hh4g-fpgx (low) | `diff` | `tools/eas-runner/package-lock.json` | `>= 6.0.0, < 8.0.3` | 4.0.4, **7.0.0** | 4.0.4, **7.0.0** | 8.0.3 | Actionable. EAS still resolves 7.0.0. |
| [#24](https://github.com/adonisgptacc-cmd/StrandCue/security/dependabot/24) | GHSA-w5hq-g745-h8pq (medium) | `uuid` | `tools/eas-runner/package-lock.json` | `< 11.1.1` | **7.0.3**, **8.3.2**, 11.1.1 | **7.0.3**, **8.3.2**, 11.1.1 | 11.1.1 | Actionable. Three nested copies remain in range. |
| [#25](https://github.com/adonisgptacc-cmd/StrandCue/security/dependabot/25) | GHSA-87mf-gv2c-c62c (medium) | `ts-deepmerge` | `tools/eas-runner/package-lock.json` | `< 8.0.0` | **6.2.0** | **6.2.0** | 8.0.0 | Actionable. EAS still resolves 6.2.0. |
| [#26](https://github.com/adonisgptacc-cmd/StrandCue/security/dependabot/26) | GHSA-3g3m-2fjr-6pw4 (medium) | `glob` | `tools/eas-runner/package-lock.json` | `>= 9.0.0, <= 14.0.1` | 6.0.4, **10.5.0**, **13.0.7** | 6.0.4, **10.5.0**, **13.0.7** | 14.0.2 | Actionable. Three copies remain in range. |
| [#27](https://github.com/adonisgptacc-cmd/StrandCue/security/dependabot/27) | GHSA-g3hv-75wg-m249 (medium) | `minimatch` | `tools/eas-runner/package-lock.json` | `>= 7.0.0, < 11.0.1` | 3.1.5, 5.1.9, **9.0.9**, **10.2.6** | 3.1.5, 5.1.9, **9.0.9**, **10.2.6** | 11.0.1 | Actionable. Four nested copies remain in range. |
| [#28](https://github.com/adonisgptacc-cmd/StrandCue/security/dependabot/28) | GHSA-g3hv-75wg-m249 (medium) | `minimatch` | `tools/mutation-runner/package-lock.json` | `>= 7.0.0, < 11.0.1` | **10.2.6** | **10.2.6** | 11.0.1 | Actionable. The mutation runner still resolves 10.2.6. |

Alert #22 covers the whole root lockfile. The local TypeScript ESLint upgrade brings in `minimatch@11.0.9` under `@typescript-eslint/typescript-estree`, while Expo fingerprint still resolves the affected `node_modules/minimatch@10.2.6`. The other six rows have the same package versions on main and locally. [Dependency advisory review](2026-11-20-dependency-advisory-review.md)

## Previously reported node-forge alerts

The API marked root alerts #14–21 fixed at 16:40:10 UTC on 2026-11-20. The highest affected version across those alerts was 1.4.2. On main and locally, `package-lock.json` and `tools/eas-runner/package-lock.json` each resolve `node-forge@1.4.3`. The mutation runner and account-deletion lockfiles have no `node-forge` package entries. The open inventory contains no `node-forge` alert. [Fixed Dependabot alerts](https://github.com/adonisgptacc-cmd/StrandCue/security/dependabot?query=is%3Afixed)

## Dependency policy cross-check

`npm run audit:dependencies` exited 0 with `DEPENDENCY-POLICY-PASS` on the local comparison commit. All four trees had zero high or critical findings. The policy summary still counted three moderate npm entries in the root tree, 14 in EAS, three in mutation, and zero in account deletion. The EAS review also covers the low `diff` advisory. npm counts transitive package findings, and the policy evaluates the reviewed exceptions. The lockfile comparison establishes the open Dependabot dispositions. [Root exception registry](dependency-advisory-exceptions.json) · [EAS runner review](eas-runner-advisory-review.json) · [Mutation runner review](mutation-runner-advisory-review.json)

All seven alerts remain open with vulnerable versions on main. This inventory used read-only GitHub operations.

After the inventory snapshot, PR #14 advanced main to `bc6d0edee6d1430dca79c246a39b07876e0073d0`. Its diff changes three GitHub workflow files and no package manifests or lockfiles, so the seven lockfile comparisons and dispositions remain applicable to the newer main. Re-query alert state before any future resolution action.
