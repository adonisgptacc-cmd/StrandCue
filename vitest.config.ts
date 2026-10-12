import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'packages/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/domain/src/**/*.ts', 'scripts/validate-guidance-research.ts', 'scripts/catalogue-compiler.ts', 'scripts/compile-catalogue-intake.ts'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
