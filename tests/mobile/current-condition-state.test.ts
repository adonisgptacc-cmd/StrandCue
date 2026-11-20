import { describe, expect, it } from 'vitest';

import { CurrentConditionConcernSchema } from '../../packages/domain/src/index';
import {
  CHECK_IN_CONCERNS,
  clearAllCheckInDrafts,
  clearCheckInDraft,
  initialPreflight,
  loadCheckInDraft,
  loadResolverFocus,
  preflightReducer,
  saveCheckInDraft,
  saveResolverFocus,
  validateCheckIn,
  type CheckInDraft,
  type PreflightState,
} from '../../apps/mobile/src/guidance/current-condition-state';
import { CONCERN_LABELS } from '../../apps/mobile/src/guidance/guidance-copy';
import type { TodayGuidanceResult } from '../../apps/mobile/src/guidance/today-guidance-service';

const OWNER = 'owner-1';
const OBSERVED = '2026-10-13T08:00:00+02:00';
const NOW = '2026-10-13T12:00:00+02:00';

function draft(overrides: Partial<CheckInDraft> = {}): CheckInDraft {
  return {
    concerns: ['dryness'],
    goal: 'basic_wash',
    availableMinutes: 20,
    observedAt: OBSERVED,
    zones: [],
    zoneConcerns: [],
    ...overrides,
  };
}

function checkingIn(overrides: Partial<CheckInDraft> = {}): PreflightState {
  return {
    ...initialPreflight(OWNER),
    phase: 'checking_in',
    checkIn: draft(overrides),
  };
}

describe('today preflight initial state', () => {
  it('starts idle with an empty session-only draft', () => {
    const state = initialPreflight(OWNER);
    expect(state.phase).toBe('idle');
    expect(state.ownerId).toBe(OWNER);
    expect(state.ownerEpoch).toBe(0);
    expect(state.requestEpoch).toBe(0);
    expect(state.checkIn.concerns).toEqual([]);
    expect(state.checkIn.goal).toBe('basic_wash');
    expect(state.checkIn.availableMinutes).toBeNull();
    expect(state.checkIn).not.toHaveProperty('saveToPassport');
    expect(state.checkIn.observedAt).toBeNull();
    expect(state.errors).toEqual([]);
    expect(state.result).toBeNull();
  });

  it('begins a check-in only from idle, stamping the explicit observation time', () => {
    const started = preflightReducer(initialPreflight(OWNER), {
      type: 'begin_check_in',
      observedAt: OBSERVED,
    });
    expect(started.phase).toBe('checking_in');
    expect(started.checkIn.observedAt).toBe(OBSERVED);
    expect(started.checkIn.concerns).toEqual([]);

    const busy = checkingIn();
    expect(preflightReducer(busy, { type: 'begin_check_in', observedAt: OBSERVED })).toBe(busy);
  });
});

