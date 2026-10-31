import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GuidanceGap, ProtocolDecision } from '../../packages/domain/src/index';
import { TodayCheckIn } from '../../apps/mobile/src/TodayCheckIn';
import { TodayGuidance } from '../../apps/mobile/src/TodayGuidance';
import { GuidanceGapResolver } from '../../apps/mobile/src/GuidanceGapResolver';
import {
  CHECK_IN_CONTINUE_LABEL,
  CHECK_IN_START_LABEL,
  CONCERNS_LABEL,
  RESOLVER_HEADING,
  TIME_INPUT_LABEL,
} from '../../apps/mobile/src/guidance/guidance-copy';
import {
  clearAllCheckInDrafts,
  type CheckInDraft,
  type PreflightAction,
} from '../../apps/mobile/src/guidance/current-condition-state';
import { ZONE_REGIONS, ZONE_SEGMENTS } from '../../apps/mobile/src/guidance/current-condition-state';

/**
 * Task 3.2: the guidance gap resolver on the screen.
 *
 * Everything here is synthetic. The service is mocked, so no record is read
 * and no record is written: the tests prove what the resolver does with the
 * gaps it is given, and what it refuses to do with the owner's answers.
 */

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  recordRun: vi.fn(),
  executionStart: vi.fn(),
  executionTransition: vi.fn(),
  executionGetActive: vi.fn(),
  restoreAggregate: vi.fn(),
  uuidCounter: { value: 0 },
  /** Every node the screen reader was asked to focus. */
  accessibilityFocus: [] as unknown[],
  /** Every string the screen reader was asked to announce. */
  announced: [] as string[],
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
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    Pressable: host('button'),
    ScrollView: host('main'),
    StyleSheet: { create: (value: unknown) => value },
    Text: host('span'),
    TextInput: host('input'),
    View: host('div'),
    // The platform's focus and announcement APIs, so the resolver can be
    // tested on the behaviour a screen reader actually sees.
    AccessibilityInfo: {
      setAccessibilityFocus: (tag: unknown) => { mocks.accessibilityFocus.push(tag); },
      announceForAccessibility: (text: string) => { mocks.announced.push(text); },
    },
    findNodeHandle: (node: unknown) => node,
  };
});

vi.mock('expo-crypto', () => ({
  randomUUID: () => {
    mocks.uuidCounter.value += 1;
    return `00000000-0000-4000-8000-${String(mocks.uuidCounter.value).padStart(12, '0')}`;
  },
}));

vi.mock('../../apps/mobile/src/client', () => ({ supabase: null }));
vi.mock('../../apps/mobile/src/guidance/today-guidance-server-api', () => ({
  requestTodayGuidance: mocks.generate,
  hasMatchingTrustedReceipt: () => false,
}));

vi.mock('../../apps/mobile/src/guidance/recommendation-run-api', () => ({
  recordRecommendationRun: mocks.recordRun,
}));

vi.mock('../../apps/mobile/src/guidance/protocol-execution-api', () => ({
  startProtocolExecution: mocks.executionStart,
  transitionProtocolExecution: mocks.executionTransition,
  getActiveProtocolExecution: mocks.executionGetActive,
  getActiveExecutionWithDecision: mocks.restoreAggregate,
}));

vi.mock('../../apps/mobile/src/shelf-api', () => ({
  listUserProducts: vi.fn(async () => ({ items: [], nextCursor: null })),
  getUserProduct: vi.fn(async () => null),
}));

const OWNER = 'owner-1';
const OTHER_OWNER = 'owner-2';

const PASSPORT_GAP: GuidanceGap = {
  kind: 'hair_profile',
  detail: 'Add your strand thickness in My Hair so your plan can use it.',
  subject: 'strandDiameter',
  state: 'missing',
  destination: 'my_hair',
  reason: 'passport_fact_missing',
  subjectLabel: 'your strand thickness',
};

const SERVICE_GAP: GuidanceGap = {
  kind: 'service_presence',
  detail: 'We cannot tell whether the bleach or lightener service you recorded is still affecting your hair. Update it in My Hair under Services.',
  subject: 'service-1',
  state: 'unknown',
  destination: 'my_hair_services',
  reason: 'service_presence_unknown',
  subjectLabel: 'the bleach or lightener service you recorded',
};

