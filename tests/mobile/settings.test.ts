import { describe, expect, it, vi } from 'vitest';

import { changeUsername, suggestUsernames, usernameErrorMessage, usernameHelperText, usernameIdeasLabel } from '../../apps/mobile/src/settings-api';

vi.mock('react-native', () => {
  return { StyleSheet: { create: (value: unknown) => value } };
});

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc },
}));

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
    expect(usernameErrorMessage('username-taken')).toBe('That username is unavailable. Try another.');
    expect(usernameErrorMessage('username-unavailable')).toBe('That username is unavailable. Try another.');
    expect(usernameErrorMessage('username-change-too-soon')).toContain('7 days');
    expect(usernameErrorMessage('reserved-username')).toContain('reserved');
    expect(usernameErrorMessage('invalid-username')).toContain('3–32');
    expect(usernameErrorMessage('SQL profiles secret')).not.toContain('SQL');
  });

  it('publishes the uniqueness helper copy verbatim', () => {
    expect(usernameHelperText).toBe('Usernames are unique. If yours is taken, try adding numbers or an underscore.');
    expect(usernameIdeasLabel).toContain('not checked');
  });

  it('suggests two idea variants based on the entered username', () => {
    expect(suggestUsernames('mark')).toEqual(['mark_2', 'mark01']);
  });

  it('keeps suggestions within the 32-character field limit', () => {
    for (const idea of suggestUsernames('a'.repeat(32))) {
      expect(idea.length).toBeLessThanOrEqual(32);
    }
  });

  it('suggests nothing for a blank entry', () => {
    expect(suggestUsernames('   ')).toEqual([]);
  });

  it('wires the helper and ideas into the username screen', async () => {
    const { readFile } = await import('node:fs/promises');
    const screen = await readFile('apps/mobile/src/records.tsx', 'utf8');
    expect(screen).toContain('usernameHelperText');
    expect(screen).toContain('suggestUsernames');
    expect(screen).toContain('usernameIdeasLabel');
  });
});

describe('recovery callback hardening', () => {
  it('rejects oversized codes, credentials and foreign schemes', async () => {
    const { parseRecoveryCallback: parse } = await import('../../apps/mobile/src/contracts');
    const flow = '&sb_flow_id=12345678';
    expect(parse(`strandcue://auth/callback?code=abc${flow}`, true)).toEqual({code: 'abc', flowId: '12345678'});
    expect(parse(`strandcue://auth/callback?code=${'a'.repeat(2049)}${flow}`, true)).toBeNull();
    expect(parse(`strandcue://auth/callback?code=${'a'.repeat(2048)}${flow}`, true)).toEqual({code: 'a'.repeat(2048), flowId: '12345678'});
    expect(parse(`strandcue://user:pass@auth/callback?code=a${flow}`, true)).toBeNull();
    expect(parse(`strandcue://auth/callback?code=a&other=b${flow}`, true)).toEqual({code: 'a', flowId: '12345678'});
    expect(parse(`STRANDCUE://auth/callback?code=a${flow}`, true)).toEqual({code: 'a', flowId: '12345678'});
    expect(parse(`strandcue://other/callback?code=a${flow}`, true)).toBeNull();
    expect(parse('', true)).toBeNull();
  });
});