describe('today preflight concern selection', () => {
  it('selects multiple concerns without depending on tap order', () => {
    let state = checkingIn({ concerns: [] });
    state = preflightReducer(state, { type: 'toggle_concern', concern: 'frizz' });
    state = preflightReducer(state, { type: 'toggle_concern', concern: 'dryness' });
    expect([...state.checkIn.concerns].sort()).toEqual(['dryness', 'frizz']);
  });

  it('toggles a concern off again', () => {
    let state = checkingIn({ concerns: ['dryness', 'frizz'] });
    state = preflightReducer(state, { type: 'toggle_concern', concern: 'dryness' });
    expect(state.checkIn.concerns).toEqual(['frizz']);
  });

  it('treats unknown as exclusive: selecting it clears every other concern', () => {
    const state = preflightReducer(checkingIn({ concerns: ['dryness', 'frizz'] }), {
      type: 'toggle_concern',
      concern: 'unknown',
    });
    expect(state.checkIn.concerns).toEqual(['unknown']);
  });

  it('treats none as exclusive: selecting it clears every other concern', () => {
    const state = preflightReducer(checkingIn({ concerns: ['dryness'] }), {
      type: 'toggle_concern',
      concern: 'none',
    });
    expect(state.checkIn.concerns).toEqual(['none']);
  });

  it('selecting an ordinary concern clears a standing unknown or none', () => {
    const fromUnknown = preflightReducer(checkingIn({ concerns: ['unknown'] }), {
      type: 'toggle_concern',
      concern: 'dryness',
    });
    expect(fromUnknown.checkIn.concerns).toEqual(['dryness']);
    const fromNone = preflightReducer(checkingIn({ concerns: ['none'] }), {
      type: 'toggle_concern',
      concern: 'frizz',
    });
    expect(fromNone.checkIn.concerns).toEqual(['frizz']);
  });

  it('rejects a contradictory check-in that combines none with other concerns', () => {
    expect(validateCheckIn(draft({ concerns: ['none', 'dryness'] }), NOW)).toContain(
      'concerns_exclusive',
    );
    expect(validateCheckIn(draft({ concerns: ['unknown', 'none'] }), NOW)).toContain(
      'concerns_exclusive',
    );
  });

  it('never mutates the previous draft', () => {
    const before = checkingIn({ concerns: ['dryness'] });
    const after = preflightReducer(before, { type: 'toggle_concern', concern: 'frizz' });
    expect(before.checkIn.concerns).toEqual(['dryness']);
    expect(after.checkIn.concerns).toEqual(['dryness', 'frizz']);
  });
});

describe('today preflight draft edits', () => {
  it('changes goals without touching concerns', () => {
    const state = preflightReducer(checkingIn({ concerns: ['dryness'] }), {
      type: 'set_goal',
      goal: 'basic_wash',
    });
    expect(state.checkIn.goal).toBe('basic_wash');
    expect(state.checkIn.concerns).toEqual(['dryness']);
  });

  it('records available minutes explicitly', () => {
    const state = preflightReducer(checkingIn(), { type: 'set_available_minutes', minutes: 45 });
    expect(state.checkIn.availableMinutes).toBe(45);
  });

  it('refreshes the observation time without touching answers', () => {
    const next = '2026-10-13T09:30:00+02:00';
    const state = preflightReducer(checkingIn({ concerns: ['dryness'] }), {
      type: 'refresh_observed_at',
      observedAt: next,
    });
    expect(state.checkIn.observedAt).toBe(next);
    expect(state.checkIn.concerns).toEqual(['dryness']);
  });

  it('ignores draft edits outside the check-in step', () => {
    const idle = initialPreflight(OWNER);
    expect(
      preflightReducer(idle, { type: 'toggle_concern', concern: 'dryness' }),
    ).toBe(idle);
    expect(
      preflightReducer(idle, { type: 'set_available_minutes', minutes: 10 }),
    ).toBe(idle);
  });

  it('clears validation errors on the next edit', () => {
    const invalid = preflightReducer(checkingIn({ concerns: [] }), {
      type: 'complete_check_in',
      now: NOW,
    });
    expect(invalid.errors).toContain('concerns_required');
    const edited = preflightReducer(invalid, { type: 'toggle_concern', concern: 'dryness' });
    expect(edited.errors).toEqual([]);
    expect(edited.phase).toBe('checking_in');
  });
});