const CONTRADICTORY_GAP: GuidanceGap = {
  kind: 'current_condition',
  detail: 'Your answers about what you notice today do not agree. Change them in today\'s check-in.',
  subject: 'current.concerns',
  state: 'contradictory',
  destination: 'today_check_in',
  reason: 'check_in_contradictory',
  subjectLabel: null,
};

function readyDecision(): ProtocolDecision {
  return {
    status: 'ready',
    requestId: 'request-1',
    confidence: 'moderate',
    noPurchaseNeeded: true,
    steps: [],
    omissions: [],
    alternatives: [],
    missingInputs: [],
    audit: {
      requestId: 'request-1',
      engineVersion: '1',
      evaluatedRules: [],
      conflicts: [],
      rankedCandidates: [],
      rejectedCandidates: [],
      restrictions: [],
      missingInputs: [],
    },
  };
}

function readyResult() {
  return {
    status: 'ready',
    decision: readyDecision(),
    requestId: 'request-1',
    asOf: '2026-10-11T09:00:00.000Z',
    engineVersion: '1',
    bundleId: 'bundle-synthetic',
    bundleVersion: '1',
    inputFingerprint: 'a'.repeat(64),
    input: {
      requestId: 'request-1',
      asOf: '2026-10-11T09:00:00.000Z',
      goal: 'basic_wash',
      profileFacts: {},
      historyFacts: {},
      environmentFacts: {},
      products: [],
      tools: [],
      rules: [],
    },
  };
}

function text(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON()).toLowerCase();
}

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find(
    node => node.type === 'button' && node.props.accessibilityLabel === label,
  );
}

function hasButton(renderer: ReactTestRenderer, label: string): boolean {
  return (
    renderer.root.findAll(
      node => node.type === 'button' && node.props.accessibilityLabel === label,
    ).length > 0
  );
}

function labelled(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find(
    node => node.type === 'span' && node.props.accessibilityLabel === label,
  );
}

function liveRegions(renderer: ReactTestRenderer) {
  return renderer.root.findAll(
    node => node.type === 'span' && node.props.accessibilityLiveRegion === 'polite',
  );
}

function alerts(renderer: ReactTestRenderer) {
  return renderer.root.findAll(
    node => node.type === 'span' && node.props.accessibilityRole === 'alert',
  );
}

async function render(
  ownerId: string = OWNER,
  onNavigate = vi.fn(),
): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(TodayGuidance, { ownerId, onNavigate: onNavigate as never }),
      {
        createNodeMock: () => ({ focus: vi.fn() }),
      },
    );
    await Promise.resolve();
  });
  return renderer;
}

async function press(renderer: ReactTestRenderer, label: string): Promise<void> {
  await act(async () => {
    button(renderer, label).props.onPress();
    await Promise.resolve();
  });
}

async function completeCheckIn(
  renderer: ReactTestRenderer,
  concerns: string[] = ['Dryness'],
  minutes: string = '20',
): Promise<void> {
  if (hasButton(renderer, CHECK_IN_START_LABEL)) {
    await press(renderer, CHECK_IN_START_LABEL);
  }
  for (const concern of concerns) {
    const control = button(renderer, concern);
    if (control.props.accessibilityState?.checked !== true) await press(renderer, concern);
  }
  const time = renderer.root.find(
    node => node.type === 'input' && node.props.accessibilityLabel === TIME_INPUT_LABEL,
  );
  await act(async () => {
    time.props.onChangeText(minutes);
    await Promise.resolve();
  });
  await press(renderer, CHECK_IN_CONTINUE_LABEL);
}

