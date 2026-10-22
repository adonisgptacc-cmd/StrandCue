import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CUE_CHECK_OBSERVATION_FIELDS,
  CueCheckOutcomeFieldSchemas,
} from '../../packages/domain/src/index';
import { CueCheckForm, type CueCheckFormProps } from '../../apps/mobile/src/CueCheckForm';
import { CUE_QUESTIONS, NOT_SURE_LABEL, answerLabel, questionsFor } from '../../apps/mobile/src/cue-check-copy';
import {
  NOTES_LIMIT,
  REASON_LIMIT,
  canSaveCorrection,
  canSaveNew,
  changeSentence,
  describeChanges,
  hasContent,
} from '../../apps/mobile/src/cue-check-form-model';
import { focusOn } from '../../apps/mobile/src/focus';

vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);
vi.mock('../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));

const OBSERVED_AT = '2026-10-22T09:30:00-05:00';

function props(overrides: Partial<CueCheckFormProps> = {}): CueCheckFormProps {
  return {
    mode: 'new',
    timing: 'immediate',
    draft: { timing: 'immediate', observedAt: OBSERVED_AT },
    reason: '',
    saving: false,
    failure: null,
    onAnswer: vi.fn(),
    onNotes: vi.fn(),
    onReason: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

async function render(p: CueCheckFormProps): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(CueCheckForm, p));
  });
  return renderer;
}

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const byLabel = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.type === 'string');
const one = (renderer: ReactTestRenderer, label: string) => {
  const found = byLabel(renderer, label);
  expect(found, `expected exactly one control labelled "${label}"`).toHaveLength(1);
  return found[0]!;
};

const originalConsoleError = console.error.bind(console);
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());
beforeEach(() => vi.mocked(focusOn).mockClear());

describe('cue check copy vocabulary', () => {
  it('labels every definite answer of every field and nothing else', () => {
    for (const field of CUE_CHECK_OBSERVATION_FIELDS) {
      const question = CUE_QUESTIONS.find(entry => entry.field === field);
      expect(question, field).toBeDefined();
      const definite = CueCheckOutcomeFieldSchemas[field].options.filter(value => value !== 'unknown');
      expect(question!.options.map(option => option.value)).toEqual(definite);
      for (const option of question!.options) expect(option.label.length).toBeGreaterThanOrEqual(2);
    }
    expect(CUE_QUESTIONS).toHaveLength(CUE_CHECK_OBSERVATION_FIELDS.length);
  });

  it('keeps style longevity for delayed checks only', () => {
    expect(questionsFor('immediate').map(q => q.field)).not.toContain('styleLongevity');
    expect(questionsFor('delayed').map(q => q.field)).toContain('styleLongevity');
  });

  it('shows "Not sure" for unknown and keeps it distinct from "no reaction noticed"', () => {
    expect(answerLabel('immediateReaction', 'unknown')).toBe(NOT_SURE_LABEL);
    expect(answerLabel('immediateReaction', 'none-noticed')).toBe('No reaction noticed');
    expect(answerLabel('immediateReaction', 'none-noticed')).not.toBe(answerLabel('immediateReaction', 'unknown'));
    expect(answerLabel('wouldUseAgain', 'unsure')).not.toBe(answerLabel('wouldUseAgain', 'unknown'));
  });

  it('uses the plain question wording the product specifies', () => {
    const prompts = CUE_QUESTIONS.map(q => q.prompt);
    expect(prompts).toContain('Overall, how did this result compare with your usual result?');
    expect(prompts).toContain('How satisfied were you with this use?');
    expect(prompts).toContain('Did your hair feel drier, about the same, or less dry than usual?');
    expect(prompts).toContain('Did you notice any immediate reaction?');
    expect(prompts).toContain('Would you choose this routine again?');
  });
});

