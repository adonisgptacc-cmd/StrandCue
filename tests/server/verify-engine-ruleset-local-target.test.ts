import { describe, expect, it } from 'vitest';

import { parseLocalApiTarget, parseLocalDatabaseTarget } from '../../scripts/verify-engine-ruleset-local-target.ts';

describe('WO-C local proof target validation', () => {
  it('accepts the dedicated numeric-loopback API target', () => {
    expect(parseLocalApiTarget('http://127.0.0.1:55431').origin).toBe('http://127.0.0.1:55431');
  });

  it('rejects localhost API hosts before requests are sent', () => {
    expect(() => parseLocalApiTarget('http://localhost:55431')).toThrow('Refusing a non-numeric-loopback API host');
  });

  it('accepts the dedicated numeric-loopback PostgreSQL target', () => {
    expect(parseLocalDatabaseTarget('postgresql://user:password@[::1]:55432/postgres').hostname).toBe('[::1]');
  });

  it('rejects localhost database hosts before SQL runs', () => {
    expect(() => parseLocalDatabaseTarget('postgresql://user:password@localhost:55432/postgres'))
      .toThrow('Refusing a non-numeric-loopback database host');
  });
});
