import { deepFreeze } from '../../../../packages/domain/src/guidance/schemas.ts';
import type {
  GuidanceEvidenceRegistry,
  ProtocolDecision,
  RecommendationContext,
  ReviewedCapabilityEntry,
  ReviewedGuidanceBundle,
} from '../../../../packages/domain/src/index.ts';
import type { HeatCoachReceipt, HeatCoachReviewedCopy } from '../heat-coach-api.ts';

/**
 * Trusted protocol preview model (Task 3.3).
 *
 * `buildProtocolPreview` rebuilds a deterministic, fail-closed, owner-facing
 * description of a stored `ProtocolDecision` from the decision itself, the
 * exact `RecommendationContext` that produced it, and the exact checked-in
 * reviewed bundle and evidence registry. It never renders engine prose, rule
 * references, fact paths, UUIDs, evidence IDs, reviewer names, URLs, internal
 * capability names or database codes.
 *
 * The stored `ProtocolDecision` is left untouched: this model is a separate
 * read-only view used only for display and for the Start gate. Execution keeps
 * the original decision.
 */

/** The preview can be shown and started, or it explains why it cannot. */
export type PreviewStatus = 'ready' | 'content_pending' | 'unavailable';

/** One owned product or tool the proposed routine will actually use. */
export interface ProtocolPreviewItem {
  readonly kind: 'product' | 'tool';
  /** Plain owner-facing name; record ids and version ids are never shown. */
  readonly name: string;
  readonly available: boolean;
  readonly owned: boolean;
}

/** One ordered step of the proposed routine. */
export interface ProtocolPreviewStep {
  readonly position: number;
  readonly action: 'apply' | 'wait' | 'rinse' | 'leave_in' | 'heat';
  /** The product or tool the step uses, when it uses one. */
  readonly item?: ProtocolPreviewItem;
  readonly waitSeconds: number | null;
  /** `true` means rinse, `false` means leave-in, `null` means not applicable. */
  readonly rinse: boolean | null;
  /** Plain-language reason derived only from structured reviewed facts. */
  readonly reason: string;
}

/** What the proposed routine will do, in the owner's words. */
export interface ProtocolPreviewRoute {
  readonly summary: string;
  readonly goal: string;
}

/** One plain-language reason attached to a step position. */
export interface ProtocolPreviewReason {
  readonly step: number;
  readonly text: string;
}

/** Confidence and the plain-language limitation behind it. */
export interface ProtocolPreviewConfidence {
  readonly level: 'high' | 'moderate' | 'limited';
  readonly limitedBecause: readonly string[];
}

/** One cited evidence reference and whether reviewed evidence covers it. */
export interface ProtocolPreviewEvidence {
  readonly kind: 'product' | 'tool' | 'rule';
  readonly covered: boolean;
  readonly note: string;
}

/** One honest limitation of the preview or of the plan it describes. */
export interface ProtocolPreviewLimitation {
  readonly text: string;
}

/** One eligible alternative the owner could use instead. */
export interface ProtocolPreviewAlternative {
  readonly name: string;
  readonly kind: 'product' | 'tool';
  readonly available: boolean;
  readonly owned: boolean;
  /** Whether this is an owned, available feasible option the plan already covers. */
  readonly coversPlan: boolean;
}

/** Exact server-assessed heat selection plus its bound reviewed limitations copy. */
export interface ProtocolPreviewHeatPrescription {
  readonly method: string;
  readonly temperature: string;
  readonly setting: string | null;
  readonly passes: number;
  readonly durationMinutes: number;
  readonly zones: readonly string[];
  readonly reviewedLimitations: string;
  readonly adjustedLower: boolean;
}

/** The immutable preview model. Only a `ready` model offers a Start action. */
export interface ProtocolPreviewModel {
  readonly status: PreviewStatus;
  readonly route?: ProtocolPreviewRoute;
  readonly ownedItems: readonly ProtocolPreviewItem[];
  readonly steps: readonly ProtocolPreviewStep[];
  readonly reasons: readonly ProtocolPreviewReason[];
  readonly confidence: ProtocolPreviewConfidence;
  readonly evidence: readonly ProtocolPreviewEvidence[];
  readonly limitations: readonly ProtocolPreviewLimitation[];
  readonly alternatives: readonly ProtocolPreviewAlternative[];
  readonly heatPrescription?: ProtocolPreviewHeatPrescription;
  readonly noPurchaseNeeded: boolean | null;
  readonly explanation?: string;
}

