import { describe, expect, it } from 'vitest';
import { auditNodeVersion } from '../../scripts/runtime-policy';

describe('Node runtime policy', () => {
  it('accepts Node 24', () => {
    expect(auditNodeVersion('v24.21.0')).toEqual([]);
  });

  it.each(['v22.13.0', 'v25.1.0', 'v26.0.0', 'not-a-version'])(
    'rejects unsupported runtime %s',
    version => expect(auditNodeVersion(version).map(item => item.code)).toContain('NODE-VERSION'),
  );
});
