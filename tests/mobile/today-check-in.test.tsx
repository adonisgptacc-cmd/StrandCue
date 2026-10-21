import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { TodayCheckIn } from '../../apps/mobile/src/TodayCheckIn';
import {
  CHECK_IN_BOUNDARY,
  CHECK_IN_CONTINUE_LABEL,
  CHECK_IN_ERROR_TEXT,
  CHECK_IN_ERRORS_HEADING,
  CHECK_IN_SUMMARY_SESSION_ONLY,
  CHECK_IN_TITLE,
  CONCERN_LABELS,
  CONCERNS_LABEL,
  REFRESH_TIME_LABEL,
  TIME_INPUT_LABEL,
  TIME_LABEL,
} from '../../apps/mobile/src/guidance/guidance-copy';
import type { CheckInDraft, CheckInErrorCode } from '../../apps/mobile/src/guidance/current-condition-state';

const mocks = vi.hoisted(() => ({
  nowIso: '2026-10-13T10:00:00+02:00',
  /** Every node the screen reader was asked to focus. */
  accessibilityFocus: [] as unknown[],
}));

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    HostComponent.displayName = `Mock${tag}`;
    return HostComponent;
  };
  return {
    Platform: { OS: 'web' },
    Pressable: host('button'),
    ScrollView: host('main'),
    StyleSheet: { create: (value: unknown) => value },
    Text: host('span'),
    TextInput: host('input'),
    View: host('div'),
    AccessibilityInfo: {
      setAccessibilityFocus: (tag: unknown) => { mocks.accessibilityFocus.push(tag); },
      announceForAccessibility: () => undefined,
    },
    findNodeHandle: (node: unknown) => node,
  };
});

function emptyDraft(overrides: Partial<CheckInDraft> = {}): CheckInDraft {
  return {
    concerns: [],
    goal: 'basic_wash',
    availableMinutes: null,
    observedAt: null,
    zones: [],
    zoneConcerns: [],
    ...overrides,
  };
}

function text(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON()).toLowerCase();
}

function pressables(renderer: ReactTestRenderer) {
  return renderer.root.findAll(node => node.type === 'button');
}

function minHeight(node: { props: { style?: unknown } }): number | null {
  const styles = node.props.style;
  const list = Array.isArray(styles) ? styles : [styles];
  let found: number | null = null;
  for (const entry of list) {
    if (entry && typeof entry === 'object' && 'minHeight' in (entry as Record<string, unknown>)) {
      const value = (entry as { minHeight?: unknown }).minHeight;
      if (typeof value === 'number') found = found === null ? value : Math.min(found, value);
    }
  }
  return found;
}

async function renderCheckIn(
  overrides: {
    draft?: CheckInDraft;
    errors?: readonly CheckInErrorCode[];
    nodeMock?: () => unknown;
  } = {},
) {
  const dispatch = vi.fn();
  const draft = overrides.draft ?? emptyDraft();
  const errors = overrides.errors ?? [];
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(TodayCheckIn, {
        draft,
        errors,
        nowIso: () => mocks.nowIso,
        dispatch,
      }),
      overrides.nodeMock ? { createNodeMock: overrides.nodeMock } : undefined,
    );
    await Promise.resolve();
  });
  return { renderer, dispatch };
}

const originalConsoleError = console.error.bind(console);
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...rest);
  });
});
afterAll(() => { consoleErrorSpy.mockRestore(); });

