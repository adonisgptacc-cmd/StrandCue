import {
  CurrentConditionConcernSchema,
  ServiceRegionSchema,
  ServiceSegmentSchema,
  type CurrentConditionConcern,
  type CurrentConditionZone,
} from '../../../../packages/domain/src/index';
import type { TodayGuidanceResult } from './today-guidance-service.ts';

/**
 * Today preflight state machine (HP-06, TD-01–TD-04, SF-01, UX-01–UX-04).
 *
 * States: `idle → checking_in → ready_to_generate → generating → result`.
 * The check-in is a temporary cosmetic self-report for one routine only: it
 * is session-only and never writes to the Passport, and concerns arrive
 * sorted by `normalizeCurrentCondition` downstream, so this reducer never
 * depends on tap order.
 *
 * Epochs: `ownerEpoch` counts owner changes (an owner change resets the whole
 * machine to `idle` and discards in-flight responses); `requestEpoch` counts
 * generation starts (only the response carrying the current epoch may apply,
 * so duplicate taps and late responses cannot generate twice or overwrite).
 * Nothing here reads the wall clock: observation and reference times travel
 * in the actions so every transition stays deterministic.
 */

export type PreflightPhase =
  | 'idle'
  | 'checking_in'
  | 'ready_to_generate'
  | 'generating'
  | 'result';

/**
 * Every cosmetic concern the domain contract defines, in the contract's own order
 * (`none` and `unknown` last). Derived, not retyped: a concern added to the
 * contract appears here, and a label missing for it fails type-checking.
 */
export const CHECK_IN_CONCERNS: readonly CurrentConditionConcern[] = CurrentConditionConcernSchema.options;

/**
 * The service-zone taxonomy, reused as it is. A check-in names where on the
 * head a concern was noticed, and the reviewed content already speaks in
 * these regions and segments; a second taxonomy would make the two
 * untranslatable.
 */
export const ZONE_REGIONS = ServiceRegionSchema.options;
export const ZONE_SEGMENTS = ServiceSegmentSchema.options;

export type CheckInGoal = 'basic_wash';

/** One zone and the concerns the owner noticed in it. */
export interface CheckInZoneDraft {
  readonly zone: CurrentConditionZone;
  readonly concerns: readonly CurrentConditionConcern[];
}

export interface CheckInDraft {
  readonly concerns: readonly CurrentConditionConcern[];
  readonly goal: CheckInGoal;
  readonly availableMinutes: number | null;
  readonly observedAt: string | null;
  /** The zones the owner named, in canonical order. Optional detail. */
  readonly zones: readonly CurrentConditionZone[];
  /** Which reported concern sits in which reported zone. */
  readonly zoneConcerns: readonly CheckInZoneDraft[];
}

/** The identity of a zone, and the order the taxonomy sorts in. */
export function zoneKey(zone: CurrentConditionZone): string {
  return `${zone.region}:${zone.segment}`;
}

/** Zones in canonical order, so tap order never changes the answer. */
export function sortZones(zones: readonly CurrentConditionZone[]): CurrentConditionZone[] {
  return [...zones].sort((left, right) =>
    zoneKey(left) < zoneKey(right) ? -1 : zoneKey(left) > zoneKey(right) ? 1 : 0,
  );
}

export type CheckInErrorCode =
  | 'concerns_required'
  | 'concerns_exclusive'
  | 'time_required'
  | 'time_range'
  | 'observed_at_required'
  | 'observed_at_invalid'
  | 'observed_at_future'
  | 'zone_concerns_required';

export interface PreflightState {
  readonly phase: PreflightPhase;
  readonly ownerId: string;
  readonly ownerEpoch: number;
  readonly requestEpoch: number;
  readonly checkIn: CheckInDraft;
  readonly errors: readonly CheckInErrorCode[];
  readonly result: TodayGuidanceResult | null;
}

export type PreflightAction =
  | { readonly type: 'begin_check_in'; readonly observedAt: string }
  | { readonly type: 'toggle_concern'; readonly concern: CurrentConditionConcern }
  | { readonly type: 'toggle_zone'; readonly region: CurrentConditionZone['region']; readonly segment: CurrentConditionZone['segment'] }
  | { readonly type: 'toggle_zone_concern'; readonly zone: CurrentConditionZone; readonly concern: CurrentConditionConcern }
  | { readonly type: 'set_goal'; readonly goal: CheckInGoal }
  | { readonly type: 'set_available_minutes'; readonly minutes: number | null }
  | { readonly type: 'refresh_observed_at'; readonly observedAt: string }
  | { readonly type: 'complete_check_in'; readonly now: string }
  | { readonly type: 'back_to_check_in' }
  | { readonly type: 'reset' }
  | { readonly type: 'owner_changed'; readonly ownerId: string }
  | { readonly type: 'restore_check_in'; readonly draft: CheckInDraft }
  | { readonly type: 'generation_started'; readonly requestEpoch: number }
  | {
      readonly type: 'generation_finished';
      readonly requestEpoch: number;
      readonly result: TodayGuidanceResult;
    };