describe('today preflight validation', () => {
  it('requires at least one concern answer', () => {
    expect(validateCheckIn(draft({ concerns: [] }), NOW)).toContain('concerns_required');
    expect(validateCheckIn(draft({ concerns: ['none'] }), NOW)).not.toContain(
      'concerns_required',
    );
  });

  it('requires available time within a single routine session', () => {
    expect(validateCheckIn(draft({ availableMinutes: null }), NOW)).toContain('time_required');
    expect(validateCheckIn(draft({ availableMinutes: 0 }), NOW)).toEqual([]);
    expect(validateCheckIn(draft({ availableMinutes: 1440 }), NOW)).toEqual([]);
    expect(validateCheckIn(draft({ availableMinutes: -1 }), NOW)).toContain('time_range');
    expect(validateCheckIn(draft({ availableMinutes: 1441 }), NOW)).toContain('time_range');
    expect(validateCheckIn(draft({ availableMinutes: 1.5 }), NOW)).toContain('time_range');
    expect(validateCheckIn(draft({ availableMinutes: Number.NaN }), NOW)).toContain('time_range');
  });

  it('requires an explicit observation timestamp that is not in the future', () => {
    expect(validateCheckIn(draft({ observedAt: null }), NOW)).toContain('observed_at_required');
    expect(validateCheckIn(draft({ observedAt: 'not-a-time' }), NOW)).toContain(
      'observed_at_invalid',
    );
    expect(validateCheckIn(draft({ observedAt: '2026-10-13T12:00:00' }), NOW)).toContain(
      'observed_at_invalid',
    );
    expect(
      validateCheckIn(draft({ observedAt: '2026-10-13T12:00:01+02:00' }), NOW),
    ).toContain('observed_at_future');
    expect(validateCheckIn(draft({ observedAt: NOW }), NOW)).toEqual([]);
  });

  it('stays in the check-in step with errors when validation fails', () => {
    const state = preflightReducer(checkingIn({ concerns: [], availableMinutes: null }), {
      type: 'complete_check_in',
      now: NOW,
    });
    expect(state.phase).toBe('checking_in');
    expect(state.errors).toContain('concerns_required');
    expect(state.errors).toContain('time_required');
  });

  it('becomes ready to generate only when the whole check-in validates', () => {
    const state = preflightReducer(checkingIn(), { type: 'complete_check_in', now: NOW });
    expect(state.phase).toBe('ready_to_generate');
    expect(state.errors).toEqual([]);
  });

  it('ignores completion outside the check-in step', () => {
    const idle = initialPreflight(OWNER);
    expect(preflightReducer(idle, { type: 'complete_check_in', now: NOW })).toBe(idle);
  });
});

describe('today preflight reset and owner change', () => {
  it('resets a finished check-in back to idle without inventing answers', () => {
    const finished = preflightReducer(checkingIn(), { type: 'complete_check_in', now: NOW });
    const reset = preflightReducer(finished, { type: 'reset' });
    expect(reset.phase).toBe('idle');
    expect(reset.checkIn.concerns).toEqual([]);
    expect(reset.checkIn.availableMinutes).toBeNull();
    expect(reset.errors).toEqual([]);
    expect(reset.result).toBeNull();
  });

  it('returns an in-progress check-in to the form with its draft intact', () => {
    const ready = preflightReducer(checkingIn({ concerns: ['frizz'] }), {
      type: 'complete_check_in',
      now: NOW,
    });
    const back = preflightReducer(ready, { type: 'back_to_check_in' });
    expect(back.phase).toBe('checking_in');
    expect(back.checkIn.concerns).toEqual(['frizz']);
  });

  it('never resets while a generation is in flight', () => {
    const generating: PreflightState = {
      ...checkingIn(),
      phase: 'generating',
      requestEpoch: 1,
    };
    expect(preflightReducer(generating, { type: 'reset' })).toBe(generating);
  });

  it('keeps the same owner untouched', () => {
    const state = checkingIn();
    expect(preflightReducer(state, { type: 'owner_changed', ownerId: OWNER })).toBe(state);
  });

  it('an owner change discards the draft, the errors and any result', () => {
    const result = { status: 'content_pending' } as const;
    const before: PreflightState = {
      ...checkingIn({ concerns: ['dryness'] }),
      phase: 'result',
      ownerEpoch: 2,
      requestEpoch: 4,
      errors: ['time_required'],
      result,
    };
    const after = preflightReducer(before, { type: 'owner_changed', ownerId: 'owner-2' });
    expect(after.phase).toBe('idle');
    expect(after.ownerId).toBe('owner-2');
    expect(after.ownerEpoch).toBe(3);
    expect(after.requestEpoch).toBe(0);
    expect(after.checkIn.concerns).toEqual([]);
    expect(after.errors).toEqual([]);
    expect(after.result).toBeNull();
  });
});

