import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => {
  return { StyleSheet: { create: (value: unknown) => value } };
});

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc },
}));

import { changeUsername, usernameErrorMessage } from '../../apps/mobile/src/settings-api';
import { parseRecoveryCallback } from '../../apps/mobile/src/contracts';

const operationId = 'f0000000-0000-4000-8000-000000000020';
const userId = 'f0000000-0000-4000-8000-000000000021';

describe('settings mobile boundary', () => {
  it('sends a username change without owner fields', async () => {
    rpc.mockResolvedValueOnce({ data: { userId, username: 'new.name' }, error: null });
    await expect(changeUsername(operationId, 'new.name')).resolves.toEqual({ userId, username: 'new.name' });
    expect(rpc).toHaveBeenLastCalledWith('username_change', { p_operation_id: operationId, p_new_username: 'new.name' });
    const parameters = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(parameters).not.toHaveProperty('user_id');
  });

  it('rejects a receipt that leaks foreign fields', async () => {
    rpc.mockResolvedValueOnce({ data: { userId, username: 'x', email: 'x@y.test' }, error: null });
    await expect(changeUsername(operationId, 'x')).rejects.toThrow();
  });

  it('rejects blank names before sending', async () => {
    await expect(changeUsername(operationId, '   ')).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalledWith('username_change', expect.anything());
  });

  it('maps username failures to actionable messages without internals', () => {
    expect(usernameErrorMessage('username-taken')).toContain('taken');
    expect(usernameErrorMessage('username-change-too-soon')).toContain('7 days');
    expect(usernameErrorMessage('reserved-username')).toContain('reserved');
    expect(usernameErrorMessage('invalid-username')).toContain('3–32');
    expect(usernameErrorMessage('SQL profiles secret')).not.toContain('SQL');
  });
});

describe('recovery callback hardening', () => {
  it('rejects oversized codes, credentials and foreign schemes', async () => {
    const { parseRecoveryCallback: parse } = await import('../../apps/mobile/src/contracts');
    expect(parse('strandcue://auth/callback?code=abc', true)).toBe('abc');
    expect(parse(`strandcue://auth/callback?code=${'a'.repeat(2049)}`, true)).toBeNull();
    expect(parse(`strandcue://auth/callback?code=${'a'.repeat(2048)}`, true)).toBe(`${'a'.repeat(2048)}`);
    expect(parse('strandcue://user:pass@auth/callback?code=a', true)).toBeNull();
    expect(parse('strandcue://auth/callback?code=a&other=b', true)).toBe('a');
    expect(parse('STRANDCUE://auth/callback?code=a', true)).toBe('a');
    expect(parse('strandcue://other/callback?code=a', true)).toBeNull();
    expect(parse('', true)).toBeNull();
  });
});
