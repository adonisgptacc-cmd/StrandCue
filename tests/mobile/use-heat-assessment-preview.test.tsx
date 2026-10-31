import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';

import { useHeatAssessmentPreview } from '../../apps/mobile/src/guidance/use-heat-assessment-preview';
import type { ProtocolDecision } from '../../packages/domain/src/index';

const mocks = vi.hoisted(() => ({ getAssessment: vi.fn(), getReviewedCopy: vi.fn() }));
vi.mock('../../apps/mobile/src/heat-coach-api', () => ({
  getHeatCoachAssessment: mocks.getAssessment,
  getHeatCoachReviewedCopy: mocks.getReviewedCopy,
}));
vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);

const digest = `sha256:${'a'.repeat(64)}`;
function decision(assessmentId: string): ProtocolDecision {
  return { status: 'ready', requestId: 'run', confidence: 'high', noPurchaseNeeded: false,
    heatAssessmentBinding: { assessmentId, sourceFingerprint: digest, publicationId: 'publication', publicationDigest: digest },
    steps: [{ stepId: 'heat', position: 1, action: 'heat', productId: null, productVersionId: null,
      toolId: 'tool', toolVersionId: 'tool-version', waitSeconds: null, rinse: null, reasons: [],
      heatActionRef: { publicationId: 'publication', publicationDigest: digest },
      heatPrescription: { method: 'heated-air', temperature: { value: 150, unit: 'C' }, setting: 'Medium',
        passes: 2, durationMinutes: 15, zones: [{ region: 'crown', segment: 'ends' }] } }],
    omissions: [], alternatives: [], missingInputs: [], audit: { requestId: 'run', engineVersion: '1',
      evaluatedRules: [], conflicts: [], rankedCandidates: [], rejectedCandidates: [], restrictions: [], missingInputs: [] } } as unknown as ProtocolDecision;
}

const copy = (assessmentId: string) => ({ assessmentId, publicationId: 'publication', publicationDigest: digest,
  copy: [{ copyKey: 'heat.limitations', text: `reviewed limits for ${assessmentId}` }] });
const receipt = (assessmentId: string) => ({ assessmentId, publicationId: 'publication', publicationDigest: digest,
  sourceFingerprint: digest, stale: false, status: 'appropriate', result: { state: 'appropriate' } }) as never;
function Probe({ ownerId, value }: { ownerId: string; value: ProtocolDecision }) {
  const resolved = useHeatAssessmentPreview(ownerId, value);
  return <Text>{resolved.heatReviewedCopy?.copy[0]?.text ?? 'review pending'}</Text>;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { mocks.getAssessment.mockReset(); mocks.getReviewedCopy.mockReset(); });
afterAll(() => vi.restoreAllMocks());

describe('owner-scoped assessed heat preview loading', () => {
  it('loads reviewed copy for a ready or restored heat decision through the bound assessment identity', async () => {
    mocks.getAssessment.mockResolvedValue(receipt('assessment-a'));
    mocks.getReviewedCopy.mockResolvedValue(copy('assessment-a'));
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Probe, { ownerId: 'owner-a', value: decision('assessment-a') })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(JSON.stringify(renderer.toJSON())).toContain('reviewed limits for assessment-a');
    expect(mocks.getAssessment).toHaveBeenCalledExactlyOnceWith('assessment-a');
    expect(mocks.getReviewedCopy).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ assessmentId: 'assessment-a' }));
    await act(async () => { renderer.unmount(); });
  });

  it('never paints or accepts a late previous-owner review after switching owners', async () => {
    const oldRead = deferred<never>();
    const newRead = deferred<never>();
    mocks.getAssessment.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise);
    mocks.getReviewedCopy.mockImplementation(async value => copy(value.assessmentId));
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Probe, { ownerId: 'owner-a', value: decision('assessment-a') })); });
    await act(async () => { renderer.update(createElement(Probe, { ownerId: 'owner-b', value: decision('assessment-b') })); });
    oldRead.resolve(receipt('assessment-a'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(JSON.stringify(renderer.toJSON())).not.toContain('assessment-a');
    newRead.resolve(receipt('assessment-b'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(JSON.stringify(renderer.toJSON())).toContain('reviewed limits for assessment-b');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('assessment-a');
    await act(async () => { renderer.unmount(); });
  });
});