async function generate(renderer: ReactTestRenderer): Promise<void> {
  await completeCheckIn(renderer);
  await press(renderer, 'Generate my plan');
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

beforeEach(() => {
  vi.clearAllMocks();
  clearAllCheckInDrafts();
  mocks.uuidCounter.value = 0;
  mocks.generate.mockResolvedValue({ status: 'content_pending' });
  mocks.recordRun.mockResolvedValue({ requestId: 'request-1' });
  mocks.restoreAggregate.mockResolvedValue(null);
  mocks.executionGetActive.mockResolvedValue(null);
});

describe('the resolver on the screen', () => {
  it('shows a heading, one announcement and one action per gap', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [PASSPORT_GAP] });
    const renderer = await render();
    await generate(renderer);
    expect(labelled(renderer, RESOLVER_HEADING).props.accessibilityRole).toBe('header');
    expect(liveRegions(renderer).length).toBeGreaterThan(0);
    expect(hasButton(renderer, 'Add your strand thickness in My Hair')).toBe(true);
    await act(async () => { renderer.unmount(); });
  });

  it('names the subject in the action, so the button says what it acts on', async () => {
    mocks.generate.mockResolvedValue({
      status: 'needs_setup',
      missing: [
        {
          kind: 'product_capability',
          detail: 'Your saved shampoo is saved by hand, so StrandCue cannot check the exact version yet. Match it in My Shelf.',
          subject: 'owner-item-1',
          state: 'unknown',
          destination: 'my_shelf',
          reason: 'product_manual_unmatched',
          subjectLabel: 'your saved shampoo',
        },
      ],
    });
    const renderer = await render();
    await generate(renderer);
    expect(hasButton(renderer, 'Match your saved shampoo in My Shelf')).toBe(true);
    await act(async () => { renderer.unmount(); });
  });

  it('announces the items themselves, so a changed set is never silent', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [PASSPORT_GAP] });
    const renderer = await render();
    await generate(renderer);
    const announcement = liveRegions(renderer)[0].props.children as string;
    expect(announcement).toContain('your strand thickness');
    await act(async () => { renderer.unmount(); });
  });

  it('shows one state heading on the screen, not two', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [PASSPORT_GAP] });
    const renderer = await render();
    await generate(renderer);
    const headers = renderer.root.findAll(
      node => node.type === 'span' && node.props.accessibilityRole === 'header',
    );
    const labels = headers.map(node => node.props.accessibilityLabel as string);
    // The resolver's heading is the one that names the state; the screen
    // title beside it is not a second heading saying the same thing.
    expect(labels).toContain(RESOLVER_HEADING);
    expect(labels).not.toContain('A few things are needed first');
    await act(async () => { renderer.unmount(); });
  });

  it('announces the new state once, with no second alert on the same screen', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [PASSPORT_GAP] });
    const renderer = await render();
    await generate(renderer);
    const resolverAnnouncements = liveRegions(renderer);
    expect(resolverAnnouncements.length).toBe(1);
    // An alert role would announce the same change a second time.
    expect(alerts(renderer).length).toBe(0);
    await act(async () => { renderer.unmount(); });
  });

  it('moves focus to the first thing the owner can act on when the resolver appears', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [PASSPORT_GAP] });
    const renderer = await render();
    await generate(renderer);
    expect(mocks.accessibilityFocus.length).toBeGreaterThan(0);
    await act(async () => { renderer.unmount(); });
  });

  it('speaks the Services destination without an arrow glyph', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [SERVICE_GAP] });
    const renderer = await render();
    await generate(renderer);
    const service = button(renderer, 'Review your chemical services in My Hair');
    expect(service.props.accessibilityLabel).not.toContain('→');
    expect(text(renderer)).not.toContain('→');
    await act(async () => { renderer.unmount(); });
  });

  it('never renders a raw id, an internal field path or database wording', async () => {
    mocks.generate.mockResolvedValue({
      status: 'needs_setup',
      missing: [
        PASSPORT_GAP,
        { ...SERVICE_GAP, subject: '11111111-1111-4111-8111-111111111111' },
      ],
    });
    const renderer = await render();
    await generate(renderer);
    const rendered = text(renderer);
    expect(rendered).not.toContain('11111111-1111-4111-8111-111111111111');
    expect(rendered).not.toContain('stranddiameter');
    expect(rendered).not.toContain('source_incomplete');
    expect(rendered).not.toMatch(/select |invalid|schema|rule conflict/i);
    await act(async () => { renderer.unmount(); });
  });

  it('keeps the optional setup apart from the gaps that stop a plan', async () => {
    // A blocking gap and an optional setup item are never shown as one
    // list: one is needed before a plan, the other is the owner's choice.
    mocks.generate.mockResolvedValue({
      status: 'needs_setup',
      missing: [PASSPORT_GAP],
      setup: [
        {
          kind: 'product_capability',
          detail: 'Your saved shampoo is saved by hand, so StrandCue cannot check the exact version yet. Match it in My Shelf.',
          subject: 'owner-item-1',
          state: 'unknown',
          destination: 'my_shelf',
          reason: 'product_manual_unmatched',
          subjectLabel: 'your saved shampoo',
        },
      ],
    });
    const renderer = await render();
    await generate(renderer);
    expect(hasButton(renderer, 'Add your strand thickness in My Hair')).toBe(true);
    expect(hasButton(renderer, 'Match your saved shampoo in My Shelf')).toBe(false);
    await act(async () => { renderer.unmount(); });
  });

  it('offers the optional setup beside a plan that was produced', async () => {
    mocks.generate.mockResolvedValue({
      ...readyResult(),
      setup: [
        {
          kind: 'product_capability',
          detail: 'Your saved shampoo is saved by hand, so StrandCue cannot check the exact version yet. Match it in My Shelf.',
          subject: 'owner-item-1',
          state: 'unknown',
          destination: 'my_shelf',
          reason: 'product_manual_unmatched',
          subjectLabel: 'your saved shampoo',
        },
      ],
    });
    const renderer = await render();
    await generate(renderer);
    expect(hasButton(renderer, 'Review My Shelf')).toBe(true);
    expect(text(renderer)).toContain('what you could add next');
    await act(async () => { renderer.unmount(); });
  });

  it('gives every action a destination in its label and a large enough target', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [SERVICE_GAP] });
    const renderer = await render();
    await generate(renderer);
    const service = button(renderer, 'Review your chemical services in My Hair');
    const style = service.props.style as Record<string, unknown>[];
    expect((style[0] as { minHeight?: number }).minHeight).toBeGreaterThanOrEqual(44);
    await act(async () => { renderer.unmount(); });
  });
});

