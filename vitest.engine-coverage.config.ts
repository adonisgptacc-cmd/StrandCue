import { defineConfig } from 'vitest/config';

const engineSource = 'packages/engine/src/**/*.ts';
const floor = { lines: 80, statements: 80, functions: 80, branches: 80 };

export default defineConfig({
  test: {
    include: ['tests/engine/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [engineSource],
      thresholds: {
        [engineSource]: { ...floor, perFile: true },
      },
    },
  },
});
