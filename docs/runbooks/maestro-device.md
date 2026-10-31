# Maestro device runs

Prerequisites: Plan A build installed (`adb shell pm list packages | grep strandcue`
shows `za.co.strandcue.app`); Maestro CLI installed
(`curl -Ls https://get.maestro.mobile.dev | bash`).

Offline-safe flows (no sign-in, no network submission):

    maestro test .maestro/01-launch-signup-validation.yaml
    maestro test .maestro/02-recovery-request.yaml

Signed-in flows (Beta device-gate session with a test account):

    maestro test .maestro/03-tab-navigation.yaml
    maestro test .maestro/04-privacy-settings.yaml

Record per-flow PASS/FAIL plus the Maestro output tail in
`docs/verification/device-evidence.md` under `## Maestro runs (<date>)`.