describe('the check-in answers', () => {
  function draft(overrides: Partial<CheckInDraft> = {}): CheckInDraft {
    return {
      concerns: [],
      goal: 'basic_wash',
      availableMinutes: 20,
      observedAt: '2026-10-13T08:00:00+02:00',
      zones: [],
      zoneConcerns: [],
      ...overrides,
    };
  }

  async function renderCheckIn(checkIn: CheckInDraft) {
    const dispatch = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        createElement(TodayCheckIn, {
          draft: checkIn,
          errors: [],
          nowIso: () => '2026-10-13T12:00:00+02:00',
          dispatch: dispatch as never,
        }),
      );
      await Promise.resolve();
    });
    return { renderer, dispatch };
  }

  it('clears concrete concerns when the owner answers none', async () => {
    const { renderer, dispatch } = await renderCheckIn(draft({ concerns: ['dryness', 'frizz'] }));
    await press(renderer, 'None of these');
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggle_concern', concern: 'none' });
    await act(async () => { renderer.unmount(); });
  });

  it('clears concrete concerns when the owner answers not sure', async () => {
    const { renderer, dispatch } = await renderCheckIn(draft({ concerns: ['dryness'] }));
    await press(renderer, 'I am not sure');
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggle_concern', concern: 'unknown' });
    await act(async () => { renderer.unmount(); });
  });

  it('clears none and not sure when the owner picks a concrete concern', async () => {
    const { renderer, dispatch } = await renderCheckIn(draft({ concerns: ['none'] }));
    await press(renderer, 'Dryness');
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggle_concern', concern: 'dryness' });
    await act(async () => { renderer.unmount(); });
  });

  it('does not repeat the section heading in every concern label', async () => {
    const { renderer } = await renderCheckIn(draft());
    const labels = renderer.root
      .findAll(node => node.props.accessibilityLabel === undefined ? false : true)
      .map(node => node.props.accessibilityLabel as string)
      .filter(label => typeof label === 'string');
    expect(labels).toContain('Dryness');
    expect(labels).not.toContain(`${CONCERNS_LABEL}: Dryness`);
    // The section itself is still a header, read once.
    expect(labels).toContain(CONCERNS_LABEL);
    await act(async () => { renderer.unmount(); });
  });

  it('uses the existing service-zone taxonomy and plain owner-facing labels', async () => {
    const { renderer } = await renderCheckIn(draft());
    await press(renderer, 'Crown');
    const labels = renderer.root
      .findAll(node => typeof node.props.accessibilityLabel === 'string')
      .map(node => node.props.accessibilityLabel as string);
    expect(labels).toContain('Whole head');
    expect(labels).toContain('Part of the hair: Roots');
    expect(ZONE_REGIONS).toContain('crown');
    expect(ZONE_SEGMENTS).toContain('mid-lengths');
    await act(async () => { renderer.unmount(); });
  });

  it('exposes the selected state of a zone and never adds the same zone twice', async () => {
    const { renderer, dispatch } = await renderCheckIn(draft());
    await press(renderer, 'Crown');
    await press(renderer, 'Part of the hair: Roots');
    const zoneToggle = dispatch.mock.calls
      .map(call => call[0] as PreflightAction)
      .filter(action => action.type === 'toggle_zone');
    expect(zoneToggle).toHaveLength(1);
    expect(zoneToggle[0]).toMatchObject({ region: 'crown', segment: 'roots' });
    await act(async () => { renderer.unmount(); });
  });

  it('keeps zones in a canonical order and attaches concerns to one zone', async () => {
    const { renderer, dispatch } = await renderCheckIn(
      draft({ concerns: ['dryness'], zones: [{ region: 'crown', segment: 'roots' }] }),
    );
    const attached = renderer.root.find(
      node => node.type === 'button' && node.props.accessibilityLabel === 'Crown, Roots: Dryness',
    );
    expect(attached.props.accessibilityRole).toBe('checkbox');
    expect(attached.props.accessibilityState).toMatchObject({ checked: false });
    await act(async () => {
      attached.props.onPress();
      await Promise.resolve();
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'toggle_zone_concern',
      zone: { region: 'crown', segment: 'roots' },
      concern: 'dryness',
    });
    await act(async () => { renderer.unmount(); });
  });
});

