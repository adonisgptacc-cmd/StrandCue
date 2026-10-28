import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { HeatCoachDecision } from '../../apps/mobile/src/HeatCoachDecision';
import type { HeatCoachReceipt, HeatCoachReviewedCopy } from '../../apps/mobile/src/heat-coach-api';

vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);
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
const base = {
  assessmentId: id, publicationId: id, publicationDigest: digest, stale: false,
  status: 'appropriate', result: { state: 'appropriate', necessity: 'optional',
    selected: { method: 'heated-air', temperature: null, setting: null, passes: null, durationMinutes: null, zones: [] },
    reasons: [{ reasonCode: 'internal_limit', copyKey: 'heat.reviewed_limit' }],
    missing: [], alternatives: [] },
} as unknown as HeatCoachReceipt;
const copy: HeatCoachReviewedCopy = { assessmentId: id, publicationId: id, publicationDigest: digest,
  copy: [{ copyKey: 'heat.limitations', text: 'Synthetic reviewed limitations.' },
    { copyKey: 'heat.reviewed_limit', text: 'Synthetic reviewed guidance.' }] };

async function render(receipt: HeatCoachReceipt, resolved: HeatCoachReviewedCopy | null = copy) {
  const onUsePlan = vi.fn();
  const onOpenDestination = vi.fn();
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(HeatCoachDecision,
    { receipt, reviewedCopy: resolved, onUsePlan, onOpenDestination })); });
  const text = JSON.stringify(renderer.toJSON());
  const button = (label: string) => renderer.root.findAll(node => typeof node.type === 'string'
    && node.props.accessibilityLabel === label && node.props.accessibilityRole === 'button');
  return { renderer, text, button, onUsePlan, onOpenDestination };
}

describe('Heat Coach decision', () => {
  it.each(['content_pending', 'needs_input', 'restricted', 'unavailable'] as const)(
    'closes the start action for %s', async state => {
      const receipt = { ...base, status: state, result: { ...base.result, state } } as HeatCoachReceipt;
      const view = await render(receipt);
      expect(view.button('Use this heat plan')).toHaveLength(0);
      expect(view.text).not.toContain('internal_limit');
      expect(view.text).not.toContain(id);
    },
  );

  it.each(['appropriate', 'lower_heat', 'no_heat'] as const)(
    'renders reviewed explanation and allows the %s plan', async state => {
      const receipt = { ...base, status: state, result: { ...base.result, state } } as HeatCoachReceipt;
      const view = await render(receipt);
      expect(view.text).toContain('Synthetic reviewed guidance.');
      expect(view.text).toContain('Synthetic reviewed limitations.');
      expect(view.text).toContain('Heated air');
      expect(view.button('Use this heat plan')).toHaveLength(1);
      await act(async () => view.button('Use this heat plan')[0]!.props.onPress());
      expect(view.onUsePlan).toHaveBeenCalledOnce();
    },
  );

  it('fails closed for stale, missing or mismatched reviewed copy', async () => {
    for (const [receipt, resolved] of [
      [{ ...base, stale: true }, copy], [base, null],
      [base, { ...copy, publicationDigest: `sha256:${'b'.repeat(64)}` }],
      [base, { ...copy, copy: [] }],
    ] as const) {
      const view = await render(receipt as HeatCoachReceipt, resolved as HeatCoachReviewedCopy | null);
      expect(view.button('Use this heat plan')).toHaveLength(0);
      expect(view.text).not.toContain('Synthetic reviewed guidance.');
    }
  });

  it('shows missing fact destination with reviewed wording only', async () => {
    const receipt = { ...base, status: 'needs_input', result: { ...base.result, state: 'needs_input',
      missing: [{ fact: 'tool', destination: 'my_tools', reasonCode: 'private_tool', copyKey: 'heat.tool_missing' }] } } as HeatCoachReceipt;
    const reviewed = { ...copy, copy: [...copy.copy, { copyKey: 'heat.tool_missing', text: 'Record your owned tool.' }] };
    const view = await render(receipt, reviewed);
    expect(view.text).toContain('Record your owned tool.');
    expect(view.text).not.toContain('private_tool');
    await act(async () => view.button('Open My Tools')[0]!.props.onPress());
    expect(view.onOpenDestination).toHaveBeenCalledWith('my_tools');
  });
});
