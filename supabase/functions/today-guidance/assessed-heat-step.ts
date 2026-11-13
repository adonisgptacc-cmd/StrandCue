import type { ProtocolStep } from '../../../packages/domain/src/recommendations/types.ts';
import { evaluateHeatCoach, HeatCoachDecisionSchema, HeatCoachInputSchema,
  HeatRulePublicationSchema } from '../../../packages/domain/src/heat-coach.ts';
import { z } from 'zod';

export interface AssessedHeatProjectionInput {
  readonly steps: readonly ProtocolStep[];
  readonly assessment: unknown;
  readonly publication: unknown;
  readonly publicationDigest: string;
}

const AssessmentSchema = z.object({
  status: z.literal('appropriate'),
  publicationId: z.string().uuid(),
  publicationDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  input: HeatCoachInputSchema,
  result: HeatCoachDecisionSchema,
}).passthrough();

function hasUniqueOwnerItems(items: readonly { ownerItemId: string }[]): boolean {
  return new Set(items.map(item => item.ownerItemId)).size === items.length;
}

export function projectAssessedHeatSteps(input: AssessedHeatProjectionInput): ProtocolStep[] | null {
  const assessment = AssessmentSchema.safeParse(input.assessment);
  const publication = HeatRulePublicationSchema.safeParse(input.publication);
  if (!assessment.success || !publication.success) return null;
  const saved = assessment.data;
  const rule = publication.data;
  if (!hasUniqueOwnerItems(saved.input.preparedInput.tools)
    || !hasUniqueOwnerItems(saved.input.preparedInput.products)) return null;
  if (rule.lifecycle !== 'reviewed' || rule.publicationId !== saved.publicationId
    || saved.publicationDigest !== input.publicationDigest
    || saved.result.state !== saved.status) return null;
  const reevaluated = evaluateHeatCoach(saved.input, rule);
  if (reevaluated.state !== saved.status
    || JSON.stringify(reevaluated.selected) !== JSON.stringify(saved.result.selected)) return null;

  const heatSteps = input.steps.filter(step => step.action === 'heat');
  if (heatSteps.length !== 1 || input.steps.some(step =>
    step.action !== 'heat' && step.heatActionRef !== undefined)) return null;
  const heatStep = heatSteps[0]!;
  if (heatStep.heatActionRef?.publicationId !== saved.publicationId
    || heatStep.heatActionRef.publicationDigest !== saved.publicationDigest
    || heatStep.toolId !== null || heatStep.toolVersionId !== null
    || heatStep.productId !== null || heatStep.productVersionId !== null) return null;

  const selected = saved.result.selected;
  if (selected.method === null || selected.method === 'unheated'
    || selected.temperature === null || selected.passes === null
    || selected.durationMinutes === null) return null;
  const tool = saved.input.preparedInput.tools.find(item =>
    item.ownerItemId === saved.input.request.toolOwnerItemId);
  if (tool === undefined || tool.identity !== 'exact' || tool.versionId === null
    || tool.review !== 'reviewed' || !tool.satisfiesExactCapability
    || !tool.verifiedCapabilities.includes('heat-tool')
    || tool.ownerFacts.heatMethods.state !== 'recorded'
    || !tool.ownerFacts.heatMethods.methods.includes(selected.method)
    || tool.ownerFacts.settings.state !== 'recorded'
    || !tool.ownerFacts.settings.recordedTemperatures.some(item =>
      item.value === selected.temperature!.value && item.unit === selected.temperature!.unit
      && (selected.setting === null || item.label === selected.setting))) return null;

  if (rule.requiredProductCapability !== null) {
    const product = saved.input.preparedInput.products.find(item =>
      item.ownerItemId === saved.input.request.productOwnerItemId);
    if (product === undefined || product.identity !== 'exact' || product.versionId === null
      || product.review !== 'reviewed' || !product.satisfiesExactCapability
      || !product.verifiedCapabilities.includes(rule.requiredProductCapability)
      || !input.steps.some(step => step.position < heatStep.position && step.action === 'apply'
        && step.productId === product.ownerItemId && step.productVersionId === product.versionId
        && step.toolId === null && step.toolVersionId === null)) return null;
  }
  return input.steps.map(step => step === heatStep
    ? { ...step, toolId: tool.ownerItemId, toolVersionId: tool.versionId,
      heatPrescription: selected }
    : { ...step });
}