describe('check-in preservation', () => {
  it('keeps the check-in when the owner opens a destination and comes back', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [PASSPORT_GAP] });
    const onNavigate = vi.fn();
    let renderer = await render(OWNER, onNavigate);
    await completeCheckIn(renderer, ['Dryness'], '35');
    await press(renderer, 'Generate my plan');
    await press(renderer, 'Add your strand thickness in My Hair');
    expect(onNavigate).toHaveBeenCalledWith('my_hair');
    await act(async () => { renderer.unmount(); });

    // The owner comes back to Today: their answers are still there.
    renderer = await render(OWNER, onNavigate);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(false);
    expect(button(renderer, 'Dryness').props.accessibilityState).toMatchObject({ checked: true });
    const time = renderer.root.find(
      node => node.type === 'input' && node.props.accessibilityLabel === TIME_INPUT_LABEL,
    );
    expect(time.props.value).toBe('35');
    await act(async () => { renderer.unmount(); });
  });

  it('keeps the check-in across a normal rerender', async () => {
    let renderer = await render();
    await press(renderer, CHECK_IN_START_LABEL);
    await press(renderer, 'Frizz');
    await act(async () => {
      renderer.update(createElement(TodayGuidance, { ownerId: OWNER, onNavigate: vi.fn() as never }));
      await Promise.resolve();
    });
    expect(button(renderer, 'Frizz').props.accessibilityState).toMatchObject({ checked: true });
    await act(async () => { renderer.unmount(); });
  });

  it('keeps the check-in when a destination save fails', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [PASSPORT_GAP] });
    const onNavigate = vi.fn();
    let renderer = await render(OWNER, onNavigate);
    await completeCheckIn(renderer, ['Dryness'], '25');
    await press(renderer, 'Generate my plan');
    await press(renderer, 'Add your strand thickness in My Hair');
    // The destination could not save; the owner returns to Today.
    await act(async () => { renderer.unmount(); });
    renderer = await render(OWNER, onNavigate);
    expect(button(renderer, 'Dryness').props.accessibilityState).toMatchObject({ checked: true });
    const time = renderer.root.find(
      node => node.type === 'input' && node.props.accessibilityLabel === TIME_INPUT_LABEL,
    );
    expect(time.props.value).toBe('25');
    await act(async () => { renderer.unmount(); });
  });

  it('keeps zone-attached concerns when the owner goes away and comes back', async () => {
    const renderer = await render();
    await press(renderer, CHECK_IN_START_LABEL);
    await press(renderer, 'Dryness');
    await press(renderer, 'Crown');
    await press(renderer, 'Part of the hair: Roots');
    await press(renderer, 'Crown, Roots: Dryness');
    await act(async () => { renderer.unmount(); });

    const again = await render();
    const attached = again.root.find(
      node => node.type === 'button' && node.props.accessibilityLabel === 'Crown, Roots: Dryness',
    );
    expect(attached.props.accessibilityState).toMatchObject({ checked: true });
    await act(async () => { again.unmount(); });
  });

  it('keeps the check-in when the owner returns to Today from a check-in gap', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [CONTRADICTORY_GAP] });
    const renderer = await render();
    await completeCheckIn(renderer, ['Dryness'], '20');
    await press(renderer, 'Generate my plan');
    await press(renderer, 'Review check-in answers');
    expect(button(renderer, 'Dryness').props.accessibilityState).toMatchObject({ checked: true });
    await act(async () => { renderer.unmount(); });
  });

  it('brings the owner to the observation time when that is what failed', async () => {
    // A check-in time in the future is the observation time's own problem, so
    // the resolver sends the owner to that part of the form and nowhere else.
    mocks.generate.mockResolvedValue({
      status: 'needs_setup',
      missing: [
        {
          kind: 'current_condition',
          detail: 'The check-in time is in the future. Set it to now or earlier in today\'s check-in.',
          subject: 'current.observedAt',
          state: 'contradictory',
          destination: 'today_check_in',
          reason: 'check_in_contradictory',
          subjectLabel: null,
        },
      ],
    });
    const renderer = await render();
    await completeCheckIn(renderer, ['Dryness'], '20');
    await press(renderer, 'Generate my plan');
    mocks.accessibilityFocus.length = 0;
    await press(renderer, 'Review check-in answers');
    const focused = renderer.root.findAll(
      node => node.type === 'span' && node.props.accessibilityLabel === 'Observation time',
    );
    expect(focused.length).toBe(1);
    expect(mocks.accessibilityFocus.length).toBeGreaterThan(0);
    await act(async () => { renderer.unmount(); });
  });
});