describe('today preflight generation epochs', () => {
  function ready(): PreflightState {
    return { ...checkingIn(), phase: 'ready_to_generate' };
  }

  it('starts a generation exactly once from the ready state', () => {
    const generating = preflightReducer(ready(), { type: 'generation_started', requestEpoch: 1 });
    expect(generating.phase).toBe('generating');
    expect(generating.requestEpoch).toBe(1);
    expect(preflightReducer(generating, { type: 'generation_started', requestEpoch: 2 })).toBe(
      generating,
    );
  });

  it('retries a generation from the result state with the same check-in', () => {
    const finished = preflightReducer(
      preflightReducer(ready(), { type: 'generation_started', requestEpoch: 1 }),
      {
        type: 'generation_finished',
        requestEpoch: 1,
        result: { status: 'content_pending' } as const,
      },
    );
    expect(finished.phase).toBe('result');
    const retrying = preflightReducer(finished, {
      type: 'generation_started',
      requestEpoch: 2,
    });
    expect(retrying.phase).toBe('generating');
    expect(retrying.requestEpoch).toBe(2);
  });

  it('refuses to start a generation from any other state', () => {
    const idle = initialPreflight(OWNER);
    expect(preflightReducer(idle, { type: 'generation_started', requestEpoch: 1 })).toBe(idle);
    const editing = checkingIn();
    expect(preflightReducer(editing, { type: 'generation_started', requestEpoch: 1 })).toBe(
      editing,
    );
  });

  it('applies only the current generation response', () => {
    const generating = preflightReducer(ready(), {
      type: 'generation_started',
      requestEpoch: 1,
    });
    const result = { status: 'content_pending' } as const;
    const finished = preflightReducer(generating, {
      type: 'generation_finished',
      requestEpoch: 1,
      result,
    });
    expect(finished.phase).toBe('result');
    expect(finished.result).toEqual(result);
  });

  it('discards a late response from a superseded request', () => {
    const generating = preflightReducer(ready(), {
      type: 'generation_started',
      requestEpoch: 2,
    });
    const stale = preflightReducer(generating, {
      type: 'generation_finished',
      requestEpoch: 1,
      result: { status: 'content_pending' } as const,
    });
    expect(stale).toBe(generating);
  });

  it('discards a response that arrives after an owner change', () => {
    const generating = preflightReducer(ready(), {
      type: 'generation_started',
      requestEpoch: 1,
    });
    const cleared = preflightReducer(generating, {
      type: 'owner_changed',
      ownerId: 'owner-2',
    });
    const late = preflightReducer(cleared, {
      type: 'generation_finished',
      requestEpoch: 1,
      result: { status: 'content_pending' } as const,
    });
    expect(late).toBe(cleared);
    expect(late.phase).toBe('idle');
    expect(late.checkIn.concerns).toEqual([]);
    expect(late.result).toBeNull();
  });
});

