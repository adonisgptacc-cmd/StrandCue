import { defineConfig } from 'vitest/config';

// Each critical boundary has its own floor; broad domain coverage cannot hide
// an untested mobile security path. The guidance glob also gates new modules.
const criticalModules = [
  'apps/mobile/src/auth.tsx', 'apps/mobile/src/contracts.ts',
  'apps/mobile/src/guidance/**/*.ts', 'apps/mobile/src/useProtocolExecutionController.ts',
  'apps/mobile/src/ProtocolExecution.tsx', 'apps/mobile/src/TodayGuidance.tsx',
  'scripts/lock-agreement.ts', 'scripts/audit-control-plane.ts', 'scripts/audit-cli.ts',
  'scripts/expo-sdk-evidence.ts', 'scripts/local-supabase-test-target.ts',
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
