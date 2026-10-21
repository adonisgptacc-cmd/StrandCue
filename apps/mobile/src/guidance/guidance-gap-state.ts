import type {
  GuidanceGap,
  GuidanceGapKind,
  GuidanceGapReason,
  GuidanceGapState,
  GuidanceIncompleteSource,
} from '../../../../packages/domain/src/index';
import type { GuidanceRoute } from '../navigation';
import {
  CONTENT_PENDING_ITEM_BODY,
  CONTENT_PENDING_ITEM_TITLE,
  FAILED_SOURCE_BODY,
  FAILED_SOURCE_UNKNOWN_BODY,
  RESOLVER_ACTIONS,
  RESOLVER_ANNOUNCEMENT_MANY,
  RESOLVER_ANNOUNCEMENT_ONE,
  RESOLVER_CONTENT_ANNOUNCEMENT,
  RESOLVER_FAILED_ANNOUNCEMENT,
  RESOLVER_SETUP_ANNOUNCEMENT_MANY,
  RESOLVER_SETUP_ANNOUNCEMENT_ONE,
  RETRY_DATA_ACCESSIBILITY,
  RETRY_DATA_LABEL,
  SOURCE_AREA_NAMES,
} from './guidance-copy';

/**
 * The guidance gap resolver (Task 3.2).
 *
 * This module is pure: it turns the gaps, failed sources and content state a
 * request produced into the exact list of things the resolver shows. It
 * decides three things and nothing else:
 *
 * 1. **Where a gap goes.** The destination comes from the gap's own
 *    destination, and falls back to the kind's own destination when the gap
 *    names none. A gap with nowhere to go gets no action at all.
 * 2. **What the owner does next.** Every resolvable gap gets one primary
 *    action. A second action appears only where it genuinely helps: a manual
 *    product can be matched, an unavailable one can be replaced.
 * 3. **The order and the key.** The order is fixed, so the same set of gaps
 *    always reads the same way whatever order the records arrived in, and the
 *    key is built from the gap's own identity so two issues about the same
 *    field never collide.
 *
 * Nothing here renders, reads the clock, or writes anything.
 */

export interface GuidanceResolverAction {
  readonly id: string;
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly route: GuidanceRoute;
}

export interface GuidanceResolverItem {
  /** A stable, collision-resistant key. Never shown to the owner. */
  readonly key: string;
  readonly kind: GuidanceGapKind;
  readonly reason: GuidanceGapReason | null;
  readonly state: GuidanceGapState;
  /** The owner-facing description of the gap. */
  readonly title: string;
  /** The safe name of the subject, when the gap names one. */
  readonly subjectLabel: string | null;
  /**
   * The internal subject, used only to focus the right part of the check-in.
   * It may be a record id: it is never rendered and never leaves the app.
   */
  readonly internalSubject: string | null;
  readonly route: GuidanceRoute | null;
  /** The one action that resolves the gap, or `null` when nothing can. */
  readonly primaryAction: GuidanceResolverAction | null;
  readonly secondaryAction: GuidanceResolverAction | null;
}

export interface GuidanceResolverInput {
  /** The gaps that stop a plan. */
  readonly gaps: readonly GuidanceGap[];
  /** The owner records that could not be read. */
  readonly failedSources: readonly GuidanceIncompleteSource[];
  /** Whether reviewed content for this situation is not published yet. */
  readonly contentPending: boolean;
  /**
   * Whether a read failed without saying which area. The resolver then says
   * so plainly instead of naming an area it does not know.
   */
  readonly sourceReadFailed?: boolean;
}

/**
 * The order the resolver reads in. It follows the order the owner can act in:
 * a broken read first, because nothing else can be trusted until it is
 * fixed; then the answers that contradict themselves; then the recorded facts
 * a plan needs; then the products and tools; and last the content that is
 * not published yet, which nobody can act on.
 */
const ROUTE_GROUP: Readonly<Record<GuidanceRoute, number>> = {
  retry_sources: 0,
  today_check_in: 1,
  my_hair: 2,
  my_hair_services: 3,
  my_shelf: 4,
  my_tools: 5,
  content_pending: 6,
};

