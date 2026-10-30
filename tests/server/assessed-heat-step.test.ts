import { describe, expect, it } from 'vitest';

import { evaluateHeatCoach } from '../../packages/domain/src/heat-coach.ts';
import type { ProtocolStep } from '../../packages/domain/src/recommendations/types.ts';
import { conformance } from '../fixtures/heat-coach-conformance.ts';
import { projectAssessedHeatSteps } from '../../supabase/functions/today-guidance/assessed-heat-step.ts';

const publicationDigest = `sha256:${'a'.repeat(64)}`;
const heatActionRef = { publicationId: conformance.publicationId, publicationDigest };
const productStep: ProtocolStep = {
  stepId: 'protectant', position: 1, action: 'apply',
  productId: conformance.productOwnerItemId, productVersionId: conformance.productVersionId,
  toolId: null, toolVersionId: null, waitSeconds: null, rinse: null, reasons: [],
};
const heatStep: ProtocolStep = {
  stepId: 'heat', position: 2, action: 'heat',
  productId: null, productVersionId: null, toolId: null, toolVersionId: null,
  waitSeconds: null, rinse: null, reasons: [], heatActionRef,
};

describe('server assessed heat-step projection', () => {
  const project = (input: unknown, publication: unknown, steps: readonly ProtocolStep[], status: 'appropriate' | 'lower_heat') =>
    projectAssessedHeatSteps({ steps, assessment: {
      status, publicationId: conformance.publicationId, publicationDigest, input,
      result: evaluateHeatCoach(input, publication),
    }, publication, publicationDigest });

  it('fills only the exact reviewed appropriate prescription and owned tool version', () => {
    const input = conformance.baselineInput;
    const publication = conformance.baselinePublication;
    const result = evaluateHeatCoach(input, publication);
    expect(result.state).toBe('appropriate');
    const steps = projectAssessedHeatSteps({
      steps: [productStep, heatStep],
      assessment: { status: 'appropriate', publicationId: conformance.publicationId,
        publicationDigest, input, result },
      publication, publicationDigest,
    });
    expect(steps).toEqual([productStep, {
      ...heatStep,
      toolId: conformance.toolOwnerItemId,
      toolVersionId: conformance.toolVersionId,
      heatPrescription: {
        method: 'heated-air', temperature: { value: 120, unit: 'C' },
        setting: 'Low', passes: 1, durationMinutes: 15,
        zones: [{ region: 'whole_head', segment: 'entire_strand' }],
      },
    }]);
  });

  it('rejects an assessment result above its reviewed temperature limit', () => {
    const input = { ...conformance.baselineInput, preparedInput: {
      ...conformance.baselineInput.preparedInput,
      tools: [{ ...conformance.baselineInput.preparedInput.tools[0]!, ownerFacts: {
        ...conformance.baselineInput.preparedInput.tools[0]!.ownerFacts,
        settings: { state: 'recorded', recordedTemperatures: [{ label: 'Low', value: 200, unit: 'C' }] },
      } }],
    } };
    const publication = conformance.baselinePublication;
    const result = { ...evaluateHeatCoach(input, publication), selected: {
      ...evaluateHeatCoach(input, publication).selected,
      temperature: { value: 200, unit: 'C' },
    } };
    const steps = projectAssessedHeatSteps({
      steps: [productStep, heatStep],
      assessment: { status: 'appropriate', publicationId: conformance.publicationId,
        publicationDigest, input, result },
      publication, publicationDigest,
    });
    expect(steps).toBeNull();
  });

  it('requires the exact publication reference and an earlier assessed protectant', () => {
    const input = conformance.baselineInput;
    const publication = conformance.baselinePublication;
    expect(project(input, publication, [productStep, { ...heatStep,
      heatActionRef: { ...heatActionRef, publicationDigest: `sha256:${'b'.repeat(64)}` },
    }], 'appropriate')).toBeNull();
    expect(project(input, publication, [heatStep], 'appropriate')).toBeNull();
    expect(project(input, publication, [{ ...productStep, position: 3 }, heatStep], 'appropriate')).toBeNull();
  });

  it('keeps an adjusted lower-heat value pending when the owned tool cannot express it', () => {
    const input = { ...conformance.baselineInput, request: {
      ...conformance.baselineInput.request,
      temperature: { state: 'known', value: { value: 180, unit: 'C' } },
    } };
    expect(evaluateHeatCoach(input, conformance.baselinePublication).state).toBe('lower_heat');
    expect(project(input, conformance.baselinePublication, [productStep, heatStep], 'lower_heat')).toBeNull();
  });

  it('keeps even an expressible lower-heat value pending until explicit choice binding exists', () => {
    const input = { ...conformance.baselineInput,
      preparedInput: { ...conformance.baselineInput.preparedInput,
        tools: [{ ...conformance.baselineInput.preparedInput.tools[0]!, ownerFacts: {
          ...conformance.baselineInput.preparedInput.tools[0]!.ownerFacts,
          settings: { state: 'recorded', recordedTemperatures: [{ label: 'Low', value: 150, unit: 'C' }] },
        } }],
      },
      request: { ...conformance.baselineInput.request,
        temperature: { state: 'known', value: { value: 180, unit: 'C' } },
      },
    };
    const steps = project(input, conformance.baselinePublication, [productStep, heatStep], 'lower_heat');
    expect(evaluateHeatCoach(input, conformance.baselinePublication).selected.temperature)
      .toEqual({ value: 150, unit: 'C' });
    expect(steps).toBeNull();
  });

  it('rejects conflicting duplicate owner item identities in the assessment snapshot', () => {
    const input = { ...conformance.baselineInput, preparedInput: {
      ...conformance.baselineInput.preparedInput,
      tools: [conformance.baselineInput.preparedInput.tools[0]!,
        { ...conformance.baselineInput.preparedInput.tools[0]!, versionId: '99999999-9999-4999-8999-999999999999' }],
    } };
    expect(project(input, conformance.baselinePublication, [productStep, heatStep], 'appropriate')).toBeNull();
  });
});