const EMPTY_DRAFT: CheckInDraft = {
  concerns: [],
  goal: 'basic_wash',
  availableMinutes: null,
  observedAt: null,
  zones: [],
  zoneConcerns: [],
};

/**
 * The check-in of one owner, kept for as long as that owner is on the
 * screen. It is a session draft and nothing more: it is never written to the
 * Hair Passport, never persisted, and it is cleared the moment the owner
 * changes, signs out or deletes the account, so no previous owner's answers
 * can be read by the next one.
 */
interface OwnerSession {
  readonly draft: CheckInDraft | null;
  readonly focusKey: string | null;
}

const checkInSessions = new Map<string, OwnerSession>();

function session(ownerId: string): OwnerSession {
  return checkInSessions.get(ownerId) ?? { draft: null, focusKey: null };
}

export function saveCheckInDraft(ownerId: string, draft: CheckInDraft): void {
  checkInSessions.set(ownerId, { ...session(ownerId), draft });
}

export function loadCheckInDraft(ownerId: string): CheckInDraft | null {
  return session(ownerId).draft;
}

/**
 * The gap the owner was resolving. It survives a trip to My Hair or My Shelf
 * so the resolver can put focus back on the same gap when they come back.
 */
export function saveResolverFocus(ownerId: string, focusKey: string | null): void {
  checkInSessions.set(ownerId, { ...session(ownerId), focusKey });
}

export function loadResolverFocus(ownerId: string): string | null {
  return session(ownerId).focusKey;
}

export function clearCheckInDraft(ownerId: string): void {
  checkInSessions.delete(ownerId);
}

export function clearAllCheckInDrafts(): void {
  checkInSessions.clear();
}

export function initialPreflight(ownerId: string): PreflightState {
  return {
    phase: 'idle',
    ownerId,
    ownerEpoch: 0,
    requestEpoch: 0,
    checkIn: EMPTY_DRAFT,
    errors: [],
    result: null,
  };
}

/**
 * Multi-select with exclusive `none`/`unknown`, mirroring the domain schema:
 * either exclusive answer stands alone, and picking an ordinary concern
 * clears a standing exclusive answer. An empty draft is allowed here so the
 * check-in step can report `concerns_required` instead of inventing one.
 */
function toggleConcern(
  selected: readonly CurrentConditionConcern[],
  concern: CurrentConditionConcern,
): readonly CurrentConditionConcern[] {
  if (concern === 'none' || concern === 'unknown') return [concern];
  if (selected.includes(concern)) return selected.filter(entry => entry !== concern);
  return [...selected.filter(entry => entry !== 'none' && entry !== 'unknown'), concern];
}

function hasExplicitOffset(value: string): boolean {
  return /([+-]\d{2}:?\d{2}|z)$/i.test(value.trim());
}

/**
 * Adds or removes a zone. A zone can only be in the list once: adding one
 * that is already there changes nothing, and removing one also removes the
 * concerns attached to it, so nothing can point at a zone that is gone.
 */
function toggleZone(
  draft: CheckInDraft,
  region: CurrentConditionZone['region'],
  segment: CurrentConditionZone['segment'],
): CheckInDraft {
  const zone: CurrentConditionZone = { region, segment };
  const key = zoneKey(zone);
  const present = draft.zones.some(entry => zoneKey(entry) === key);
  const zones = present
    ? draft.zones.filter(entry => zoneKey(entry) !== key)
    : sortZones([...draft.zones, zone]);
  const zoneConcerns = draft.zoneConcerns.filter(entry => zoneKey(entry.zone) !== key);
  return { ...draft, zones, zoneConcerns };
}

/**
 * Attaches or removes a concern on a zone. Only a concern the owner already
 * reported can be attached, and only to a zone the owner already named.
 */
function toggleZoneConcern(
  draft: CheckInDraft,
  zone: CurrentConditionZone,
  concern: CurrentConditionConcern,
): CheckInDraft {
  const key = zoneKey(zone);
  if (!draft.zones.some(entry => zoneKey(entry) === key)) return draft;
  if (!draft.concerns.includes(concern)) return draft;
  if (concern === 'none' || concern === 'unknown') return draft;
  const existing = draft.zoneConcerns.find(entry => zoneKey(entry.zone) === key);
  if (existing === undefined) {
    return {
      ...draft,
      zoneConcerns: sortZoneConcerns([
        ...draft.zoneConcerns,
        { zone, concerns: [concern] },
      ]),
    };
  }
  const attached = existing.concerns.includes(concern);
  const concerns = attached
    ? existing.concerns.filter(entry => entry !== concern)
    : [...existing.concerns, concern].sort();
  const zoneConcerns = concerns.length === 0
    ? draft.zoneConcerns.filter(entry => zoneKey(entry.zone) !== key)
    : draft.zoneConcerns.map(entry => (zoneKey(entry.zone) === key ? { zone, concerns } : entry));
  return { ...draft, zoneConcerns: sortZoneConcerns(zoneConcerns) };
}

