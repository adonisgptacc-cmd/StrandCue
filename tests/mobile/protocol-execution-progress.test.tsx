import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ExecutionProgress } from '../../apps/mobile/src/ProtocolExecutionProgress';

function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join(' ');
  if (typeof value === 'object' && value !== null && 'children' in value) {
    return textContent((value as { children?: unknown }).children);
  }
  return '';
}

vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);
const original = console.error.bind(console);
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (!String(message).includes('react-test-renderer is deprecated')) original(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());

describe('restored assessed heat execution progress', () => {
  it('shows the stored prescription and says confirmation does not create an actual heat event', async () => {
    const step = {
      stepId: 'heat-step', position: 1,
      planned: { stepId: 'heat-step', position: 1, action: 'heat', productId: null, productVersionId: null,
        toolId: 'tool-1', toolVersionId: 'tool-version-1', waitSeconds: null, rinse: null, reasons: [],
        heatActionRef: { publicationId: 'publication-1', publicationDigest: `sha256:${'a'.repeat(64)}` },
        heatPrescription: { method: 'heated-air', temperature: { value: 150, unit: 'C' }, setting: 'Medium',
          passes: 2, durationMinutes: 15, zones: [{ region: 'crown', segment: 'ends' }] } },
      state: 'pending', confirmedAt: null, deviation: null,
    };
    const execution = { status: 'paused', steps: [step], closeReason: null };
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(ExecutionProgress, {
      execution: execution as never, busy: false, terminal: false, actionsHidden: false,
      stepsHeadingRef: { current: null }, onArmStep: vi.fn(),
    })); });
    const rendered = textContent(renderer.toJSON()).toLowerCase();
    expect(rendered).toMatch(/150\s*°\s*c/);
    expect(rendered).toContain('heated air');
    expect(rendered).toContain('medium');
    expect(rendered).toContain('does not record an actual heat event');
    expect(rendered).not.toContain('heat event recorded');
    await act(async () => { renderer.unmount(); });
  });
});
