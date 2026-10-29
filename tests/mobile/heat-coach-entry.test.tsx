import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { HeatCoachEntry } from '../../apps/mobile/src/HeatCoachEntry';
import { HeatCoach } from '../../apps/mobile/src/HeatCoach';

vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);
vi.mock('../../apps/mobile/src/client', () => ({ supabase: null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
const original = console.error.bind(console);
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (!String(message).includes('react-test-renderer is deprecated')) original(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const digest = `sha256:${'a'.repeat(64)}`;
const tool = { id, availability: 'available', manualBrand: 'My', manualModel: 'dryer', toolType: 'dryer',
  matched: false, catalogueLifecycle: null, condition: null, heatMethods: null, revision: 1 } as const;
const product = { id, availability: 'available', manualBrand: 'My', manualName: 'spray', manualCategory: null,
  manualVariant: null, manualSize: null, manualBarcode: null, openedOn: null, expiryOn: null,
  pao: null, quantityBand: null, repurchaseIntent: null, revision: 1 } as const;

describe('Heat Coach entry', () => {
  it('shows pending without fetching owner items when publication is draft or absent', async () => {
    const loadTools = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(HeatCoachEntry, {
      ownerKey: 'owner-a', loadPublication: async () => null, loadTools,
      loadProducts: vi.fn(), onNavigate: vi.fn(),
    })); });
    expect(JSON.stringify(renderer.toJSON())).toContain('not available yet');
    expect(loadTools).not.toHaveBeenCalled();
  });

  it('passes an exact owned tool into intent without inferring a heat verdict', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(HeatCoachEntry, {
      ownerKey: 'owner-a', selectedTool: { ownerItemId: id, label: 'My dryer' },
      loadPublication: async () => ({ publicationId: id, publicationDigest: digest }),
      loadTools: async () => ({ items: [tool], nextCursor: null }),
      loadProducts: async () => ({ items: [product], nextCursor: null }),
      onNavigate: vi.fn(),
    })); });
    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain('My dryer');
    expect(text).not.toContain('safe');
    const selected = renderer.root.findAll(node => typeof node.type === 'string'
      && node.props.accessibilityLabel === 'Owned tool: My dryer');
    expect(selected[0]?.props.accessibilityState.selected).toBe(true);
  });

  it('fails closed when owner-item pages repeat the same record', async () => {
    const cursor = { updatedAt: '2026-10-28T10:00:00.000000Z', id };
    const loadTools = vi.fn().mockResolvedValueOnce({ items: [tool], nextCursor: cursor })
      .mockResolvedValueOnce({ items: [tool], nextCursor: null });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(HeatCoachEntry, {
      ownerKey: 'owner-a', loadPublication: async () => ({ publicationId: id, publicationDigest: digest }),
      loadTools, loadProducts: async () => ({ items: [], nextCursor: null }), onNavigate: vi.fn(),
    })); });
    expect(JSON.stringify(renderer.toJSON())).toContain('could not load');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Check heat choices');
  });

  it('discards a late publication result after owner switch', async () => {
    const resolves: ((value: { publicationId: string; publicationDigest: string }) => void)[] = [];
    const loadPublication = vi.fn(() => new Promise<{ publicationId: string; publicationDigest: string }>(yes => { resolves.push(yes); }));
    let renderer!: ReactTestRenderer;
    const props = { ownerKey: 'owner-a', loadPublication, loadTools: vi.fn(), loadProducts: vi.fn(), onNavigate: vi.fn() };
    await act(async () => { renderer = create(createElement(HeatCoachEntry, props)); });
    await act(async () => { renderer.update(createElement(HeatCoachEntry, { ...props, ownerKey: 'owner-b' })); });
    await act(async () => { resolves[0]!({ publicationId: id, publicationDigest: digest }); });
    expect(JSON.stringify(renderer.toJSON())).not.toContain('My dryer');
    expect(props.loadTools).not.toHaveBeenCalled();
  });

  it('hands only the saved assessment id back for a Today plan', async () => {
    const onUseAssessment = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(HeatCoachEntry, {
      ownerKey: 'owner-a',
      loadPublication: async () => ({ publicationId: id, publicationDigest: digest }),
      loadTools: async () => ({ items: [], nextCursor: null }),
      loadProducts: async () => ({ items: [], nextCursor: null }),
      onNavigate: vi.fn(), onUseAssessment,
    })); });
    await act(async () => {
      renderer.root.findByType(HeatCoach).props.onUsePlan({
        assessmentId: id, result: { state: 'appropriate', selected: { method: 'heated-air' } },
      });
    });
    expect(onUseAssessment).toHaveBeenCalledExactlyOnceWith(id);
  });
});