/** Everything `buildProtocolPreview` needs, all of it already checked in. */
export interface ProtocolPreviewInput {
  readonly decision: ProtocolDecision;
  readonly context: RecommendationContext;
  readonly bundle: ReviewedGuidanceBundle;
  readonly evidenceRegistry: GuidanceEvidenceRegistry;
  readonly heatAssessment?: HeatCoachReceipt | null;
  readonly heatReviewedCopy?: HeatCoachReviewedCopy | null;
}

/** Plain goal labels; the goal id itself is never shown. */
const GOAL_LABELS: Readonly<Record<string, string>> = {
  basic_wash: 'Basic wash',
};

const ID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const URL_LIKE = /https?:\/\/\S+/i;

/** Strips record ids and urls from an owner-entered name so none ever reach the screen. */
function safeDisplayName(name: string): string {
  const cleaned = String(name ?? '')
    .replace(ID_LIKE, '')
    .replace(URL_LIKE, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : 'an item you own';
}

function goalLabel(goal: string): string {
  return Object.hasOwn(GOAL_LABELS, goal) ? GOAL_LABELS[goal] : 'your plan';
}

function emptyModel(): Omit<ProtocolPreviewModel, 'status' | 'explanation'> {
  return Object.freeze({
    ownedItems: Object.freeze([]),
    steps: Object.freeze([]),
    reasons: Object.freeze([]),
    confidence: Object.freeze({ level: 'limited', limitedBecause: Object.freeze([]) }),
    evidence: Object.freeze([]),
    limitations: Object.freeze([]),
    alternatives: Object.freeze([]),
    noPurchaseNeeded: null,
  });
}

function contentPending(explanation: string): ProtocolPreviewModel {
  return Object.freeze({ ...emptyModel(), status: 'content_pending', explanation });
}

function unavailable(explanation: string): ProtocolPreviewModel {
  return Object.freeze({ ...emptyModel(), status: 'unavailable', explanation });
}

function explanationForStatus(status: ProtocolDecision['status']): string {
  switch (status) {
    case 'needs_input':
      return 'This plan needs a little more from you before it can start.';
    case 'rule_conflict':
      return 'Two reviewed rules disagree here, so no plan was produced.';
    case 'unsupported':
      return 'Nothing reviewed covers this situation yet, so there is nothing to start.';
    default:
      return 'Reviewed guidance for this situation is not available yet.';
  }
}

function confidenceFor(level: 'high' | 'moderate' | 'limited'): ProtocolPreviewConfidence {
  const limitedBecause: string[] = [];
  if (level === 'limited') {
    limitedBecause.push('Some information was missing or uncertain, so treat this as a best-fit plan and check each step before starting.');
  } else if (level === 'moderate') {
    limitedBecause.push('Not every checked fact was needed by every rule, so this plan is reliable but not certain.');
  }
  return Object.freeze({ level, limitedBecause: Object.freeze(limitedBecause) });
}

function reasonForStep(step: Pick<ProtocolPreviewStep, 'action' | 'waitSeconds' | 'rinse'>, item: ProtocolPreviewItem | undefined): string {
  switch (step.action) {
    case 'apply':
      return item !== undefined ? `Use ${safeDisplayName(item.name)}.` : 'Apply the selected product.';
    case 'wait':
      return `Wait ${step.waitSeconds ?? 0} seconds.`;
    case 'rinse':
      return 'Rinse it out.';
    case 'leave_in':
      return 'Leave it in.';
    case 'heat':
      return item !== undefined ? `Use ${safeDisplayName(item.name)} within the recorded heat limits.`
        : 'Follow the recorded heat limits.';
    default:
      return 'Follow this step.';
  }
}

/** Resolve one product step to an owned item, or `null` when the binding is ambiguous. */
function resolveProductBinding(
  productId: string,
  productVersionId: string,
  context: RecommendationContext,
  bundle: ReviewedGuidanceBundle,
): { readonly item: ProtocolPreviewItem } | null {
  const candidate = context.products.find(
    entry => entry.productId === productId && entry.versionId === productVersionId,
  );
  const entry = bundle.capabilities.find(
    (entry: ReviewedCapabilityEntry) => entry.kind === 'product' && entry.versionId === productVersionId && entry.status === 'published',
  );
  if (candidate === undefined || entry === undefined) return null;
  return { item: { kind: 'product', name: safeDisplayName(candidate.name), available: candidate.available, owned: candidate.owned } };
}

/** Resolve one tool step to an owned item, or `null` when the binding is ambiguous. */
function resolveToolBinding(
  toolId: string,
  toolVersionId: string,
  context: RecommendationContext,
  bundle: ReviewedGuidanceBundle,
): { readonly item: ProtocolPreviewItem } | null {
  const candidate = context.tools.find(
    entry => entry.toolId === toolId && entry.versionId === toolVersionId,
  );
  const entry = bundle.capabilities.find(
    (entry: ReviewedCapabilityEntry) => entry.kind === 'tool' && entry.versionId === toolVersionId && entry.status === 'published',
  );
  if (candidate === undefined || entry === undefined) return null;
  // Tool candidates do not carry an owned flag in the engine context, so a
  // tool is never asserted as owned here; only its availability is shown.
  return { item: { kind: 'tool', name: safeDisplayName(candidate.name), available: candidate.available, owned: false } };
}

type OwnedEntry = { readonly id: string; readonly name: string; readonly available: boolean; readonly owned: boolean; readonly versionId: string };

function isCoveredEvidence(
  evidenceId: string,
  registry: GuidanceEvidenceRegistry,
  now: number,
): { readonly covered: boolean; readonly note: string } {
  const record = registry.records.find(entry => entry.evidenceId === evidenceId);
  if (record === undefined) {
    return { covered: false, note: 'The source behind this rule is not recorded, so this step cannot be verified.' };
  }
  if (record.status !== 'reviewed') {
    return { covered: false, note: 'The evidence behind this rule is not published yet, so this step cannot be verified.' };
  }
  if (record.reviewedAt === null || Date.parse(record.reviewedAt) > now) {
    return { covered: false, note: 'The evidence behind this rule has not been reviewed yet, so this step cannot be verified.' };
  }
  if (record.market !== 'ZA') {
    return { covered: false, note: 'The evidence behind this rule was checked for a different market, so this step cannot be verified.' };
  }
  return { covered: true, note: 'Reviewed evidence supports this rule.' };
}

function evidenceFor(decision: ProtocolDecision, registry: GuidanceEvidenceRegistry, now: number): readonly ProtocolPreviewEvidence[] {
  const seen = new Set<string>();
  const evidence: ProtocolPreviewEvidence[] = [];
  for (const entry of decision.audit.evaluatedRules) {
    for (const evidenceId of entry.evidenceIds) {
      if (seen.has(evidenceId)) continue;
      seen.add(evidenceId);
      const checked = isCoveredEvidence(evidenceId, registry, now);
      evidence.push({ kind: 'rule', covered: checked.covered, note: checked.note });
    }
  }
  return Object.freeze(evidence);
}

function limitationsFor(level: 'high' | 'moderate' | 'limited', ownedItems: readonly ProtocolPreviewItem[], otherOwned: readonly OwnedEntry[]): readonly ProtocolPreviewLimitation[] {
  const limitations: ProtocolPreviewLimitation[] = [];
  limitations.push({ text: 'This plan covers cosmetic hair care only; it is not a diagnosis or a treatment.' });
  limitations.push({ text: 'Product and tool claims apply to the exact reviewed version only.' });
  const someUnavailable = ownedItems.some(item => !item.available);
  if (someUnavailable) {
    limitations.push({ text: 'One of the items the plan uses is not currently available, so the plan may need a change before starting.' });
  }
  for (const entry of otherOwned) {
    if (!entry.available) {
      limitations.push({ text: `You own ${safeDisplayName(entry.name)} but it is not currently available, so the plan does not rely on it.` });
    }
  }
  return Object.freeze(limitations);
}

function routeFor(context: RecommendationContext, steps: readonly ProtocolPreviewStep[]): ProtocolPreviewRoute {
  const actions = steps.map(step => step.action);
  const hasHeat = actions.includes('heat');
  const hasApply = actions.includes('apply');
  const hasWait = actions.includes('wait');
  const summary = hasHeat
    ? `${goalLabel(context.goal)}: follow the assessed heat method and recorded limits.`
    : hasApply
    ? hasWait
      ? `${goalLabel(context.goal)}: treat, then wait as directed.`
      : `${goalLabel(context.goal)}: treat with the products and tools you own.`
    : hasWait
      ? `${goalLabel(context.goal)}: wait as directed, then treat.`
      : `${goalLabel(context.goal)}: follow the steps above.`;
  return Object.freeze({ summary, goal: goalLabel(context.goal) });
}

const HEAT_METHOD_LABELS: Readonly<Record<string, string>> = {
  'direct-contact': 'Direct contact',
  'heated-air': 'Heated air',
  hooded: 'Hooded',
  steam: 'Steam',
};

function exactHeatDisplay(
  decision: ProtocolDecision,
  input: ProtocolPreviewInput,
): ProtocolPreviewHeatPrescription | null {
  const heatSteps = decision.steps.filter(step => step.action === 'heat');
  if (heatSteps.length === 0) return null;
  if (heatSteps.length !== 1 || decision.heatAssessmentBinding === undefined) return null;
  const step = heatSteps[0]!;
  const binding = decision.heatAssessmentBinding;
  const assessment = input.heatAssessment;
  const reviewedCopy = input.heatReviewedCopy;
  if (assessment === null || assessment === undefined || reviewedCopy === null || reviewedCopy === undefined
    || assessment.stale || (assessment.status !== 'appropriate' && assessment.status !== 'lower_heat')
    || assessment.assessmentId !== binding.assessmentId
    || assessment.sourceFingerprint !== binding.sourceFingerprint
    || assessment.publicationId !== binding.publicationId
    || assessment.publicationDigest !== binding.publicationDigest
    || reviewedCopy.assessmentId !== binding.assessmentId
    || reviewedCopy.publicationId !== binding.publicationId
    || reviewedCopy.publicationDigest !== binding.publicationDigest
    || step.heatActionRef?.publicationId !== binding.publicationId
    || step.heatActionRef.publicationDigest !== binding.publicationDigest) return null;
  const prescribed = step.heatPrescription;
  const selected = assessment.result.selected;
  const requestedToolOwnerItemId = assessment.input.request.toolOwnerItemId;
  const assessedTool = requestedToolOwnerItemId === null || requestedToolOwnerItemId === undefined
    ? undefined
    : assessment.input.preparedInput.tools.find(tool => tool.ownerItemId === requestedToolOwnerItemId);
  if (prescribed === undefined || prescribed.temperature === null
    || selected.method === null || selected.method === 'unheated'
    || selected.temperature === null || selected.passes === null || selected.durationMinutes === null
    || selected.zones.length === 0
    || prescribed.method !== selected.method
    || prescribed.temperature.value !== selected.temperature.value
    || prescribed.temperature.unit !== selected.temperature.unit
    || prescribed.setting !== selected.setting
    || prescribed.passes !== selected.passes
    || prescribed.durationMinutes !== selected.durationMinutes
    || JSON.stringify(prescribed.zones) !== JSON.stringify(selected.zones)
    || step.toolId === null || step.toolVersionId === null
    || assessedTool === undefined || assessedTool.versionId !== step.toolVersionId
    || assessedTool.review !== 'reviewed' || assessedTool.identity !== 'exact'
    || !assessedTool.satisfiesExactCapability
    || step.productId !== null || step.productVersionId !== null) return null;
  const copy = new Map(reviewedCopy.copy.map(row => [row.copyKey, row.text]));
  if (!copy.has('heat.limitations') || !assessment.result.reasons.every(row => copy.has(row.copyKey))) return null;
  const method = HEAT_METHOD_LABELS[selected.method];
  if (method === undefined) return null;
  return Object.freeze({
    method,
    temperature: `${selected.temperature.value}°${selected.temperature.unit}`,
    setting: selected.setting,
    passes: selected.passes,
    durationMinutes: selected.durationMinutes,
    zones: Object.freeze(selected.zones.map(zone => `${zone.region.replaceAll('_', ' ')} · ${zone.segment.replaceAll('_', ' ')}`)),
    reviewedLimitations: copy.get('heat.limitations')!,
    adjustedLower: assessment.status === 'lower_heat',
  });
}

function hasPublishedCapability(
  kind: 'product' | 'tool',
  versionId: string,
  bundle: ReviewedGuidanceBundle,
): boolean {
  return bundle.capabilities.some(
    (entry: ReviewedCapabilityEntry) => entry.kind === kind && entry.versionId === versionId && entry.status === 'published',
  );
}

function alternativesFor(
  context: RecommendationContext,
  selectedKeys: ReadonlySet<string>,
  bundle: ReviewedGuidanceBundle,
): readonly ProtocolPreviewAlternative[] {
  const alternatives: ProtocolPreviewAlternative[] = [];
  const add = (entry: OwnedEntry, kind: 'product' | 'tool') => {
    const key = `${kind}\u0000${entry.id}\u0000${entry.versionId}`;
    if (selectedKeys.has(key)) return;
    if (!hasPublishedCapability(kind, entry.versionId, bundle)) return;
    alternatives.push({
      name: safeDisplayName(entry.name),
      kind,
      available: entry.available,
      owned: entry.owned,
      coversPlan: entry.owned && entry.available,
    });
  };
  for (const product of context.products) add({ id: product.productId, name: product.name, available: product.available, owned: product.owned, versionId: product.versionId }, 'product');
  for (const tool of context.tools) add({ id: tool.toolId, name: tool.name, available: tool.available, owned: false, versionId: tool.versionId }, 'tool');
  return Object.freeze(alternatives);
}

/**
 * Build the owner-facing preview model for one stored decision.
 *
 * Fail-closed: a draft or withdrawn bundle, a registry/bundle identity
 * mismatch, a step whose product or tool version no longer resolves to a
 * published reviewed entry, or evidence that is not reviewed and current all
 * remove the Start action. Draft, withdrawn or unsupported content returns
 * `content_pending` and cannot produce a preview or a Start.
 */
export function buildProtocolPreview(input: ProtocolPreviewInput): ProtocolPreviewModel {
  const { decision, context, bundle, evidenceRegistry } = input;
  const now = Date.parse(context.asOf);

  // Only a produced plan can be previewed; every other status is content that
  // is not available to start from.
  if (decision.status !== 'ready') {
    return contentPending(explanationForStatus(decision.status));
  }
  const heatPrescription = exactHeatDisplay(decision, input);
  const heatSteps = decision.steps.filter(step => step.action === 'heat');
  if (heatSteps.length > 0 && heatPrescription === null) {
    return contentPending('The assessed heat limits or their reviewed guidance are not available, so this plan cannot be started.');
  }
  // A generic tool action is not a Heat Coach prescription, even when the run
  // carries an eligible assessment identity.
  if (decision.heatAssessmentBinding && decision.steps.some(step =>
    step.action !== 'heat' && (step.toolId !== null || step.toolVersionId !== null))) {
    return contentPending('A Today plan for this heat choice is not available yet.');
  }

  // The bundle must be published under the reviewed-content contract version.
  if (bundle.status !== 'published' || bundle.version !== '2') {
    return contentPending('Reviewed guidance for this situation is not available yet.');
  }
  if (!bundle.reviewedBy || String(bundle.reviewedBy).trim() === '') {
    return contentPending('Reviewed guidance for this situation is not available yet.');
  }
  if (bundle.reviewedAt === null || Date.parse(bundle.reviewedAt) > now) {
    return contentPending('Reviewed guidance for this situation is not available yet.');
  }

  // The evidence registry the bundle was built from must be the one handed in.
  if (bundle.evidenceRegistryId !== evidenceRegistry.registryId || bundle.evidenceRegistryVersion !== evidenceRegistry.version) {
    return unavailable('This plan cannot be verified against its reviewed content.');
  }

  // Every cited evidence reference must resolve to reviewed, current evidence.
  const evidence = evidenceFor(decision, evidenceRegistry, now);
  if (evidence.some(entry => !entry.covered)) {
    return contentPending('The reviewed evidence behind this plan is not available, so it cannot be started.');
  }

  // Every step must bind to an exact published product or tool version. An
  // ambiguous or missing binding fails closed rather than naming a different item.
  const steps: ProtocolPreviewStep[] = [];
  const ownedItems: ProtocolPreviewItem[] = [];
  const seenItemKeys = new Set<string>();
  const selectedKeys = new Set<string>();
  for (const step of [...decision.steps].sort((left, right) => left.position - right.position)) {
    let item: ProtocolPreviewItem | undefined;
    let action: 'apply' | 'wait' | 'rinse' | 'leave_in' | 'heat';
    if (step.action === 'apply') action = 'apply';
    else if (step.action === 'wait') action = 'wait';
    else if (step.action === 'rinse') action = 'rinse';
    else if (step.action === 'leave_in') action = 'leave_in';
    else if (step.action === 'heat') action = 'heat';
    else return unavailable('A step in this plan uses an action that cannot be shown.');
    const hasProduct = step.productId !== null || step.productVersionId !== null;
    const hasTool = step.toolId !== null || step.toolVersionId !== null;
    if ((step.productId === null) !== (step.productVersionId === null)
      || (step.toolId === null) !== (step.toolVersionId === null)
      || (hasProduct && hasTool)) {
      return unavailable('A step in this plan has an item version that cannot be verified.');
    }
    if (step.productId !== null && step.productVersionId !== null) {
      const binding = resolveProductBinding(step.productId, step.productVersionId, context, bundle);
      if (binding === null) {
        return unavailable('A step in this plan refers to a product version that can no longer be verified.');
      }
      item = binding.item;
      selectedKeys.add(`product\u0000${step.productId}\u0000${step.productVersionId}`);
    } else if (step.toolId !== null && step.toolVersionId !== null) {
      const binding = resolveToolBinding(step.toolId, step.toolVersionId, context, bundle);
      if (binding === null) {
        return unavailable('A step in this plan refers to a tool version that can no longer be verified.');
      }
      item = binding.item;
      selectedKeys.add(`tool\u0000${step.toolId}\u0000${step.toolVersionId}`);
    }
    if (action === 'apply' && item === undefined) {
      return unavailable('A step in this plan cannot be shown because it does not identify a product or tool.');
    }
    steps.push(Object.freeze({
      position: step.position,
      action,
      item,
      waitSeconds: step.waitSeconds,
      rinse: step.rinse,
      reason: reasonForStep({ action, waitSeconds: step.waitSeconds, rinse: step.rinse }, item),
    }));
    if (item !== undefined) {
      const itemKey = `${item.kind}\u0000${item.name}`;
      if (!seenItemKeys.has(itemKey)) {
        seenItemKeys.add(itemKey);
        ownedItems.push(item);
      }
    }
  }

  const confidence = confidenceFor(decision.confidence);
  const limitations = limitationsFor(decision.confidence, ownedItems, [...context.products, ...context.tools] as unknown as readonly OwnedEntry[]);
  const alternatives = alternativesFor(context, selectedKeys, bundle);
  const route = routeFor(context, steps);

  const model: ProtocolPreviewModel = Object.freeze({
    status: 'ready',
    route: Object.freeze(route),
    ownedItems: Object.freeze(ownedItems),
    steps: Object.freeze(steps),
    reasons: Object.freeze(steps.map(step => Object.freeze({ step: step.position, text: step.reason }))),
    confidence,
    evidence,
    limitations,
    alternatives,
    ...(heatPrescription === null ? {} : { heatPrescription }),
    noPurchaseNeeded: decision.noPurchaseNeeded ?? null,
  });
  return deepFreeze(model);
}