describe('cue check draft rules', () => {
  it('needs at least one answer or a non-empty note before saving', () => {
    expect(hasContent({ timing: 'immediate', observedAt: OBSERVED_AT })).toBe(false);
    expect(canSaveNew({ timing: 'immediate', observedAt: OBSERVED_AT })).toBe(false);
    expect(canSaveNew({ timing: 'immediate', observedAt: OBSERVED_AT, notes: '' })).toBe(false);
    expect(canSaveNew({ timing: 'immediate', observedAt: OBSERVED_AT, notes: '   \n ' })).toBe(false);
    expect(canSaveNew({ timing: 'immediate', observedAt: OBSERVED_AT, notes: 'Felt fine' })).toBe(true);
    expect(canSaveNew({ timing: 'immediate', observedAt: OBSERVED_AT, dryness: 'unknown' })).toBe(true);
  });

  it('exposes the exact 2,000 and 500 character limits', () => {
    expect(NOTES_LIMIT).toBe(2000);
    expect(REASON_LIMIT).toBe(500);
    expect(canSaveNew({ timing: 'immediate', observedAt: OBSERVED_AT, notes: 'x'.repeat(2000) })).toBe(true);
    expect(canSaveNew({ timing: 'immediate', observedAt: OBSERVED_AT, notes: 'x'.repeat(2001) })).toBe(false);
  });

  it('reads a changed note as added, edited or removed, not as a before-and-after of labels', () => {
    const base = { timing: 'immediate', observedAt: OBSERVED_AT };
    const sentence = (before: Record<string, unknown>, after: Record<string, unknown>) => changeSentence(describeChanges(before, after)[0]!);
    expect(sentence({ ...base, notes: 'a' }, { ...base, notes: 'b' })).toBe('Your note: edited');
    expect(sentence(base, { ...base, notes: 'b' })).toBe('Your note: added');
    expect(sentence({ ...base, notes: 'a' }, base)).toBe('Your note: removed');
    expect(sentence({ ...base, dryness: 'less' }, { ...base, dryness: 'more' })).toBe('Dryness: changed from Less dry to Drier');
  });

  it('needs a reason, a real change and a bounded reason to save a correction', () => {
    const original = { timing: 'immediate', observedAt: OBSERVED_AT, dryness: 'less' };
    const changed = { ...original, dryness: 'more' };
    expect(canSaveCorrection({ draft: changed, original, reason: 'Wrong tap' })).toBe(true);
    expect(canSaveCorrection({ draft: changed, original, reason: '   ' })).toBe(false);
    expect(canSaveCorrection({ draft: changed, original, reason: 'x'.repeat(501) })).toBe(false);
    expect(canSaveCorrection({ draft: original, original, reason: 'Wrong tap' })).toBe(false);
    expect(canSaveCorrection({ draft: { timing: 'immediate', observedAt: OBSERVED_AT }, original, reason: 'Wrong tap' })).toBe(false);
  });

  it('describes what a correction changes in plain words', () => {
    const lines = describeChanges(
      { timing: 'immediate', observedAt: OBSERVED_AT, dryness: 'less', frizz: 'same', notes: 'old' },
      { timing: 'immediate', observedAt: OBSERVED_AT, dryness: 'more', softness: 'unknown', notes: 'new' },
    );
    const asText = lines.map(line => `${line.label}: ${line.from} → ${line.to}`);
    expect(asText).toContain('Dryness: Less dry → Drier');
    expect(asText).toContain('Frizz: About the same → Not answered');
    expect(asText).toContain('Softness: Not answered → Not sure');
    expect(asText.some(line => line.startsWith('Your note'))).toBe(true);
    expect(JSON.stringify(lines)).not.toMatch(/dryness|frizz.*less|unknown|[a-z]+[A-Z]/);
    expect(describeChanges({ timing: 'immediate', observedAt: OBSERVED_AT }, { timing: 'immediate', observedAt: OBSERVED_AT })).toEqual([]);
  });
});