/**
 * Where a kind of gap is resolved when the gap names no destination of its
 * own. The kind's own route is the fallback, so a gap without a destination
 * still reaches the screen that can fix it.
 */
const KIND_ROUTE: Readonly<Record<GuidanceGapKind, GuidanceRoute>> = {
  hair_profile: 'my_hair',
  service_presence: 'my_hair_services',
  product_version: 'my_shelf',
  product_capability: 'my_shelf',
  tool_version: 'my_tools',
  tool_capability: 'my_tools',
  source_incomplete: 'retry_sources',
  reviewed_content: 'content_pending',
  current_condition: 'today_check_in',
};

/** Within one group, the state that needs the most attention comes first. */
const STATE_GROUP: Readonly<Record<GuidanceGapState, number>> = {
  contradictory: 0,
  failed_source: 0,
  missing: 1,
  unknown: 2,
  unsupported: 3,
  content_pending: 4,
};

/**
 * A short, stable digest of the gap's identity. Two issues about the same
 * field are told apart by their kind, their reason and their subject, so
 * their keys never collide; the digest itself carries no id and no wording
 * the owner could read.
 */
function digest(text: string): string {
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
}

/**
 * The render key of a gap. It is derived from the gap's identity and never
 * from its position in a list or from its wording, so the same gap keeps the
 * same key wherever it appears, and two gaps that share a field still differ.
 */
export function gapRenderKey(gap: GuidanceGap): string {
  const material = [
    gap.kind,
    gap.reason ?? 'general',
    gap.state,
    gap.subject ?? '',
  ].join('\u0000');
  return `gap:${gap.kind}:${gap.reason ?? 'general'}:${digest(material)}`;
}

function action(
  definition: { readonly id: string; readonly label: string; readonly accessibilityLabel: string },
  route: GuidanceRoute,
): GuidanceResolverAction {
  return {
    id: definition.id,
    label: definition.label,
    accessibilityLabel: definition.accessibilityLabel,
    route,
  };
}

/** The destination a gap's own destination points at, or the kind's own. */
function routeFor(gap: GuidanceGap): GuidanceRoute {
  switch (gap.destination) {
    case 'my_hair':
      return 'my_hair';
    case 'my_hair_services':
      return 'my_hair_services';
    case 'my_shelf':
      return 'my_shelf';
    case 'my_tools':
      return 'my_tools';
    case 'today_check_in':
      return 'today_check_in';
    default:
      return KIND_ROUTE[gap.kind];
  }
}

/**
 * The action label, with the subject named when the gap names one. "Match
 * this product" on its own says nothing; "Match your saved shampoo in My
 * Shelf" says exactly what the action acts on.
 */
function withSubject(label: string, subject: string | null): string {
  if (subject === null) return label;
  return label
    .replace('this product', subject)
    .replace('this tool', subject)
    .replace('this', subject);
}

/** The second action, where a second action genuinely helps. */
function secondaryFor(gap: GuidanceGap, route: GuidanceRoute): GuidanceResolverAction | null {
  const subject = gap.subjectLabel ?? null;
  switch (gap.reason) {
    case 'product_unavailable':
      return action(RESOLVER_ACTIONS.chooseAvailableProduct, route);
    case 'product_manual_unmatched':
    case 'product_capability_unpublished':
      return {
        ...action(RESOLVER_ACTIONS.matchProduct, route),
        label: withSubject(RESOLVER_ACTIONS.matchProduct.label, subject),
        accessibilityLabel: withSubject(RESOLVER_ACTIONS.matchProduct.accessibilityLabel, subject),
      };
    case 'product_no_candidate':
      return action(RESOLVER_ACTIONS.addProduct, route);
    case 'tool_unavailable':
    case 'tool_not_recorded':
      return action(RESOLVER_ACTIONS.addTool, route);
    case 'tool_manual_unmatched':
      return {
        ...action(RESOLVER_ACTIONS.matchTool, route),
        label: withSubject(RESOLVER_ACTIONS.matchTool.label, subject),
        accessibilityLabel: withSubject(RESOLVER_ACTIONS.matchTool.accessibilityLabel, subject),
      };
    case 'tool_temperature_unknown':
      return {
        ...action(RESOLVER_ACTIONS.addTemperature, route),
        label: withSubject(RESOLVER_ACTIONS.addTemperature.label, subject),
        accessibilityLabel: withSubject(RESOLVER_ACTIONS.addTemperature.accessibilityLabel, subject),
      };
    case 'tool_heat_method_unknown':
      return {
        ...action(RESOLVER_ACTIONS.addHeatMethod, route),
        label: withSubject(RESOLVER_ACTIONS.addHeatMethod.label, subject),
        accessibilityLabel: withSubject(RESOLVER_ACTIONS.addHeatMethod.accessibilityLabel, subject),
      };
    default:
      return null;
  }
}