describe('Task 3.1: the check-in offers the complete cosmetic vocabulary', () => {
  it('lists exactly the concerns the domain contract defines, in the contract order, with none and unknown last', () => {
    expect([...CHECK_IN_CONCERNS]).toEqual([...CurrentConditionConcernSchema.options]);
    expect(CHECK_IN_CONCERNS.slice(-2)).toEqual(['none', 'unknown']);
  });

  it('offers buildup, scalp discomfort, chemical processing and heat as separate answers', () => {
    for (const concern of ['buildup', 'scalp-discomfort', 'chemical-processing-concern', 'heat-concern'] as const) {
      expect(CHECK_IN_CONCERNS).toContain(concern);
      const picked = preflightReducer(checkingIn({ concerns: [] }), { type: 'toggle_concern', concern });
      expect(picked.checkIn.concerns).toEqual([concern]);
    }
  });

  it('keeps the new concerns tap-order independent and exclusive with none and unknown', () => {
    let state = checkingIn({ concerns: [] });
    for (const concern of ['heat-concern', 'buildup', 'scalp-discomfort'] as const) {
      state = preflightReducer(state, { type: 'toggle_concern', concern });
    }
    expect(validateCheckIn(state.checkIn, NOW)).toEqual([]);
    const none = preflightReducer(state, { type: 'toggle_concern', concern: 'none' });
    expect(none.checkIn.concerns).toEqual(['none']);
    const back = preflightReducer(none, { type: 'toggle_concern', concern: 'buildup' });
    expect(back.checkIn.concerns).toEqual(['buildup']);
    expect(validateCheckIn(draft({ concerns: ['none', 'heat-concern'] }), NOW)).toEqual(['concerns_exclusive']);
    expect(validateCheckIn(draft({ concerns: ['unknown', 'scalp-discomfort'] }), NOW)).toEqual(['concerns_exclusive']);
  });

  it('words every concern plainly: unique, non-empty, self-reported and never a diagnosis', () => {
    const labels = Object.values(CONCERN_LABELS);
    expect(Object.keys(CONCERN_LABELS).sort()).toEqual([...CurrentConditionConcernSchema.options].sort());
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) {
      expect(label.trim()).not.toBe('');
      expect(label).not.toMatch(/diagnos|disease|dermatitis|infection|alopecia|psoriasis|treat|cure|medical/i);
    }
    expect(CONCERN_LABELS['chemical-processing-concern']).toMatch(/worried|concern/i);
    expect(CONCERN_LABELS['heat-concern']).toMatch(/worried|concern/i);
  });
});

/**
 * Task 3.2: the zone step and the owner-scoped check-in session.
 *
 * Pure reducer work: a zone can only be in the list once, the order is
 * fixed, and a concern can only be attached to a zone and a concern the
 * owner actually reported.
 */
describe('task 3.2: zones in the check-in', () => {
  const ZONE = { region: 'crown' as const, segment: 'roots' as const };
  const OTHER_ZONE = { region: 'nape' as const, segment: 'ends' as const };

  it('adds a zone once and keeps the order canonical', () => {
    const state = preflightReducer(
      { ...initialPreflight(OWNER), phase: 'checking_in', checkIn: draft({ concerns: ['dryness'] }) },
      { type: 'toggle_zone', region: 'crown', segment: 'roots' },
    );
    expect(state.checkIn.zones).toEqual([ZONE]);
    const second = preflightReducer(
      state,
      { type: 'toggle_zone', region: 'nape', segment: 'ends' },
    );
    expect(second.checkIn.zones).toEqual([ZONE, OTHER_ZONE]);
  });

  it('removes a zone that is already there, with the concerns attached to it', () => {
    const state = preflightReducer(
      {
        ...initialPreflight(OWNER),
        phase: 'checking_in',
        checkIn: draft({
          concerns: ['dryness'],
          zones: [ZONE],
          zoneConcerns: [{ zone: ZONE, concerns: ['dryness'] }],
        }),
      },
      { type: 'toggle_zone', region: 'crown', segment: 'roots' },
    );
    expect(state.checkIn.zones).toEqual([]);
    expect(state.checkIn.zoneConcerns).toEqual([]);
  });

  it('attaches a concern to a zone and takes it off again', () => {
    const base = {
      ...initialPreflight(OWNER),
      phase: 'checking_in' as const,
      checkIn: draft({ concerns: ['dryness'], zones: [ZONE] }),
    };
    const attached = preflightReducer(base, {
      type: 'toggle_zone_concern',
      zone: ZONE,
      concern: 'dryness',
    });
    expect(attached.checkIn.zoneConcerns).toEqual([{ zone: ZONE, concerns: ['dryness'] }]);
    const detached = preflightReducer(attached, {
      type: 'toggle_zone_concern',
      zone: ZONE,
      concern: 'dryness',
    });
    expect(detached.checkIn.zoneConcerns).toEqual([]);
  });

  it('refuses to attach a concern to a zone or an answer the owner never gave', () => {
    const base = {
      ...initialPreflight(OWNER),
      phase: 'checking_in' as const,
      checkIn: draft({ concerns: ['dryness'] }),
    };
    const noZone = preflightReducer(base, {
      type: 'toggle_zone_concern',
      zone: ZONE,
      concern: 'dryness',
    });
    expect(noZone.checkIn.zoneConcerns).toEqual([]);
    const withZone = { ...base, checkIn: draft({ concerns: ['dryness'], zones: [ZONE] }) };
    const notReported = preflightReducer(withZone, {
      type: 'toggle_zone_concern',
      zone: ZONE,
      concern: 'frizz',
    });
    expect(notReported.checkIn.zoneConcerns).toEqual([]);
    const exclusive = preflightReducer(
      { ...withZone, checkIn: draft({ concerns: ['none'], zones: [ZONE] }) },
      { type: 'toggle_zone_concern', zone: ZONE, concern: 'none' },
    );
    expect(exclusive.checkIn.zoneConcerns).toEqual([]);
  });

  it('asks for the missing answer when a zone was named but nothing was noticed there', () => {
    expect(validateCheckIn(draft({ zones: [ZONE] }), NOW)).toContain('zone_concerns_required');
    expect(
      validateCheckIn(draft({ zones: [ZONE], zoneConcerns: [{ zone: ZONE, concerns: ['dryness'] }] }), NOW),
    ).not.toContain('zone_concerns_required');
    // No zone at all is a complete answer: zone detail is optional.
    expect(validateCheckIn(draft(), NOW)).not.toContain('zone_concerns_required');
  });
});