describe('cue check form', () => {
  it('does not offer style longevity on an immediate check', async () => {
    const renderer = await render(props({ timing: 'immediate' }));
    expect(text(renderer)).not.toMatch(/style last/i);
  });

  it('offers style longevity on a delayed check', async () => {
    const renderer = await render(props({ timing: 'delayed', draft: { timing: 'delayed', observedAt: OBSERVED_AT } }));
    expect(text(renderer)).toMatch(/How long did your style last/);
  });

  it('titles a later check-in for what the owner noticed later', async () => {
    const delayed = await render(props({ timing: 'delayed', draft: { timing: 'delayed', observedAt: OBSERVED_AT } }));
    expect(text(delayed)).toContain('What did you notice later?');
    expect(text(delayed)).not.toContain('How did your hair feel?');
    expect(text(await render(props()))).toContain('How did your hair feel?');
  });

  it('carries no causal, medical or promise wording in any form text', async () => {
    const original = { timing: 'delayed', observedAt: OBSERVED_AT, dryness: 'less' };
    for (const form of [
      props(),
      props({ timing: 'delayed', draft: { timing: 'delayed', observedAt: OBSERVED_AT } }),
      props({ mode: 'correction', timing: 'delayed', original, draft: { ...original, dryness: 'more' }, reason: 'x' }),
    ]) {
      const out = text(await render(form));
      expect(out).not.toMatch(/caus|proved|proof|repair|heal|fix|treat|grew|growth|strengthen|guarantee|universally safe|diagnos|cure/i);
    }
  });

  it('shows a plain, non-diagnostic note only when a reaction is reported', async () => {
    const note = 'StrandCue cannot assess reactions. If you are worried about how your skin or scalp feels, a health professional can help.';
    const reported = await render(props({ draft: { timing: 'immediate', observedAt: OBSERVED_AT, immediateReaction: 'some-noticed' } }));
    expect(text(reported)).toContain(note);
    for (const reaction of ['none-noticed', 'unknown'] as const) {
      expect(text(await render(props({ draft: { timing: 'immediate', observedAt: OBSERVED_AT, immediateReaction: reaction } })))).not.toContain(note);
    }
    expect(text(await render(props()))).not.toContain(note);
  });

  it('offers "Undecided" for would-use-again, distinct from "Not sure"', async () => {
    const renderer = await render(props());
    const prompt = 'Would you choose this routine again?';
    expect(one(renderer, `${prompt}: Undecided`).props.accessibilityRole).toBe('radio');
    expect(one(renderer, `${prompt}: Not sure`).props.accessibilityRole).toBe('radio');
    expect(text(renderer)).not.toContain('Maybe');
  });

  it('blocks saving after a conflict, explains why and always offers the reload', async () => {
    const original = { timing: 'immediate', observedAt: OBSERVED_AT, dryness: 'less' };
    const onReload = vi.fn();
    const renderer = await render(props({ mode: 'correction', original, draft: { ...original, dryness: 'more' }, reason: 'x', reloadRequired: true, onReload, failure: null }));
    const save = one(renderer, 'Save correction');
    expect(save.props.accessibilityState).toMatchObject({ disabled: true });
    expect(text(renderer)).toContain('Reload this check-in before saving.');
    await act(async () => one(renderer, 'Reload this check-in').props.onPress());
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('turns off every answer and field while saving so edits are never silently dropped', async () => {
    const renderer = await render(props({ saving: true, draft: { timing: 'immediate', observedAt: OBSERVED_AT, notes: 'x' } }));
    const radios = renderer.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radio');
    expect(radios.length).toBeGreaterThan(10);
    for (const radio of radios) expect(radio.props.accessibilityState).toMatchObject({ disabled: true });
    expect(one(renderer, 'Anything else you noticed?').props.editable).toBe(false);
  });

  it('ties the reason a save is unavailable to the save control itself', async () => {
    const renderer = await render(props());
    expect(one(renderer, 'Save check-in').props.accessibilityHint).toBe('Add at least one answer or a note to save.');
  });

  it('keeps retry and reload as separate controls beside one announced alert, not inside a grouped element', async () => {
    const failure = { code: 'offline', message: 'You appear to be offline. Your unsent answers are still here.', retryable: true, source: 'create' } as const;
    const renderer = await render(props({ failure, draft: { timing: 'immediate', observedAt: OBSERVED_AT, notes: 'x'.repeat(1950) } }));
    const grouped = renderer.root.findAll(node => typeof node.type === 'string' && node.props.accessible === true);
    for (const node of grouped) expect(node.findAll(inner => inner.type === 'button')).toHaveLength(0);
    // One announcement channel: the alert is announced through focus, not also as a live region.
    expect(renderer.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLiveRegion !== undefined)).toHaveLength(0);
  });

  it('does not pull focus back to the heading when the owner edits after a failure', async () => {
    const failure = { code: 'offline', message: 'You appear to be offline. Your unsent answers are still here.', retryable: true, source: 'create' } as const;
    const withFailure = props({ failure, draft: { timing: 'immediate', observedAt: OBSERVED_AT, notes: 'a' } });
    const renderer = await render(withFailure);
    const afterMount = vi.mocked(focusOn).mock.calls.length;
    await act(async () => renderer.update(createElement(CueCheckForm, { ...withFailure, failure: null, draft: { ...withFailure.draft, notes: 'ab' } })));
    await act(async () => renderer.update(createElement(CueCheckForm, { ...withFailure, failure, draft: { ...withFailure.draft, notes: 'ab' } })));
    // Only the new failure takes focus; clearing it on edit moves nothing.
    expect(vi.mocked(focusOn).mock.calls.length).toBe(afterMount + 1);
  });

  it('places the reaction note right after the reaction question, before the next question', async () => {
    const renderer = await render(props({ draft: { timing: 'immediate', observedAt: OBSERVED_AT, immediateReaction: 'some-noticed' } }));
    const out = text(renderer);
    const reaction = out.indexOf('Did you notice any immediate reaction?');
    const note = out.indexOf('StrandCue cannot assess reactions.');
    const next = out.indexOf('Would you choose this routine again?');
    expect(reaction).toBeGreaterThan(-1);
    expect(note).toBeGreaterThan(reaction);
    expect(note).toBeLessThan(next);
  });

  it('moves focus to the form heading when it opens', async () => {
    await render(props());
    expect(focusOn).toHaveBeenCalledTimes(1);
  });

  it('records nothing for a skipped question', async () => {
    const p = props();
    await render(p);
    expect(p.onAnswer).not.toHaveBeenCalled();
    expect(p.onNotes).not.toHaveBeenCalled();
  });

  it('maps "Not sure" to unknown and a choice to its value', async () => {
    const p = props();
    const renderer = await render(p);
    await act(async () => one(renderer, 'Did your hair feel drier, about the same, or less dry than usual?: Not sure').props.onPress());
    expect(p.onAnswer).toHaveBeenCalledWith('dryness', 'unknown');
    await act(async () => one(renderer, 'Did your hair feel drier, about the same, or less dry than usual?: Drier').props.onPress());
    expect(p.onAnswer).toHaveBeenLastCalledWith('dryness', 'more');
  });

  it('removes an answer when it is cleared and offers clear only for answered questions', async () => {
    const p = props({ draft: { timing: 'immediate', observedAt: OBSERVED_AT, dryness: 'less' } });
    const renderer = await render(p);
    const clear = 'Clear answer to: Did your hair feel drier, about the same, or less dry than usual?';
    await act(async () => one(renderer, clear).props.onPress());
    expect(p.onAnswer).toHaveBeenCalledWith('dryness', undefined);
    expect(byLabel(renderer, 'Clear answer to: How satisfied were you with this use?')).toHaveLength(0);
  });

  it('announces selected, unselected and distinct unknown states with the question in each name', async () => {
    const q = 'Did you notice any immediate reaction?';
    const none = await render(props({ draft: { timing: 'immediate', observedAt: OBSERVED_AT, immediateReaction: 'none-noticed' } }));
    expect(one(none, `${q}: No reaction noticed`).props.accessibilityState).toMatchObject({ selected: true });
    expect(one(none, `${q}: Not sure`).props.accessibilityState).toMatchObject({ selected: false });
    const unsure = await render(props({ draft: { timing: 'immediate', observedAt: OBSERVED_AT, immediateReaction: 'unknown' } }));
    expect(one(unsure, `${q}: Not sure`).props.accessibilityState).toMatchObject({ selected: true });
    expect(one(unsure, `${q}: No reaction noticed`).props.accessibilityState).toMatchObject({ selected: false });
    expect(one(unsure, `${q}: I noticed a reaction`).props.accessibilityRole).toBe('radio');
  });

  it('gives every control a unique accessible name', async () => {
    const renderer = await render(props({ timing: 'delayed', draft: { timing: 'delayed', observedAt: OBSERVED_AT, dryness: 'less' } }));
    const labels = renderer.root
      .findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')
      .map(node => node.props.accessibilityLabel as string);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.length).toBeGreaterThan(30);
  });

  it('never shows a technical key', async () => {
    const renderer = await render(
      props({ timing: 'delayed', draft: { timing: 'delayed', observedAt: OBSERVED_AT, immediateReaction: 'none-noticed', wouldUseAgain: 'unsure' } }),
    );
    for (const key of ['none-noticed', 'some-noticed', 'styleLongevity', 'wouldUseAgain', 'overallResult', 'immediateReaction', 'unknown', 'dryness']) {
      expect(text(renderer), key).not.toContain(key);
    }
  });

  it('keeps notes exactly as typed within the 2,000 character limit and shows an accessible count', async () => {
    const note = '  line one\n  line two  ';
    const p = props({ draft: { timing: 'immediate', observedAt: OBSERVED_AT, notes: note } });
    const renderer = await render(p);
    const field = one(renderer, 'Anything else you noticed?');
    expect(field.props.maxLength).toBe(2000);
    expect(field.props.value).toBe(note);
    await act(async () => field.props.onChangeText('  as typed  '));
    expect(p.onNotes).toHaveBeenCalledWith('  as typed  ');
    expect(text(renderer)).toContain(`${note.length} of 2000 characters used`);
    const full = await render(props({ draft: { timing: 'immediate', observedAt: OBSERVED_AT, notes: 'x'.repeat(1950) } }));
    expect(text(full)).toContain('50 characters left');
  });

  it('cannot save an empty form and says why', async () => {
    const p = props();
    const renderer = await render(p);
    const save = one(renderer, 'Save check-in');
    expect(save.props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => save.props.onPress());
    expect(p.onSave).not.toHaveBeenCalled();
    expect(text(renderer)).toContain('Add at least one answer or a note to save.');
  });

  it('saves a notes-only check-in', async () => {
    const p = props({ draft: { timing: 'immediate', observedAt: OBSERVED_AT, notes: 'Felt fine' } });
    const renderer = await render(p);
    const save = one(renderer, 'Save check-in');
    expect(save.props.accessibilityState).toMatchObject({ disabled: false });
    await act(async () => save.props.onPress());
    expect(p.onSave).toHaveBeenCalledTimes(1);
  });

  it('keeps the save control in place and ignores taps while saving', async () => {
    const p = props({ saving: true, draft: { timing: 'immediate', observedAt: OBSERVED_AT, notes: 'x' } });
    const renderer = await render(p);
    const save = one(renderer, 'Saving check-in…');
    expect(save.props.accessibilityState).toMatchObject({ busy: true });
    expect(save.props.accessibilityState.disabled).not.toBe(true);
    await act(async () => save.props.onPress());
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it('shows a failure as a visible alert, moves focus to it and keeps the draft', async () => {
    const failure = { code: 'offline', message: 'You appear to be offline. Your unsent answers are still here.', retryable: true, source: 'create' } as const;
    const p = props({ failure, draft: { timing: 'immediate', observedAt: OBSERVED_AT, notes: 'keep me' } });
    const renderer = await render(p);
    const alert = renderer.root.find(node => typeof node.type === 'string' && node.props.accessibilityRole === 'alert');
    expect(JSON.stringify(alert.props.children)).toContain(failure.message);
    expect(focusOn).toHaveBeenCalled();
    expect(one(renderer, 'Anything else you noticed?').props.value).toBe('keep me');
    expect(byLabel(renderer, 'Try saving again')).toHaveLength(1);
  });

  it('labels the correction flow and explains that the earlier entry stays', async () => {
    const original = { timing: 'immediate', observedAt: OBSERVED_AT, dryness: 'less' };
    const renderer = await render(
      props({ mode: 'correction', original, draft: { ...original, dryness: 'more' }, reason: '' }),
    );
    const out = text(renderer);
    expect(out).toContain('Correct an earlier entry');
    expect(out).toContain('Your earlier entry stays in your history.');
    expect(out).toContain('What will change');
    expect(out).toContain('Dryness: changed from Less dry to Drier');
    expect(one(renderer, 'Save correction').props.accessibilityState).toMatchObject({ disabled: true });
    expect(out).toContain('Add a reason for the correction to save.');
  });

  it('enables a correction once it has a reason and a change', async () => {
    const original = { timing: 'immediate', observedAt: OBSERVED_AT, dryness: 'less' };
    const p = props({ mode: 'correction', original, draft: { ...original, dryness: 'more' }, reason: 'Wrong tap' });
    const renderer = await render(p);
    const save = one(renderer, 'Save correction');
    expect(save.props.accessibilityState).toMatchObject({ disabled: false });
    await act(async () => save.props.onPress());
    expect(p.onSave).toHaveBeenCalledTimes(1);
    await act(async () => one(renderer, 'Why are you correcting this entry?').props.onChangeText('Other'));
    expect(p.onReason).toHaveBeenCalledWith('Other');
  });

  it('cancel only calls its handler', async () => {
    const p = props();
    const renderer = await render(p);
    await act(async () => one(renderer, 'Cancel').props.onPress());
    expect(p.onCancel).toHaveBeenCalledTimes(1);
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it('has one screen heading and large touch targets', async () => {
    const renderer = await render(props());
    const headings = renderer.root.findAll(node => node.props.accessibilityRole === 'header' && typeof node.type === 'string');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    const { styles: shared } = await import('../../apps/mobile/src/ui');
    expect(shared.pill.minHeight).toBeGreaterThanOrEqual(44);
    const radios = renderer.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radio');
    for (const radio of radios) expect(JSON.stringify(radio.props.style)).toBeDefined();
    expect(radios.every(radio => (radio.props.style as unknown[]).flat().includes(shared.pill))).toBe(true);
  });
});
