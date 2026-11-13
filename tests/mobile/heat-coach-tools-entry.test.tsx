import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Tools } from '../../apps/mobile/src/tools';
import { flush, hasPressable, press } from '../helpers/native-render';

vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);
vi.mock('expo-crypto', () => ({ randomUUID: () => 'e0000000-0000-4000-8000-000000000001' }));
const calls = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }));
vi.mock('../../apps/mobile/src/tool-api', async importOriginal => ({
  ...await importOriginal<typeof import('../../apps/mobile/src/tool-api')>(),
  listUserTools: calls.list, getUserTool: calls.detail,
}));
vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc: vi.fn() },
  secureStorage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));

const owner = 'b0000000-0000-4000-8000-000000000001';
const toolId = 'a0000000-0000-4000-8000-000000000002';
const item = { id: toolId, revision: 1, availability: 'available', manualBrand: 'Salon brand',
  manualModel: 'Pro dryer', toolType: 'dryer', matched: false, catalogueLifecycle: null,
  condition: null, heatMethods: null };
const detail = { ...item, matchConfirmed: false, wattageWatts: null, adjustableTemp: null,
  settings: null, attachments: null, notes: null, versionId: null, revisions: [] };
async function render(availability: 'available' | 'out_of_stock' | 'archived') {
  calls.list.mockResolvedValue({ items: [{ ...item, availability }], nextCursor: null });
  calls.detail.mockResolvedValue({ ...detail, availability });
  const onOpenHeatCoach = vi.fn();
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(Tools, { owner, onOpenHeatCoach })); });
  await flush(8);
  await act(async () => { press(renderer, 'View tool entry: Salon brand Pro dryer'); });
  await flush(8);
  return { renderer, onOpenHeatCoach };
}

beforeEach(() => { calls.list.mockReset(); calls.detail.mockReset(); });

describe('Heat Coach entry from My Tools', () => {
  it('passes only the exact owned active tool ID and display label', async () => {
    const { renderer, onOpenHeatCoach } = await render('available');
    expect(hasPressable(renderer, 'Check heat choices for this tool')).toBe(true);
    await act(async () => { press(renderer, 'Check heat choices for this tool'); });
    expect(onOpenHeatCoach).toHaveBeenCalledWith({ ownerItemId: toolId, label: 'Salon brand Pro dryer' });
  });

  it.each(['archived', 'out_of_stock'] as const)('does not launch from a %s tool detail', async availability => {
    const { renderer, onOpenHeatCoach } = await render(availability);
    expect(hasPressable(renderer, 'Check heat choices for this tool')).toBe(false);
    expect(onOpenHeatCoach).not.toHaveBeenCalled();
  });
});
