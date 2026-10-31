import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { HeatCoach } from '../../apps/mobile/src/HeatCoach';
import { HeatCoachError } from '../../apps/mobile/src/heat-coach-errors';
import { createHeatCoachController } from '../../apps/mobile/src/heat-coach-state';
import type { HeatCoachReceipt, HeatCoachReviewedCopy } from '../../apps/mobile/src/heat-coach-api';

vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);
vi.mock('../../apps/mobile/src/client', () => ({ supabase: null }));
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
const receipt = {
  assessmentId: id, publicationId: id, publicationDigest: digest, stale: false,
  input: { preparedInput: { availableMinutes: 20, currentCondition: { observedAt: '2026-10-29T08:00:00.000Z', concerns: ['heat-concern'], explicitNone: false, zones: [], zoneConcerns: [] } } },
  status: 'no_heat', result: { state: 'no_heat', necessity: 'optional',
    selected: { method: 'unheated', temperature: null, setting: null, passes: null, durationMinutes: null, zones: [] },
    reasons: [{ reasonCode: 'private_reason', copyKey: 'heat.reason' }], missing: [], alternatives: [] },
} as unknown as HeatCoachReceipt;
const reviewed: HeatCoachReviewedCopy = { assessmentId: id, publicationId: id, publicationDigest: digest,
  copy: [{ copyKey: 'heat.limitations', text: 'Synthetic limitations.' },
    { copyKey: 'heat.reason', text: 'Synthetic explanation.' }] };

describe('Heat Coach journey', () => {
  it('marks and explicitly announces an assessment failure to assistive technology', async () => {
    const controller = createHeatCoachController({ ownerKey: 'owner-a',
      publication: { publicationId: id, publicationDigest: digest },
      api: { createHeatCoachAssessment: async () => { throw new HeatCoachError('offline'); } }, newOperationId: () => id });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(HeatCoach, {
      ownerKey: 'owner-a', controller, ownedTools: [], onUsePlan: vi.fn(),
    })); });
    await act(async () => { await controller.save(); });
    const failure = renderer.root.findAll(node => typeof node.type === 'string'
      && node.props.accessibilityRole === 'alert'
      && node.children.includes('You appear to be offline. Your unsent choices are still here.'));
    expect(failure).toHaveLength(1);
    const { AccessibilityInfo } = await import('react-native');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'You appear to be offline. Your unsent choices are still here.',
    );
    await act(async () => { renderer.unmount(); });
  });

  it('opens without generating an assessment or using a plan', async () => {
    const createAssessment = vi.fn(async () => receipt);
    const getAssessment = vi.fn(async () => receipt);
    const getReviewedCopy = vi.fn(async () => reviewed);
    const onUsePlan = vi.fn();
    const controller = createHeatCoachController({ ownerKey: 'owner-a',
      publication: { publicationId: id, publicationDigest: digest },
      api: { createHeatCoachAssessment: createAssessment }, newOperationId: () => id });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(HeatCoach, {
      ownerKey: 'owner-a', controller, ownedTools: [], getAssessment, getReviewedCopy, onUsePlan,
    })); });
    expect(JSON.stringify(renderer.toJSON())).toContain('Heat Coach');
    expect(createAssessment).not.toHaveBeenCalled();
    expect(getAssessment).not.toHaveBeenCalled();
    expect(getReviewedCopy).not.toHaveBeenCalled();
    expect(onUsePlan).not.toHaveBeenCalled();
  });

  it('deduplicates repeated start taps while the freshness check is in flight', async () => {
    let resolveFresh!: (value: HeatCoachReceipt) => void;
    const getAssessment = vi.fn(() => new Promise<HeatCoachReceipt>(resolve => { resolveFresh = resolve; }));
    const controller = createHeatCoachController({ ownerKey: 'owner-a',
      publication: { publicationId: id, publicationDigest: digest },
      api: { createHeatCoachAssessment: async () => receipt }, newOperationId: () => id });
    const onUsePlan = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(HeatCoach, {
      ownerKey: 'owner-a', controller, ownedTools: [], getReviewedCopy: async () => reviewed,
      getAssessment, onUsePlan,
    })); });
    await act(async () => { await controller.save(); });
    const action = renderer.root.find(node => typeof node.type === 'string'
      && node.props.accessibilityLabel === 'Use this plan');
    await act(async () => { action.props.onPress(); action.props.onPress(); });
    expect(getAssessment).toHaveBeenCalledOnce();
    await act(async () => { resolveFresh(receipt); });
    expect(onUsePlan).toHaveBeenCalledOnce();
  });
  it('rechecks the server receipt before starting a plan and rejects a newly stale result', async () => {
    const controller = createHeatCoachController({ ownerKey: 'owner-a',
      publication: { publicationId: id, publicationDigest: digest },
      api: { createHeatCoachAssessment: async () => receipt }, newOperationId: () => id });
    const onUsePlan = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(HeatCoach, {
      ownerKey: 'owner-a', controller, ownedTools: [], getReviewedCopy: async () => reviewed,
      getAssessment: async () => ({ ...receipt, stale: true }), onUsePlan,
    })); });
    await act(async () => { await controller.save(); });
    const action = renderer.root.find(node => typeof node.type === 'string'
      && node.props.accessibilityLabel === 'Use this plan');
    await act(async () => { await action.props.onPress(); });
    expect(onUsePlan).not.toHaveBeenCalled();
  });
  it('does not show a prior controller receipt when the controller prop changes', async () => {
    const first = createHeatCoachController({ ownerKey: 'owner-a',
      publication: { publicationId: id, publicationDigest: digest },
      api: { createHeatCoachAssessment: async () => receipt }, newOperationId: () => id });
    const next = createHeatCoachController({ ownerKey: 'owner-a',
      publication: { publicationId: id, publicationDigest: digest },
      api: { createHeatCoachAssessment: async () => receipt }, newOperationId: () => id });
    const getReviewedCopy = vi.fn(async () => reviewed);
    const props = { ownerKey: 'owner-a', controller: first, ownedTools: [], getReviewedCopy,
      onUsePlan: vi.fn() };
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(HeatCoach, props)); });
    await act(async () => { await first.save(); });
    expect(JSON.stringify(renderer.toJSON())).toContain('Synthetic explanation.');
    await act(async () => { renderer.update(createElement(HeatCoach, { ...props, controller: next })); });
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Synthetic explanation.');
  });
  it('resolves exact copy after saving and clears prior owner content on switch', async () => {
    let resolveCopy!: (value: HeatCoachReviewedCopy) => void;
    const getCopy = vi.fn(() => new Promise<HeatCoachReviewedCopy>(resolve => { resolveCopy = resolve; }));
    const controller = createHeatCoachController({ ownerKey: 'owner-a',
      publication: { publicationId: id, publicationDigest: digest },
      api: { createHeatCoachAssessment: vi.fn().mockResolvedValue(receipt) }, newOperationId: () => id });
    const props = { ownerKey: 'owner-a', controller, ownedTools: [], getReviewedCopy: getCopy,
      onUsePlan: vi.fn() };
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(HeatCoach, props)); });
    await act(async () => { await controller.save(); });
    expect(getCopy).toHaveBeenCalledWith(receipt);
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Synthetic explanation.');
    await act(async () => { renderer.update(createElement(HeatCoach, { ...props, ownerKey: 'owner-b' })); });
    await act(async () => { resolveCopy(reviewed); });
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Synthetic explanation.');
    expect(controller.getState().ownerKey).toBe('owner-b');
  });
});