/** The one primary action for a gap. */
function primaryFor(gap: GuidanceGap, route: GuidanceRoute): GuidanceResolverAction | null {
  const subject = gap.subjectLabel ?? null;
  switch (route) {
    case 'my_hair':
      return {
        ...action(RESOLVER_ACTIONS.addInMyHair, route),
        label: withSubject(RESOLVER_ACTIONS.addInMyHair.label, subject),
        accessibilityLabel: withSubject(RESOLVER_ACTIONS.addInMyHair.accessibilityLabel, subject),
      };
    case 'my_hair_services':
      return action(RESOLVER_ACTIONS.reviewServices, route);
    case 'my_shelf':
      return action(RESOLVER_ACTIONS.reviewShelf, route);
    case 'my_tools':
      return action(RESOLVER_ACTIONS.reviewTools, route);
    case 'today_check_in':
      return action(RESOLVER_ACTIONS.reviewCheckIn, route);
    case 'retry_sources':
      return {
        id: 'retry_sources',
        label: RETRY_DATA_LABEL,
        accessibilityLabel: RETRY_DATA_ACCESSIBILITY,
        route,
      };
    default:
      // A content limitation asks nothing of the owner: there is no action
      // that would help, and an action that does nothing is worse than none.
      return null;
  }
}

function compareItems(left: GuidanceResolverItem, right: GuidanceResolverItem): number {
  const leftGroup = left.route === null ? ROUTE_GROUP.content_pending : ROUTE_GROUP[left.route];
  const rightGroup = right.route === null ? ROUTE_GROUP.content_pending : ROUTE_GROUP[right.route];
  const byGroup = leftGroup - rightGroup;
  if (byGroup !== 0) return byGroup;
  const byState = STATE_GROUP[left.state] - STATE_GROUP[right.state];
  if (byState !== 0) return byState;
  const byKind = left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0;
  if (byKind !== 0) return byKind;
  const byReason = (left.reason ?? '') < (right.reason ?? '') ? -1 : (left.reason ?? '') > (right.reason ?? '') ? 1 : 0;
  if (byReason !== 0) return byReason;
  const bySubject = (left.internalSubject ?? '') < (right.internalSubject ?? '') ? -1 : (left.internalSubject ?? '') > (right.internalSubject ?? '') ? 1 : 0;
  if (bySubject !== 0) return bySubject;
  return left.title < right.title ? -1 : left.title > right.title ? 1 : 0;
}

/** Turns one gap into the item the resolver shows. */
export function resolverItemFor(gap: GuidanceGap): GuidanceResolverItem {
  const route = routeFor(gap);
  return {
    key: gapRenderKey(gap),
    kind: gap.kind,
    reason: gap.reason ?? null,
    state: gap.state,
    title: gap.detail,
    subjectLabel: gap.subjectLabel ?? null,
    internalSubject: gap.subject,
    route,
    primaryAction: primaryFor(gap, route),
    secondaryAction: secondaryFor(gap, route),
  };
}

/**
 * One item per source that could not be read. The area is named, the app
 * says plainly that it could not read it, and the only action is a retry.
 */
export function failedSourceItems(
  sources: readonly GuidanceIncompleteSource[],
): GuidanceResolverItem[] {
  const ordered = [...sources].sort((left, right) =>
    left.source < right.source ? -1 : left.source > right.source ? 1 : 0,
  );
  return ordered.map(source => {
    const area = SOURCE_AREA_NAMES[source.source];
    return {
      key: `gap:source_incomplete:source_failed:${digest(`${source.source}:${source.state}`)}`,
      kind: 'source_incomplete' as const,
      reason: 'source_failed' as const,
      state: 'failed_source' as const,
      title: FAILED_SOURCE_BODY(area),
      subjectLabel: area,
      internalSubject: source.source,
      route: 'retry_sources' as const,
      primaryAction: {
        id: 'retry_sources',
        label: RETRY_DATA_LABEL,
        accessibilityLabel: RETRY_DATA_ACCESSIBILITY,
        route: 'retry_sources' as const,
      },
      secondaryAction: null,
    };
  });
}

