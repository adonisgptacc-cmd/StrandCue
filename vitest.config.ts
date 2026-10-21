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
  'apps/mobile/src/guidance/**/*.ts', 'apps/mobile/src/useProtocolExecutionController.ts',
  'apps/mobile/src/ProtocolExecution.tsx', 'apps/mobile/src/TodayGuidance.tsx',
  'scripts/lock-agreement.ts', 'scripts/audit-control-plane.ts', 'scripts/audit-cli.ts',
  'scripts/expo-sdk-evidence.ts', 'scripts/local-supabase-test-target.ts',
  'scripts/audit-dependencies-cli.ts', 'scripts/runner-dependency-policy.ts',
  'scripts/android-local-preflight.ts',
  'scripts/verify-android-artifact.ts',
  'scripts/android-native-manifest.ts',
  'scripts/supabase-owner-isolation.ts',
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