describe('task 3.2: the owner-scoped check-in session', () => {
  it('keeps a draft for its owner and clears it on request', () => {
    clearAllCheckInDrafts();
    expect(loadCheckInDraft(OWNER)).toBeNull();
    saveCheckInDraft(OWNER, draft({ concerns: ['dryness'] }));
    expect(loadCheckInDraft(OWNER)?.concerns).toEqual(['dryness']);
    expect(loadCheckInDraft('owner-2')).toBeNull();
    clearCheckInDraft(OWNER);
    expect(loadCheckInDraft(OWNER)).toBeNull();
  });

  it('keeps the gap the owner was resolving, and forgets it with the session', () => {
    clearAllCheckInDrafts();
    expect(loadResolverFocus(OWNER)).toBeNull();
    saveResolverFocus(OWNER, 'gap:hair_profile:passport_fact_missing:abcd');
    expect(loadResolverFocus(OWNER)).toBe('gap:hair_profile:passport_fact_missing:abcd');
    clearAllCheckInDrafts();
    expect(loadResolverFocus(OWNER)).toBeNull();
  });

  it('restores a saved draft only into an idle check-in', () => {
    const idle = preflightReducer(initialPreflight(OWNER), {
      type: 'restore_check_in',
      draft: draft({ concerns: ['dryness'] }),
    });
    expect(idle.phase).toBe('checking_in');
    expect(idle.checkIn.concerns).toEqual(['dryness']);
    const busy = preflightReducer(
      { ...idle, phase: 'ready_to_generate' },
      { type: 'restore_check_in', draft: draft({ concerns: ['frizz'] }) },
    );
    expect(busy.checkIn.concerns).toEqual(['dryness']);
  });
});

/**
 * Task 3.2 review fixes: the check-in can never hold an answer the domain
 * would refuse, and a stale result never survives a return to the form.
 */
