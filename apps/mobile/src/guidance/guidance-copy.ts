import type { GuidanceGapKind } from '../../../../packages/domain/src/index';
import type { DestinationId } from '../navigation';
import type { TodayGuidanceResult } from './today-guidance-service';

/**
 * Every string Today shows, in one place.
 *
 * Wording rules for this file:
 * - Cosmetic hair-care guidance only. No diagnosis, no treatment, no promise.
 * - No shame, no purchase pressure, no invented product claims.
 * - Say what is missing and where to fix it, instead of offering generic
 *   advice as a substitute.
 */

export const CONTENT_PENDING_TITLE = 'Reviewed guidance content is still being prepared';
export const CONTENT_PENDING_BODY =
  'StrandCue only produces a plan from reviewed content that a person has checked. None is published yet, so nothing is being generated from your records.';

export const LOADING_LABEL = 'Loading your records…';
export const GENERATE_LABEL = 'Generate my plan';
export const RETRY_LABEL = 'Retry';
export const GENERATING_LABEL = 'Working…';

export const SAVE_FAILED =
  'Plan created, audit save failed. Your plan is shown below, but this decision was not stored privately.';

export const DESTINATION_LABELS: Readonly<Record<DestinationId, string>> = {
  today: 'Go to Today',
  my_hair: 'Go to My Hair',
  my_shelf: 'Go to My Shelf',
  my_tools: 'Go to My Tools',
  journey: 'Go to Journey',
  settings: 'Go to Settings',
};

/**
 * Where a setup gap can actually be fixed. A gap with no destination is
 * explained in text instead — a button that goes nowhere is worse than none.
 */
const GAP_DESTINATION: Readonly<Record<GuidanceGapKind, DestinationId | null>> = {
  hair_profile: 'my_hair',
  service_presence: 'my_hair',
  product_version: 'my_shelf',
  product_capability: 'my_shelf',
  tool_version: 'my_tools',
  tool_capability: 'my_tools',
  source_incomplete: 'journey',
  reviewed_content: null,
};

export function gapDestination(kind: GuidanceGapKind): DestinationId | null {
  return GAP_DESTINATION[kind];
}

export const READY_TITLE = 'Your plan is ready';
export const NEEDS_SETUP_TITLE = 'A few things are needed first';
export const SOURCE_ERROR_TITLE = 'Your records could not be read completely';

/**
 * Heading for the engine's own omission lines on the `unsupported` state.
 * The lines name the reviewed capability no owned item could cover; the
 * heading only labels them, and neither names a retailer nor suggests that
 * buying anything would guarantee an outcome.
 */
export const MISSING_HEADING = 'What is missing';

export function statusTitle(result: TodayGuidanceResult): string {
  switch (result.status) {
    case 'ready':
      return READY_TITLE;
    case 'needs_setup':
      return NEEDS_SETUP_TITLE;
    case 'content_pending':
      return CONTENT_PENDING_TITLE;
    case 'needs_input':
      return 'needs input — this plan needs more from you';
    case 'rule_conflict':
      return 'rule conflict — reviewed rules disagree here';
    case 'unsupported':
      return 'unsupported — no reviewed guidance covers this yet';
    case 'source_error':
      return SOURCE_ERROR_TITLE;
    default:
      return SOURCE_ERROR_TITLE;
  }
}

export function stepLabel(position: number): string {
  return `Step ${position}`;
}

export const CONFIDENCE_LABELS = {
  high: 'High confidence',
  moderate: 'Moderate confidence',
  limited: 'Limited confidence',
} as const;

export function confidenceLabel(confidence: keyof typeof CONFIDENCE_LABELS): string {
  return CONFIDENCE_LABELS[confidence];
}

export const NO_PURCHASE_NEEDED = 'No purchase needed — what you own can do this.';