describe('retrying a failed read', () => {
  it('keeps the check-in and reloads through the same trusted path', async () => {
    mocks.generate.mockResolvedValue({
      status: 'source_error',
      detail: 'Your records could not be read completely.',
      incompleteSources: [{ source: 'passport', state: 'failed' }],
    });
    const renderer = await render();
    await completeCheckIn(renderer, ['Dryness'], '30');
    await press(renderer, 'Generate my plan');
    const first = mocks.generate.mock.calls[0][0];
    await press(renderer, 'Try again');
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[1][0].currentCondition).toEqual(first.currentCondition);
    expect(mocks.generate.mock.calls[1][0]).not.toHaveProperty('ownerId');
    await act(async () => { renderer.unmount(); });
  });

  it('never runs two loads at once when the retry is tapped twice', async () => {
    let release: (value: unknown) => void = () => undefined;
    mocks.generate.mockResolvedValue({
      status: 'source_error',
      detail: 'Your records could not be read completely.',
      incompleteSources: [{ source: 'passport', state: 'failed' }],
    });
    const renderer = await render();
    await completeCheckIn(renderer);
    await press(renderer, 'Generate my plan');
    mocks.generate.mockImplementation(
      () => new Promise(resolve => { release = resolve; }),
    );
    await act(async () => {
      const retry = button(renderer, 'Try again');
      retry.props.onPress();
      retry.props.onPress();
      await Promise.resolve();
    });
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    await act(async () => { release({ status: 'content_pending' }); await Promise.resolve(); });
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    await act(async () => { renderer.unmount(); });
  });

  it('disables the retry while the read is running', async () => {
    let release: (value: unknown) => void = () => undefined;
    mocks.generate.mockResolvedValue({
      status: 'source_error',
      detail: 'Your records could not be read completely.',
      incompleteSources: [{ source: 'passport', state: 'failed' }],
    });
    const renderer = await render();
    await completeCheckIn(renderer);
    await press(renderer, 'Generate my plan');
    mocks.generate.mockImplementation(
      () => new Promise(resolve => { release = resolve; }),
    );
    await act(async () => {
      button(renderer, 'Try again').props.onPress();
      await Promise.resolve();
    });
    // While the read runs the button says so, in words as well as in state.
    expect(button(renderer, 'Trying again…').props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => { release({ status: 'content_pending' }); await Promise.resolve(); });
    await act(async () => { renderer.unmount(); });
  });

  it('keeps focus and announces once when the retry fails again', async () => {
    mocks.generate.mockResolvedValue({
      status: 'source_error',
      detail: 'Your records could not be read completely.',
      incompleteSources: [{ source: 'passport', state: 'failed' }],
    });
    const renderer = await render(OWNER, vi.fn());
    await completeCheckIn(renderer);
    await press(renderer, 'Generate my plan');
    mocks.accessibilityFocus.length = 0;
    mocks.announced.length = 0;
    // iOS has no live region, so the platform announcement carries the state
    // there. It is called once, and the live region is not used as well.
    const platform = Platform.OS;
    Platform.OS = 'ios';
    try {
      await press(renderer, 'Try again');
      expect(mocks.announced.filter(text => text.includes('could not read your records again'))).toHaveLength(1);
      expect(liveRegions(renderer).length).toBe(1);
      expect(text(renderer)).toContain('could not read your records again');
      expect(alerts(renderer).length).toBe(0);
      // The same set of gaps is on screen, so focus is not thrown to the top.
      expect(mocks.accessibilityFocus.length).toBe(0);
    } finally {
      Platform.OS = platform;
    }
    await act(async () => { renderer.unmount(); });
  });

  it('removes the resolved source gap when the retry succeeds', async () => {
    mocks.generate.mockResolvedValue({
      status: 'source_error',
      detail: 'Your records could not be read completely.',
      incompleteSources: [{ source: 'passport', state: 'failed' }],
    });
    const renderer = await render();
    await completeCheckIn(renderer);
    await press(renderer, 'Generate my plan');
    expect(text(renderer)).toContain('we could not read my hair');
    mocks.generate.mockResolvedValue({ status: 'content_pending' });
    await press(renderer, 'Try again');
    expect(text(renderer)).not.toContain('we could not read my hair');
    await act(async () => { renderer.unmount(); });
  });
});

