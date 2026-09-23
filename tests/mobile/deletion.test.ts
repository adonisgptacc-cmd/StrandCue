import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => {
  return { StyleSheet: { create: (value: unknown) => value } };
});

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc },
}));

import {
  cancelDeletion,
  deletionStatusMessage,
  recentAuthMessage,
  requestDeletion,
  statusDeletion,
} from '../../apps/mobile/src/deletion-api';

const operationId = 'f0000000-0000-4000-8000-000000000010';

describe('deletion mobile boundary', () => {
  it('requests deletion with an operation id and reason, no owner fields', async () => {
    rpc.mockResolvedValueOnce({ data: { accountStatus: 'deleting', message: 'Deletion initiated. Access is now blocked.' }, error: null });
    await expect(requestDeletion(operationId, 'leaving')).resolves.toMatchObject({ accountStatus: 'deleting' });
    expect(rpc).toHaveBeenLastCalledWith('deletion_request', { p_operation_id: operationId, p_reason: 'leaving' });
    const parameters = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(parameters).not.toHaveProperty('user_id');
  });

  it('rejects a receipt that leaks foreign fields', async () => {
    rpc.mockResolvedValueOnce({ data: { accountStatus: 'deleting', user_id: 'x' }, error: null });
    await expect(requestDeletion(operationId, 'leaving')).rejects.toThrow();
  });

  it('parses status across the lifecycle without exposing email', async () => {
    rpc.mockResolvedValueOnce({
      data: { accountStatus: 'deleting', tombstoneExists: true, deletedAt: '2024-03-01T10:00:00.000000Z', purgeCompletedAt: null, deletionReason: 'leaving' },
      error: null,
    });
    const status = await statusDeletion();
    expect(status).toMatchObject({ accountStatus: 'deleting', tombstoneExists: true });
    expect(status).not.toHaveProperty('email');
    expect(deletionStatusMessage(status)).toContain('blocked');
  });

  it('cancels deletion and reports the restored state', async () => {
    rpc.mockResolvedValueOnce({ data: { accountStatus: 'active', message: 'Account deletion cancelled. Full access restored.' }, error: null });
    await expect(cancelDeletion()).resolves.toMatchObject({ accountStatus: 'active' });
    expect(rpc).toHaveBeenLastCalledWith('deletion_cancel', {});
  });

  it('surfaces recent-auth and terminal-state failures distinctly', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'recent-auth-required' } });
    await expect(requestDeletion(operationId, 'leaving')).rejects.toThrow(/recent-auth-required/i);
    expect(recentAuthMessage('recent-auth-required')).toContain('sign in again');
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'deletion-not-in-progress' } });
    await expect(cancelDeletion()).rejects.toThrow(/deletion-not-in-progress/i);
  });
});
