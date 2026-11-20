import { describe, expect, it } from 'vitest';
import config from '../../vitest.config';

describe('critical module coverage gates', () => {
  const critical = [
    'apps/mobile/src/auth.tsx', 'apps/mobile/src/contracts.ts',
    'apps/mobile/src/guidance/**/*.ts', 'apps/mobile/src/useProtocolExecutionController.ts',
    'apps/mobile/src/ProtocolExecution.tsx', 'apps/mobile/src/TodayGuidance.tsx',
    'scripts/lock-agreement.ts',
  ];
  it.each(critical)('includes and individually gates %s on all four metrics', path => {
    const coverage = config.test?.coverage;
    expect(coverage?.include).toContain(path);
    const gates = coverage?.thresholds as Record<string, unknown>;
    expect(gates[path]).toMatchObject({ statements: 80, branches: 80, functions: 80, lines: 80, perFile: true });
  });
});
