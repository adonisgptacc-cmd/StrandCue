import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestTodayGuidance } from '../../apps/mobile/src/guidance/today-guidance-server-api';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../apps/mobile/src/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

const command = {
  requestId: '00000000-0000-4000-8000-000000000001',
  goalId: 'basic_wash' as const,
  currentCondition: {
    observedAt: '2026-10-29T09:00:00.000Z',
    concerns: ['dryness'],
    goal: 'basic_wash',
    availableMinutes: 20,
  },
} satisfies Parameters<typeof requestTodayGuidance>[0];

beforeEach(() => mocks.invoke.mockReset());

describe('authenticated Today guidance request', () => {
  it('sends only the request id, goal and current check-in', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'content_pending' }, error: null });
    expect(await requestTodayGuidance(command)).toEqual({ status: 'content_pending' });
    expect(mocks.invoke).toHaveBeenCalledWith('today-guidance', { body: command });
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty('ownerId');
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty('decision');
  });

  it('fails closed on transport or malformed responses', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await expect(requestTodayGuidance(command)).rejects.toThrow('could not be loaded');
    mocks.invoke.mockResolvedValueOnce({ data: { status: 'ready' }, error: null });
    await expect(requestTodayGuidance(command)).rejects.toThrow();
  });
});