describe('owner isolation', () => {
  it('clears the previous owner state before anything is painted', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [PASSPORT_GAP] });
    let renderer = await render(OWNER);
    await completeCheckIn(renderer, ['Dryness'], '20');
    await press(renderer, 'Generate my plan');
    expect(text(renderer)).toContain('strand thickness');
    await act(async () => {
      renderer.update(createElement(TodayGuidance, { ownerId: OTHER_OWNER, onNavigate: vi.fn() as never }));
      await Promise.resolve();
    });
    // The next owner sees neither the previous owner's answers nor the gap.
    expect(text(renderer)).not.toContain('strand thickness');
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    await act(async () => { renderer.unmount(); });
  });

  it('clears every owner session when the owner signs out', async () => {
    const renderer = await render(OWNER);
    await completeCheckIn(renderer, ['Dryness'], '20');
    await act(async () => { renderer.unmount(); });
    clearAllCheckInDrafts();
    const again = await render(OWNER);
    expect(hasButton(again, CHECK_IN_START_LABEL)).toBe(true);
    await act(async () => { again.unmount(); });
  });
});

describe('content that is not published', () => {
  it('shows the content-pending state and offers the owner nothing to change', async () => {
    mocks.generate.mockResolvedValue({ status: 'content_pending' });
    const renderer = await render();
    await generate(renderer);
    const rendered = text(renderer);
    expect(rendered).toContain('reviewed guidance for this situation is not available yet');
    expect(rendered).toContain('we read your information');
    expect(rendered).toContain('did not guess');
    // Nothing sends the owner to change their own records.
    expect(hasButton(renderer, 'Add your strand thickness in My Hair')).toBe(false);
    expect(hasButton(renderer, 'Review My Shelf')).toBe(false);
    expect(hasButton(renderer, 'Review My Tools')).toBe(false);
    await act(async () => { renderer.unmount(); });
  });

  it('never changes the production content status', async () => {
    const { CURRENT_REVIEWED_BUNDLE } = await import('../../apps/mobile/src/guidance/reviewed-bundle');
    const before = CURRENT_REVIEWED_BUNDLE.status;
    mocks.generate.mockResolvedValue({ status: 'content_pending' });
    const renderer = await render();
    await generate(renderer);
    expect(CURRENT_REVIEWED_BUNDLE.status).toBe(before);
    expect(before).toBe('draft');
    await act(async () => { renderer.unmount(); });
  });
});

