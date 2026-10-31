# Dependency reachability review — updated 7 October 2026

This review records the evidence behind the temporary dependency exceptions. It is not a claim that the affected packages are patched.

## Current audit

`npm audit --include=dev --json` reports 19 high, 10 moderate, and zero critical vulnerability nodes. The 19 high nodes resolve to two concrete advisories:

- `GHSA-vfj7-8cjw-p6xm` in `braces@3.0.3`.
- `GHSA-86w9-cpqp-85rv` in `node-forge@1.4.0`.

The audit briefly reported `GHSA-68fv-2mgg-jv7q` in `source-map-js@1.2.1`. That advisory has a patched release, so the lockfile was updated to `source-map-js@1.2.2`; it is absent from the fresh audit and has no exception. On 7 October the audit also reported critical `GHSA-pqg4-j6r4-53mv` in `shell-quote@1.10.0`; the lockfile was updated to patched `1.12.0`, so the critical finding is also absent and unexcepted.

## Reachability and surfaces

Repository source does not import `braces` or `node-forge`. `npm ls --all` places `braces` below Metro/Expo CLI through `micromatch`, and places `node-forge` below `@expo/cli` and `@expo/code-signing-certificates`. The reviewed paths are build and bundling paths. Neither dependency is an application runtime dependency, and inspection of the signed Android APK found no Node package tree or entries for either package.

The policy therefore records both advisories as `reachable: no` for the shipped Android and web application and classifies every observed path as `development`. The exception schema permits high-severity exceptions only when they are marked `expo-build-tooling`, unreachable, limited to `development` or `ios-build-tooling`, and expire within 60 days. Any Android, web, production, mixed, unclassified, critical, newly observed, or stale path fails the gate.

## Controls and expiry

Build inputs and configuration must remain trusted, and release builds must run in controlled CI. The exceptions were approved on 6 October 2026, require review by 5 November 2026, and expire on 5 December 2026. Stale UUID/Xcode paths were removed when the 7 October audit no longer observed them. On 10 October, adding Expo Sharing for native export delivery reintroduced the reviewed `uuid` advisory only through `expo-sharing > @expo/config-plugins > xcode > uuid`; the policy records that exact path with the conservative Android, web, production, and iOS-build-tooling surface tuple while the affected call remains in iOS configuration tooling. The remaining exceptions must be removed when compatible Expo, React Native, Metro, or Expo Sharing releases remove the affected transitive versions.

The policy does not hide the audit totals: a passing gate still reports the 19 high vulnerability nodes and four reviewed advisory records.
