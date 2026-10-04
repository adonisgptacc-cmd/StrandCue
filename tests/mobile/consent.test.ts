import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => {
  return { StyleSheet: { create: (value: unknown) => value } };
});

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc },
}));

import { listConsents, setConsent } from '../../apps/mobile/src/consent-api';

const operationId = 'f0000000-0000-4000-8000-000000000030';

describe('consent mobile boundary', () => {
  it('records consent without owner fields', async () => {
    rpc.mockResolvedValueOnce({
      data: { purpose: 'marketing_email', granted: true, recordedAt: '2024-03-01T10:00:00.000000Z' },
      error: null,
    });
    await expect(setConsent(operationId, 'marketing_email', true)).resolves.toMatchObject({ purpose: 'marketing_email', granted: true });
    expect(rpc).toHaveBeenLastCalledWith('consent_set', { p_operation_id: operationId, p_purpose: 'marketing_email', p_granted: true });
    const parameters = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(parameters).not.toHaveProperty('user_id');
  });

  it('rejects unknown purposes before sending', async () => {
    await expect(setConsent(operationId, 'sell_my_data' as never, true)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalledWith('consent_set', expect.anything());
  });

  it('rejects a receipt that leaks foreign fields', async () => {
    rpc.mockResolvedValueOnce({ data: { purpose: 'marketing_email', granted: true, recordedAt: '2024-03-01T10:00:00.000000Z', user_id: 'x' }, error: null });
    await expect(setConsent(operationId, 'marketing_email', true)).rejects.toThrow();
  });

  it('lists current consent per purpose', async () => {
    rpc.mockResolvedValueOnce({ data: { marketing_email: true, product_analytics: false }, error: null });
    await expect(listConsents()).resolves.toEqual({ marketing_email: true, product_analytics: false });
    expect(rpc).toHaveBeenLastCalledWith('consent_list', {});
  });

  it('surfaces required-purpose denial distinctly', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'required-purpose' } });
    await expect(setConsent(operationId, 'hair_passport_processing', false)).rejects.toThrow(/required-purpose/i);
  });
});
