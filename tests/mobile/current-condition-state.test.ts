import { describe, expect, it } from 'vitest';

import {
  initialPreflight,
  preflightReducer,
  validateCheckIn,
  type CheckInDraft,
  type PreflightState,
} from '../../apps/mobile/src/guidance/current-condition-state';

const OWNER = 'owner-1';
const OBSERVED = '2026-10-13T08:00:00+02:00';
const NOW = '2026-10-13T12:00:00+02:00';

function draft(overrides: Partial<CheckInDraft> = {}): CheckInDraft {
  return {
    concerns: ['dryness'],
    goal: 'basic_wash',
    availableMinutes: 20,
    saveToPassport: false,
    observedAt: OBSERVED,
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
  it('starts idle with an empty draft that never writes to the Passport', () => {
    const state = initialPreflight(OWNER);
    expect(state.phase).toBe('idle');
    expect(state.ownerId).toBe(OWNER);
    expect(state.ownerEpoch).toBe(0);
    expect(state.requestEpoch).toBe(0);
    expect(state.checkIn.concerns).toEqual([]);
    expect(state.checkIn.goal).toBe('basic_wash');
    expect(state.checkIn.availableMinutes).toBeNull();
    expect(state.checkIn.saveToPassport).toBe(false);
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

  it('records available minutes and the Passport opt-in explicitly', () => {
    let state = checkingIn();
    state = preflightReducer(state, { type: 'set_available_minutes', minutes: 45 });
    expect(state.checkIn.availableMinutes).toBe(45);
    state = preflightReducer(state, { type: 'set_save_to_passport', value: true });
    expect(state.checkIn.saveToPassport).toBe(true);
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
    expect(reset.checkIn.saveToPassport).toBe(false);
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
    expect(late.result).toBeNull();
  });
});