/** Zone-attached concerns in canonical order, so tap order never matters. */
function sortZoneConcerns(
  entries: readonly CheckInZoneDraft[],
): readonly CheckInZoneDraft[] {
  return [...entries].sort((left, right) =>
    zoneKey(left.zone) < zoneKey(right.zone) ? -1 : zoneKey(left.zone) > zoneKey(right.zone) ? 1 : 0,
  );
}

/**
 * Pure validation of a check-in draft against an explicit reference instant.
 * Mirrors `CurrentConditionSchema` plus the non-future `observedAt` rule, so
 * the form reports targeted errors before anything reaches the service; the
 * service boundary normalizes again and never trusts this result.
 */
export function validateCheckIn(draft: CheckInDraft, now: string): CheckInErrorCode[] {
  const errors: CheckInErrorCode[] = [];
  if (draft.concerns.length === 0) {
    errors.push('concerns_required');
  } else {
    const exclusive = draft.concerns.filter(
      concern => concern === 'none' || concern === 'unknown',
    );
    if (exclusive.length > 0 && draft.concerns.length > 1) errors.push('concerns_exclusive');
  }
  if (draft.availableMinutes === null) {
    errors.push('time_required');
  } else if (
    !Number.isInteger(draft.availableMinutes) ||
    draft.availableMinutes < 0 ||
    draft.availableMinutes > 1440
  ) {
    errors.push('time_range');
  }
  if (draft.observedAt === null || draft.observedAt.trim() === '') {
    errors.push('observed_at_required');
  } else {
    const parsed = Date.parse(draft.observedAt);
    if (Number.isNaN(parsed) || !hasExplicitOffset(draft.observedAt)) {
      errors.push('observed_at_invalid');
    } else if (parsed > Date.parse(now)) {
      errors.push('observed_at_future');
    }
  }
  // A zone the owner named but attached nothing to is an unfinished answer:
  // they said where, and not what. Where no zone is named, the answer is
  // complete, because zone detail is optional.
  if (
    draft.zones.length > 0 &&
    !draft.zoneConcerns.some(entry => entry.concerns.length > 0)
  ) {
    errors.push('zone_concerns_required');
  }
  return errors;
}

function edit(
  state: PreflightState,
  checkIn: CheckInDraft,
): PreflightState {
  if (state.phase !== 'checking_in') return state;
  return { ...state, checkIn, errors: [] };
}

export function preflightReducer(
  state: PreflightState,
  action: PreflightAction,
): PreflightState {
  switch (action.type) {
    case 'begin_check_in': {
      if (state.phase !== 'idle' && state.phase !== 'result') return state;
      return {
        ...state,
        phase: 'checking_in',
        checkIn: { ...EMPTY_DRAFT, observedAt: action.observedAt },
        errors: [],
        result: null,
      };
    }
    case 'toggle_concern':
      return edit(state, {
        ...state.checkIn,
        concerns: toggleConcern(state.checkIn.concerns, action.concern),
      });
    case 'toggle_zone':
      return edit(state, toggleZone(state.checkIn, action.region, action.segment));
    case 'toggle_zone_concern':
      return edit(state, toggleZoneConcern(state.checkIn, action.zone, action.concern));
    case 'set_goal':
      return edit(state, { ...state.checkIn, goal: action.goal });
    case 'set_available_minutes':
      return edit(state, { ...state.checkIn, availableMinutes: action.minutes });
    case 'refresh_observed_at':
      return edit(state, { ...state.checkIn, observedAt: action.observedAt });
    case 'complete_check_in': {
      if (state.phase !== 'checking_in') return state;
      const errors = validateCheckIn(state.checkIn, action.now);
      if (errors.length > 0) return { ...state, errors };
      return { ...state, phase: 'ready_to_generate', errors: [] };
    }
    case 'back_to_check_in': {
      if (state.phase !== 'ready_to_generate' && state.phase !== 'result') return state;
      return { ...state, phase: 'checking_in', errors: [] };
    }
    case 'reset': {
      if (state.phase === 'generating') return state;
      return { ...state, phase: 'idle', checkIn: EMPTY_DRAFT, errors: [], result: null };
    }
    case 'owner_changed': {
      if (action.ownerId === state.ownerId) return state;
      return {
        ...initialPreflight(action.ownerId),
        ownerEpoch: state.ownerEpoch + 1,
      };
    }
    case 'restore_check_in': {
      // A returning owner finds their own answers again. Nothing else is
      // restored: no result, no error and no decision travel with it.
      if (state.phase !== 'idle') return state;
      return { ...state, phase: 'checking_in', checkIn: action.draft, errors: [] };
    }
    case 'generation_started': {
      // The in-flight guard: a second tap while generating (or from any other
      // state) changes nothing, so one epoch means one generation. A retry
      // from `result` reuses the same validated check-in.
      if (state.phase !== 'ready_to_generate' && state.phase !== 'result') return state;
      return { ...state, phase: 'generating', requestEpoch: action.requestEpoch };
    }
    case 'generation_finished': {
      if (state.phase !== 'generating') return state;
      if (action.requestEpoch !== state.requestEpoch) return state;
      return { ...state, phase: 'result', result: action.result };
    }
  }
}