describe('task 3.2: the check-in can never contradict itself', () => {
  const ZONE = { region: 'crown' as const, segment: 'roots' as const };

  it('removes a concern from every area it was attached to when it is un-ticked', () => {
    const state = preflightReducer(
      {
        ...initialPreflight(OWNER),
        phase: 'checking_in',
        checkIn: draft({
          concerns: ['dryness', 'frizz'],
          zones: [ZONE],
          zoneConcerns: [{ zone: ZONE, concerns: ['dryness'] }],
        }),
      },
      { type: 'toggle_concern', concern: 'dryness' },
    );
    expect(state.checkIn.concerns).toEqual(['frizz']);
    expect(state.checkIn.zoneConcerns).toEqual([]);
  });

  it('removes every attached concern when a stand-alone answer is chosen', () => {
    const state = preflightReducer(
      {
        ...initialPreflight(OWNER),
        phase: 'checking_in',
        checkIn: draft({
          concerns: ['dryness'],
          zones: [ZONE],
          zoneConcerns: [{ zone: ZONE, concerns: ['dryness'] }],
        }),
      },
      { type: 'toggle_concern', concern: 'none' },
    );
    expect(state.checkIn.concerns).toEqual(['none']);
    expect(state.checkIn.zoneConcerns).toEqual([]);
  });

  it('reports an area attachment the owner did not report', () => {
    const errors = validateCheckIn(draft({
      concerns: ['dryness'],
      zones: [ZONE],
      zoneConcerns: [{ zone: ZONE, concerns: ['frizz'] }],
    }), NOW);
    expect(errors).toContain('zone_concern_unreported');
  });

  it('orders areas by the taxonomy the owner picks them in', () => {
    const state = preflightReducer(
      {
        ...initialPreflight(OWNER),
        phase: 'checking_in',
        checkIn: draft({ concerns: ['dryness'] }),
      },
      { type: 'toggle_zone', region: 'nape', segment: 'ends' },
    );
    const second = preflightReducer(
      state,
      { type: 'toggle_zone', region: 'crown', segment: 'roots' },
    );
    expect(second.checkIn.zones.map(zone => zone.region)).toEqual(['crown', 'nape']);
  });

  it('leaves the previous result behind when the owner goes back to the form', () => {
    const withResult = {
      ...initialPreflight(OWNER),
      phase: 'result' as const,
      result: { status: 'content_pending' } as TodayGuidanceResult,
    };
    const back = preflightReducer(withResult, { type: 'back_to_check_in' });
    expect(back.phase).toBe('checking_in');
    expect(back.result).toBeNull();
  });

  it('carries a reason back to the form, so the owner is never left guessing', () => {
    const back = preflightReducer(
      { ...initialPreflight(OWNER), phase: 'ready_to_generate' },
      { type: 'back_to_check_in', error: 'check_in_unusable' },
    );
    expect(back.errors).toEqual(['check_in_unusable']);
  });

  it('removes an area that has lost its last answer', () => {
    const state = preflightReducer(
      {
        ...initialPreflight(OWNER),
        phase: 'checking_in',
        checkIn: draft({
          concerns: ['dryness'],
          zones: [ZONE],
          zoneConcerns: [{ zone: ZONE, concerns: ['dryness'] }],
        }),
      },
      { type: 'toggle_concern', concern: 'dryness' },
    );
    // An area with nothing noticed in it cannot be completed, so it goes
    // with the answer that left it.
    expect(state.checkIn.zones).toEqual([]);
    expect(state.checkIn.zoneConcerns).toEqual([]);
    expect(validateCheckIn(state.checkIn, NOW)).not.toContain('zone_concerns_required');
  });

  it('forgets the previous owner when another owner is served', () => {
    clearAllCheckInDrafts();
    saveCheckInDraft(OWNER, draft({ concerns: ['dryness'] }));
    expect(loadCheckInDraft(OWNER)?.concerns).toEqual(['dryness']);
    // Another owner is served: the previous owner's session goes with them.
    expect(loadCheckInDraft('owner-2')).toBeNull();
    expect(loadCheckInDraft(OWNER)).toBeNull();
  });
});