/**
 * The one item shown when the reviewed content for this situation is not
 * published. It says what was read, what is missing and that nothing was
 * guessed, and it asks nothing of the owner.
 */
export function contentPendingItem(): GuidanceResolverItem {
  return {
    key: `gap:reviewed_content:content_not_published:${digest('content_pending')}`,
    kind: 'reviewed_content',
    reason: 'content_not_published',
    state: 'content_pending',
    title: `${CONTENT_PENDING_ITEM_TITLE} ${CONTENT_PENDING_ITEM_BODY}`,
    subjectLabel: null,
    internalSubject: null,
    route: 'content_pending',
    primaryAction: null,
    secondaryAction: null,
  };
}

/**
 * The one item shown when a read failed and no area is known. It says the
 * app could not read the records and asks for one retry. It does not guess
 * which area failed, and it does not blame the owner.
 */
export function unknownSourceFailureItem(): GuidanceResolverItem {
  return {
    key: `gap:source_incomplete:source_failed:${digest('unknown_source')}`,
    kind: 'source_incomplete',
    reason: 'source_failed',
    state: 'failed_source',
    title: FAILED_SOURCE_UNKNOWN_BODY,
    subjectLabel: null,
    internalSubject: null,
    route: 'retry_sources',
    primaryAction: {
      id: 'retry_sources',
      label: RETRY_DATA_LABEL,
      accessibilityLabel: RETRY_DATA_ACCESSIBILITY,
      route: 'retry_sources',
    },
    secondaryAction: null,
  };
}

/**
 * The whole resolver list: failed reads first, then the gaps, then the
 * content that is not published. Two items with the same key are told apart
 * by their position, so a key is never used twice.
 */
export function resolverItems(input: GuidanceResolverInput): GuidanceResolverItem[] {
  const items: GuidanceResolverItem[] = [
    ...failedSourceItems(input.failedSources),
    ...(input.sourceReadFailed === true && input.failedSources.length === 0
      ? [unknownSourceFailureItem()]
      : []),
    ...input.gaps.map(resolverItemFor),
    ...(input.contentPending ? [contentPendingItem()] : []),
  ];
  const seen = new Map<string, number>();
  const keyed = items.map(item => {
    const count = (seen.get(item.key) ?? 0) + 1;
    seen.set(item.key, count);
    return count === 1 ? item : { ...item, key: `${item.key}#${count}` };
  });
  return keyed.sort(compareItems);
}

/**
 * The role the resolver is playing, which decides what its announcement
 * says. The same list of items means different things depending on whether
 * they block a plan, are the owner's own next step, are a read that failed
 * or are content that is not published.
 */
export type GuidanceResolverRole = 'attention' | 'setup' | 'failed' | 'content';

/**
 * The announcement for the resolver. It names the count *and* what the
 * items are, so a changed set with the same count is still announced: a
 * screen-reader user is never left with a silent change.
 */
export function resolverAnnouncement(
  items: readonly GuidanceResolverItem[],
  role: GuidanceResolverRole,
): string {
  if (items.length === 0) return '';
  if (role === 'content') return RESOLVER_CONTENT_ANNOUNCEMENT;
  if (role === 'failed') return RESOLVER_FAILED_ANNOUNCEMENT;
  const summary = role === 'setup'
    ? (items.length === 1
      ? RESOLVER_SETUP_ANNOUNCEMENT_ONE
      : RESOLVER_SETUP_ANNOUNCEMENT_MANY(items.length))
    : (items.length === 1
      ? RESOLVER_ANNOUNCEMENT_ONE
      : RESOLVER_ANNOUNCEMENT_MANY(items.length));
  const titles = items.map(item => item.title).join(' ');
  return `${summary} ${titles}`;
}