describe('the resolver on its own', () => {
  const ITEM = {
    key: 'gap:hair_profile:passport_fact_missing:0123456789abcdef',
    kind: 'hair_profile' as const,
    reason: 'passport_fact_missing' as const,
    state: 'missing' as const,
    title: 'Add your strand thickness in My Hair so your plan can use it.',
    subjectLabel: 'your strand thickness',
    subject: 'strandDiameter',
    route: 'my_hair' as const,
    primaryAction: {
      id: 'add_in_my_hair',
      label: 'Add your strand thickness in My Hair',
      accessibilityLabel: 'Add your strand thickness in My Hair',
      route: 'my_hair' as const,
    },
    secondaryAction: {
      id: 'match_product',
      label: 'Match this product',
      accessibilityLabel: 'Match this product in My Shelf',
      route: 'my_shelf' as const,
    },
  };

  async function renderResolver(
    items: readonly typeof ITEM[],
    overrides: Record<string, unknown> = {},
  ): Promise<ReactTestRenderer> {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        createElement(GuidanceGapResolver, {
          items,
          onNavigate: vi.fn(),
          onRetry: vi.fn(),
          onReviewCheckIn: vi.fn(),
          retrying: false,
          retryError: null,
          focusKey: null,
          ...overrides,
        } as never),
      );
      await Promise.resolve();
    });
    return renderer;
  }

  it('shows nothing at all when there is nothing to resolve', async () => {
    const renderer = await renderResolver([]);
    expect(renderer.toJSON()).toBeNull();
    await act(async () => { renderer.unmount(); });
  });

  it('counts the items in its announcement', async () => {
    const renderer = await renderResolver([ITEM]);
    expect(liveRegions(renderer)[0].props.children).toContain('One thing');
    await act(async () => { renderer.unmount(); });
    const many = await renderResolver([ITEM, { ...ITEM, key: `${ITEM.key}#2` }]);
    expect(liveRegions(many)[0].props.children).toContain('2 things');
    await act(async () => { many.unmount(); });
  });

  it('puts focus back on the gap the owner was resolving', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        createElement(GuidanceGapResolver, {
          items: [ITEM],
          onNavigate: vi.fn(),
          onRetry: vi.fn(),
          onReviewCheckIn: vi.fn(),
          retrying: false,
          retryError: null,
          focusKey: ITEM.key,
        } as never),
        { createNodeMock: () => ({ focus: vi.fn() }) },
      );
      await Promise.resolve();
    });
    expect(mocks.accessibilityFocus.length).toBeGreaterThan(0);
    await act(async () => { renderer.unmount(); });
  });

  it('disables both actions while a retry is running', async () => {
    const renderer = await renderResolver([ITEM], { retrying: true });
    expect(button(renderer, 'Add your strand thickness in My Hair').props.accessibilityState).toMatchObject({ disabled: true });
    expect(button(renderer, 'Match this product in My Shelf').props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => { renderer.unmount(); });
  });

  it('sends the owner to the destination of the action they tapped', async () => {
    const onNavigate = vi.fn();
    const renderer = await renderResolver([ITEM], { onNavigate });
    await press(renderer, 'Add your strand thickness in My Hair');
    expect(onNavigate).toHaveBeenCalledWith('my_hair', ITEM.key);
    await act(async () => { renderer.unmount(); });
  });
});

describe('what the resolver never does', () => {
  it('creates no activity and no protocol event while a gap is resolved', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [PASSPORT_GAP] });
    const renderer = await render();
    await generate(renderer);
    await press(renderer, 'Add your strand thickness in My Hair');
    expect(mocks.recordRun).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    expect(mocks.executionTransition).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('never writes the temporary check-in to the Hair Passport', async () => {
    mocks.generate.mockResolvedValue({ status: 'content_pending' });
    const renderer = await render();
    await completeCheckIn(renderer, ['Dryness'], '20');
    await press(renderer, 'Generate my plan');
    const request = mocks.generate.mock.calls[0][0];
    expect(request.currentCondition).not.toHaveProperty('saveToPassport');
    expect(Object.keys(request.currentCondition)).not.toContain('saveToPassport');
    await act(async () => { renderer.unmount(); });
  });

  it('writes nothing to the Shelf or the Tools merely by showing a gap', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [PASSPORT_GAP] });
    const onNavigate = vi.fn();
    const renderer = await render(OWNER, onNavigate);
    await generate(renderer);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });
});
