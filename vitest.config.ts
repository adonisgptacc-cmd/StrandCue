import { defineConfig } from 'vitest/config';

// Each critical boundary has its own floor; broad domain coverage cannot hide
// an untested mobile security path. The guidance glob also gates new modules.
const criticalModules = [
  'apps/mobile/src/auth.tsx', 'apps/mobile/src/contracts.ts',
  'apps/mobile/src/passport-editor.tsx', 'apps/mobile/src/passport-completeness.ts',
  'apps/mobile/src/MyHairOverview.tsx',
  'apps/mobile/src/shelf.tsx', 'apps/mobile/src/shelf-editor.tsx',
  'apps/mobile/src/shelf-api.ts', 'apps/mobile/src/shelf-history.ts',
  'apps/mobile/src/shelf-drafts.ts',
  'apps/mobile/src/CatalogueMatch.tsx', 'apps/mobile/src/catalogue-match-copy.ts',
  'apps/mobile/src/catalogue-search-api.ts',
  'apps/mobile/src/ProductDetail.tsx', 'apps/mobile/src/product-detail-copy.ts',
  'apps/mobile/src/catalogue-detail-api.ts',
  'apps/mobile/src/tools.tsx', 'apps/mobile/src/tool-editor.tsx', 'apps/mobile/src/tool-api.ts', 'apps/mobile/src/tool-form.ts',
  'apps/mobile/src/tool-copy.ts', 'apps/mobile/src/tool-history.ts', 'apps/mobile/src/tool-drafts.ts',
  'apps/mobile/src/ToolMatch.tsx', 'apps/mobile/src/ToolCatalogueDetail.tsx', 'apps/mobile/src/tool-catalogue-api.ts',
  'apps/mobile/src/guidance/**/*.ts', 'apps/mobile/src/guidance/protocol-preview-model.ts', 'apps/mobile/src/useProtocolExecutionController.ts',
  'packages/domain/src/guidance/prepared-input.ts', 'packages/domain/src/guidance/prepare-guidance.ts',
  'packages/domain/src/guidance/schemas.ts', 'packages/domain/src/current-condition.ts',
  'packages/domain/src/cue-check.ts', 'packages/domain/src/personal-outcome-summary.ts',
  'packages/domain/src/care-events.ts',
  'apps/mobile/src/cue-check-api.ts', 'apps/mobile/src/cue-check-errors.ts', 'apps/mobile/src/cue-check-state.ts',
  'apps/mobile/src/cue-check-copy.ts', 'apps/mobile/src/cue-check-form-model.ts', 'apps/mobile/src/cue-check-records.ts',
  'apps/mobile/src/cue-check-entry.ts', 'apps/mobile/src/cue-check-routines.ts', 'apps/mobile/src/cue-check-announce.ts',
  'apps/mobile/src/useCueCheckController.ts',
  'apps/mobile/src/CueCheckForm.tsx', 'apps/mobile/src/CueCheckQuestion.tsx', 'apps/mobile/src/CueCheckHistory.tsx',
  'apps/mobile/src/CueCheckDetail.tsx', 'apps/mobile/src/CueCheckTimeline.tsx', 'apps/mobile/src/CueCheckAnswers.tsx',
  'apps/mobile/src/CueCheckVoidConfirmation.tsx', 'apps/mobile/src/CueCheckSummary.tsx', 'apps/mobile/src/CueCheckEntryPoint.tsx',
  'apps/mobile/src/CueCheckRoutines.tsx', 'apps/mobile/src/CueCheckJourney.tsx',
  'apps/mobile/src/ProtocolExecution.tsx', 'apps/mobile/src/TodayGuidance.tsx',
  'apps/mobile/src/GuidanceGapResolver.tsx',
  'scripts/lock-agreement.ts', 'scripts/audit-control-plane.ts', 'scripts/audit-cli.ts',
  'scripts/expo-sdk-evidence.ts', 'scripts/local-supabase-test-target.ts',
  'scripts/audit-dependencies-cli.ts', 'scripts/runner-dependency-policy.ts',
  'scripts/android-local-preflight.ts',
  'scripts/verify-android-artifact.ts',
  'scripts/android-native-manifest.ts',
  'scripts/supabase-owner-isolation.ts',
  'scripts/owner-isolation-scenarios.ts', 'scripts/owner-isolation-live.ts',
];
const floor = { lines: 80, statements: 80, functions: 80, branches: 80 };

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'packages/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/domain/src/**/*.ts', 'scripts/validate-guidance-research.ts', 'scripts/catalogue-compiler.ts', 'scripts/compile-catalogue-intake.ts', ...criticalModules],
      thresholds: { ...floor, ...Object.fromEntries(criticalModules.map(path => [path, { ...floor, perFile: true }])) },
    },
  },
});