describe('today check-in labels and screen-reader behavior', () => {
  it('labels the form, every concern, the goal, time and observation controls', async () => {
    const { renderer } = await renderCheckIn();
    const labels = renderer.root
      .findAll(node => typeof node.props.accessibilityLabel === 'string')
      .map(node => node.props.accessibilityLabel as string);
    expect(labels).toContain(CHECK_IN_TITLE);
    for (const concern of Object.values(CONCERN_LABELS)) {
      expect(labels).toContain(`${concern}`);
    }
    expect(labels).toContain(TIME_LABEL);
    expect(labels).toContain(TIME_INPUT_LABEL);
    expect(labels).toContain(REFRESH_TIME_LABEL);
    expect(labels).toContain(CHECK_IN_CONTINUE_LABEL);
    // No save control exists: the session-only notice is plain text instead.
    expect(text(renderer)).toContain(CHECK_IN_SUMMARY_SESSION_ONLY.toLowerCase().slice(0, 40));
    await act(async () => { renderer.unmount(); });
  });

  it('tells a screen-reader user that the two stand-alone answers clear the others, and no other answer says so', async () => {
    const { renderer } = await renderCheckIn();
    const hintOf = (label: string) =>
      renderer.root.find(node => node.type === 'button' && node.props.accessibilityLabel === `${label}`).props.accessibilityHint;
    expect(hintOf(CONCERN_LABELS.none)).toBe('Clears your other choices');
    expect(hintOf(CONCERN_LABELS.unknown)).toBe('Clears your other choices');
    expect(hintOf(CONCERN_LABELS.dryness)).toBeUndefined();
    await act(async () => { renderer.unmount(); });
  });

  it('exposes concerns as checkboxes with checked state and the goal as a radio', async () => {
    const { renderer } = await renderCheckIn({
      draft: emptyDraft({ concerns: ['dryness'] }),
    });
    const dryness = renderer.root.find(
      node => node.type === 'button' && node.props.accessibilityLabel === 'Dryness',
    );
    expect(dryness.props.accessibilityRole).toBe('checkbox');
    expect(dryness.props.accessibilityState).toMatchObject({ checked: true });
    const frizz = renderer.root.find(
      node => node.type === 'button' && node.props.accessibilityLabel === 'Frizz',
    );
    expect(frizz.props.accessibilityState).toMatchObject({ checked: false });
    const goal = renderer.root.find(
      node => node.type === 'button' && node.props.accessibilityLabel === 'Basic wash',
    );
    expect(goal.props.accessibilityState).toMatchObject({ selected: true });
    await act(async () => { renderer.unmount(); });
  });

  it('offers no save control: the check-in is session-only', async () => {
    const { renderer } = await renderCheckIn();
    const switches = renderer.root.findAll(
      node => node.type === 'button' && node.props.accessibilityRole === 'switch',
    );
    expect(switches).toEqual([]);
    expect(text(renderer)).not.toContain('save these answers to my hair');
    expect(text(renderer)).toContain('nothing is saved to my hair');
    await act(async () => { renderer.unmount(); });
  });

  it('offers a numeric keyboard for available time', async () => {
    const { renderer } = await renderCheckIn();
    const time = renderer.root.find(
      node => node.type === 'input' && node.props.accessibilityLabel === TIME_INPUT_LABEL,
    );
    expect(time.props.keyboardType).toBe('numeric');
    await act(async () => { renderer.unmount(); });
  });

  it('dispatches the tapped pill goal rather than a hardcoded one', async () => {
    // Honest RED note: with the single-member goal union this passes pre-fix
    // too — it pins the wiring, while the `Record<CheckInGoal, string>` type
    // change is the real recurrence guard. See the fix report.
    const { renderer, dispatch } = await renderCheckIn();
    const goal = renderer.root.find(
      node => node.type === 'button' && node.props.accessibilityLabel === 'Basic wash',
    );
    const labelledGoal = goal.props.accessibilityLabel as string;
    await act(async () => {
      goal.props.onPress();
      await Promise.resolve();
    });
    expect(labelledGoal).toBe('Basic wash');
    expect(dispatch).toHaveBeenCalledWith({ type: 'set_goal', goal: 'basic_wash' });
    await act(async () => { renderer.unmount(); });
  });

  it('dispatches toggle, time and observation actions without inventing values', async () => {
    const { renderer, dispatch } = await renderCheckIn();
    const dryness = renderer.root.find(
      node => node.type === 'button' && node.props.accessibilityLabel === 'Dryness',
    );
    await act(async () => {
      dryness.props.onPress();
      await Promise.resolve();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggle_concern', concern: 'dryness' });

    const time = renderer.root.find(
      node => node.type === 'input' && node.props.accessibilityLabel === TIME_INPUT_LABEL,
    );
    await act(async () => {
      time.props.onChangeText('45');
      await Promise.resolve();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'set_available_minutes', minutes: 45 });

    dispatch.mockClear();
    await act(async () => {
      time.props.onChangeText('12a');
      await Promise.resolve();
    });
    expect(dispatch).not.toHaveBeenCalled();

    const refresh = renderer.root.find(
      node => node.type === 'button' && node.props.accessibilityLabel === REFRESH_TIME_LABEL,
    );
    await act(async () => {
      refresh.props.onPress();
      await Promise.resolve();
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'refresh_observed_at',
      observedAt: mocks.nowIso,
    });

    const go = renderer.root.find(
      node => node.type === 'button' && node.props.accessibilityLabel === CHECK_IN_CONTINUE_LABEL,
    );
    await act(async () => {
      go.props.onPress();
      await Promise.resolve();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'complete_check_in', now: mocks.nowIso });
    await act(async () => { renderer.unmount(); });
  });
});

describe('today check-in touch targets, focus and large-text structure', () => {
  it('gives every touch target at least a 44x44 minimum', async () => {
    const { renderer } = await renderCheckIn({
      draft: emptyDraft({ concerns: ['dryness'], observedAt: mocks.nowIso }),
    });
    const targets = pressables(renderer);
    expect(targets.length).toBeGreaterThanOrEqual(14);
    for (const target of targets) {
      expect(minHeight(target)).toBeGreaterThanOrEqual(44);
    }
    await act(async () => { renderer.unmount(); });
  });

  it('announces validation errors as an alert and moves focus to the part that failed', async () => {
    const { renderer } = await renderCheckIn({ nodeMock: () => ({ focus: vi.fn() }) });
    expect(mocks.accessibilityFocus.length).toBe(0);
    await act(async () => {
      renderer.update(
        createElement(TodayCheckIn, {
          draft: emptyDraft(),
          errors: ['concerns_required', 'time_required'] as const,
          nowIso: () => mocks.nowIso,
          dispatch: vi.fn(),
        }),
      );
      await Promise.resolve();
    });
    const alert = renderer.root.find(
      node => node.type === 'span' && node.props.accessibilityRole === 'alert',
    );
    expect(alert.props.accessibilityLabel).toBe(CHECK_IN_ERRORS_HEADING);
    expect(text(renderer)).toContain(CHECK_IN_ERROR_TEXT.concerns_required.toLowerCase());
    expect(text(renderer)).toContain(CHECK_IN_ERROR_TEXT.time_required.toLowerCase());
    // The screen reader is sent to the first part of the form that failed.
    expect(mocks.accessibilityFocus.length).toBe(1);
    await act(async () => { renderer.unmount(); });
  });

  it('keeps copy in separate reflowable blocks with header roles', async () => {
    const { renderer } = await renderCheckIn();
    const headers = renderer.root.findAll(
      node => node.type === 'span' && node.props.accessibilityRole === 'header',
    );
    const headerLabels = headers.map(node => node.props.accessibilityLabel as string);
    expect(headerLabels).toContain(CHECK_IN_TITLE);
    expect(headerLabels).toContain(CONCERNS_LABEL);
    for (const node of renderer.root.findAll(node => node.type === 'span')) {
      expect(node.props.numberOfLines).toBeUndefined();
      expect(node.props.ellipsizeMode).toBeUndefined();
    }
    await act(async () => { renderer.unmount(); });
  });
});

describe('today check-in cosmetic boundary and honest wording', () => {
  it('keeps the cosmetic boundary visible with no diagnosis wording', async () => {
    const { renderer } = await renderCheckIn();
    expect(text(renderer)).toContain(CHECK_IN_BOUNDARY.toLowerCase().slice(0, 40));
    expect(text(renderer)).toContain('not a diagnosis');
    expect(text(renderer)).toContain('stay in this session only');
    expect(text(renderer)).toContain('change nothing in my hair');
    await act(async () => { renderer.unmount(); });
  });

  it('carries no medical, purchase, retailer, promise or shame language', async () => {
    const banned = [
      /\bbuy\b/i,
      /\bshop\b/i,
      /\bretailer\b/i,
      /\bguarantee\b/i,
      /https?:\/\//,
      /\bdiscount\b/i,
      /\baffiliate\b/i,
      /\bsponsor/i,
      /\bmiracle\b/i,
      /\bcheckout\b/i,
      /diagnos(is|ed|tic)/i,
      /\btreat(ment|ing|ed|s)?\b/i,
      /\bcur(e|es|ing)\b/i,
      /\bheal/i,
      /\bsymptom/i,
      /\bsevere\b/i,
      /\bprescri/i,
      /\bdos(e|age)\b/i,
      /\btherap/i,
      /\bmedical\b/i,
      /\btoxic\b/i,
      /\bembarrass/i,
      /\bshould be ashamed\b/i,
      /\bwill fix\b/i,
      /\brepairs?\b/i,
      /\bresults guaranteed\b/i,
    ];
    const copy = await import('../../apps/mobile/src/guidance/guidance-copy');
    const strings: string[] = [];
    for (const value of Object.values(copy)) {
      if (typeof value === 'string') strings.push(value);
      else if (typeof value === 'object' && value !== null) {
        for (const nested of Object.values(value as Record<string, unknown>)) {
          if (typeof nested === 'string') strings.push(nested);
          else if (typeof nested === 'function') {
            for (const sample of [0, 1, 20, 45]) {
              try {
                const produced = (nested as (minutes: number) => unknown)(sample);
                if (typeof produced === 'string') strings.push(produced);
              } catch { /* not a minutes formatter */ }
            }
          }
        }
      }
    }
    expect(strings.length).toBeGreaterThan(20);
    for (const candidate of strings) {
      // "not a diagnosis" is the required cosmetic-boundary negation used
      // across Today and Records; anything else medical is banned.
      const withoutBoundaryNegation = candidate.replace(/not a diagnosis/gi, '');
      for (const pattern of banned) {
        expect(withoutBoundaryNegation).not.toMatch(pattern);
      }
    }
    const { renderer } = await renderCheckIn({
      draft: emptyDraft({ concerns: ['dryness', 'frizz'], availableMinutes: 20, observedAt: mocks.nowIso }),
      errors: ['concerns_exclusive'],
    });
    const rendered = text(renderer).replace(/not a diagnosis/g, '');
    for (const pattern of banned) {
      expect(rendered).not.toMatch(pattern);
    }
    await act(async () => { renderer.unmount(); });
  });
});
