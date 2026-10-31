# Final handoff — signed Android acceptance

Run date: 2026-10-18, Africa/Johannesburg.

**Current decision: Android HOLD; overall launch HOLD.** The signed artifact is
verified and was installed on a fresh API 34 emulator, but app startup failed
with `SoLoaderDSONotFoundError: couldn't find DSO to load: libreactnative.so`.
The cause is unresolved. All nine protocol scenarios remain BLOCKED (0/9 run).
The live App Links check also reports HOLD because the deployed association
does not match this app and signer.

Artifact identity: source commit
`d8c2818a7fac0e996910a5a33d6784875800993b`; package `za.co.strandcue.app`,
version `0.1.0` (code 1), ABI `arm64-v8a`; APK SHA-256
`b16ccedf1591eb1819106aaf91170be83de280f26be9b274ec148493c37d12b3`; public
signer certificate SHA-256
`b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`. The
APK and its three-field source receipt remain outside Git.

Initial local gates passed: offline verification (135 files passed / 2 skipped;
2,260 tests passed / 9 skipped; 0 failed; coverage 96.69 / 91.48 / 98.52 /
98.41% statements / branches / functions / lines), Expo check, dependency
policy, Android preflight, artifact verifier, zipalign, apksigner, package/ABI
inspection, and diff check. After verifier fix commit `67e5899`, focused
verification passed 25/25 with coverage 93.60 / 88.88 / 100 / 96.11%; bounded
full coverage passed 135 files / 2 skipped and 2,263 tests / 9 skipped with
coverage 96.70 / 91.51 / 98.52 / 98.41%. Two dependency-policy CLI tests
timed out in the initial parallel attempt and passed in isolation. The full-plan
reviewer initially held four verifier/evidence findings; the fix commit
addressed all four, and scoped re-review was APPROVED with no new Critical,
High, or Medium findings. The full-plan review gate is satisfied. The
release-link check is HOLD. Gitleaks was not installed for a fresh scan.
Details and exact outcomes are in the
[Task 7 report](../2026-10-18-local-signed-android-apk-and-device-acceptance/task-7-report.md)
and [canonical launch decision](../../../docs/verification/security-audit-launch-decision-2026-10-18.md).

Resume only after a bounded native startup diagnosis identifies and fixes the
failure, a new candidate is bound to an exact source receipt and passes the
artifact gates, and all nine scenarios complete on that same artifact with
approved synthetic state. The review gate is satisfied for verifier/evidence
commit `67e5899`; any native startup fix needs its own scoped review. Then
resolve the deployed App Links association and collect hosted and named
human-authority evidence for the canonical matrix. No hosted changes,
publication, deployment, push, or merge were performed for this handoff.
