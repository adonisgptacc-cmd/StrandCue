import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllCheckInDrafts } from '../../apps/mobile/src/guidance/current-condition-state';

import type { GuidanceGap, ProtocolDecision } from '../../packages/domain/src/index';
import { normalizeCurrentCondition } from '../../packages/domain/src/index';
import { TodayGuidance } from '../../apps/mobile/src/TodayGuidance';
import {
  CHECK_IN_CONTINUE_LABEL,
  CHECK_IN_START_LABEL,
  CHECK_IN_SUMMARY_HEADING,
  START_OVER_LABEL,
  TIME_LABEL,
} from '../../apps/mobile/src/guidance/guidance-copy';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  recordRun: vi.fn(),
  executionStart: vi.fn(),
  executionTransition: vi.fn(),
  executionGetActive: vi.fn(),
  restoreAggregate: vi.fn(),
  nowIso: '2026-10-11T09:00:00.000Z',
  uuidCounter: { value: 0 },
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
  };
});

vi.mock('expo-crypto', () => ({
  randomUUID: () => {
    mocks.uuidCounter.value += 1;
    return `00000000-0000-4000-8000-${String(mocks.uuidCounter.value).padStart(12, '0')}`;
  },
}));

vi.mock('../../apps/mobile/src/guidance/today-guidance-service', () => ({
  generateTodayGuidance: mocks.generate,
}));

vi.mock('../../apps/mobile/src/guidance/recommendation-run-api', () => ({
  recordRecommendationRun: mocks.recordRun,
}));

// The execution surface mounts beside a ready plan but records nothing until
// an explicit start tap. Mocking the boundary keeps these preflight tests
// hermetic; execution behavior is proven in protocol-execution.test.tsx.
// The restore aggregate resolves null here so every test starts from the
// normal idle journey; recovery itself is proven in today-restore.test.tsx.
vi.mock('../../apps/mobile/src/guidance/protocol-execution-api', () => ({
  startProtocolExecution: mocks.executionStart,
  transitionProtocolExecution: mocks.executionTransition,
  getActiveProtocolExecution: mocks.executionGetActive,
  getActiveExecutionWithDecision: mocks.restoreAggregate,
}));

// The substitute picker reads the shelf through shelf-api; mocking it keeps
// the client (and its native modules) out of these preflight tests.
vi.mock('../../apps/mobile/src/shelf-api', () => ({
  listUserProducts: vi.fn(async () => ({ items: [], nextCursor: null })),
  getUserProduct: vi.fn(async () => null),
}));

const OWNER = 'owner-1';

function readyDecision(overrides: Partial<ProtocolDecision> = {}): ProtocolDecision {
  return {
    status: 'ready',
    requestId: 'request-1',
    confidence: 'moderate',
    noPurchaseNeeded: true,
    steps: [
      {
        stepId: 'step-1',
        position: 1,
        action: 'apply',
        productId: 'owner-product-1',
        productVersionId: 'version-1',
        toolId: null,
        toolVersionId: null,
        waitSeconds: null,
        rinse: null,
        reasons: ["rule-wash@1 requires 'mild-cleanse'"],
      },
      {
        stepId: 'step-2',
        position: 2,
        action: 'rinse',
        productId: null,
        productVersionId: null,
        toolId: null,
        toolVersionId: null,
        waitSeconds: null,
        rinse: true,
        reasons: ['rule-rinse@1 requires rinsing'],
      },
    ],
    omissions: ['Omitted Synthetic conditioner (owner-product-2): capability not verified'],
    alternatives: ['Alternative: Synthetic balm (owner-product-3)'],
    missingInputs: [],
    audit: {
      requestId: 'request-1',
      engineVersion: '1',
      evaluatedRules: [
        {
          ruleId: 'rule-wash',
          versionId: '1',
          outcome: 'applied',
          reason: 'Reviewed reason.',
          evidenceIds: ['evidence-1'],
        },
      ],
      conflicts: [],
      rankedCandidates: [],
      rejectedCandidates: [],
      restrictions: [],
      missingInputs: [],
    },
    ...overrides,
  };
}

function readyResult(overrides: Record<string, unknown> = {}) {
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
      historyFacts: {
        activityKind: 'wash',
        precision: 'exact_day',
        status: 'active',
      },
      environmentFacts: {},
      products: [],
      tools: [],
      rules: [],
    },
    ...overrides,
  };
}

const GAP: GuidanceGap = {
  kind: 'hair_profile',
  detail: "My Hair is missing 'naturalPattern', which this goal needs before reviewed guidance can be produced.",
  subject: 'naturalPattern',
  state: 'missing',
  destination: 'my_hair',
};

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

async function render(ownerId: string = OWNER, onNavigate: () => void = vi.fn()): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(TodayGuidance, { ownerId, onNavigate: onNavigate as never }),
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

/**
 * Drives the check-in form through to the ready-to-generate summary.
 *
 * The form may already be open: a check-in that survived a trip to another
 * screen is restored when the owner comes back, and its answers are already
 * ticked. The helper therefore only presses what is not already there.
 */
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
    if (control.props.accessibilityState?.checked !== true) {
      await press(renderer, concern);
    }
  }
  const time = renderer.root.find(
    node => node.type === 'input' && node.props.accessibilityLabel === TIME_LABEL,
  );
  await act(async () => {
    time.props.onChangeText(minutes);
    await Promise.resolve();
  });
  await press(renderer, CHECK_IN_CONTINUE_LABEL);
}

/** Full preflight: check-in, then generate. */
async function generate(
  renderer: ReactTestRenderer,
  concerns: string[] = ['Dryness'],
  minutes: string = '20',
): Promise<void> {
  await completeCheckIn(renderer, concerns, minutes);
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
  clearAllCheckInDrafts();
  vi.clearAllMocks();
  mocks.uuidCounter.value = 0;
  mocks.generate.mockResolvedValue({ status: 'content_pending' });
  mocks.recordRun.mockResolvedValue({ requestId: 'request-1' });
  mocks.restoreAggregate.mockResolvedValue(null);
  mocks.executionGetActive.mockResolvedValue(null);
});

describe('today guidance states', () => {
  it('shows a loading state and disables Generate while generating', async () => {
    let release: (value: unknown) => void = () => undefined;
    mocks.generate.mockImplementation(
      () => new Promise(resolve => { release = resolve; }),
    );
    const renderer = await render();
    await completeCheckIn(renderer);
    expect(button(renderer, 'Generate my plan').props.accessibilityState.disabled).toBe(false);
    await act(async () => {
      button(renderer, 'Generate my plan').props.onPress();
      await Promise.resolve();
    });
    expect(text(renderer)).toContain('loading');
    expect(button(renderer, 'Working…').props.accessibilityState.disabled).toBe(true);
    await act(async () => { release({ status: 'content_pending' }); await Promise.resolve(); });
    expect(button(renderer, 'Start a new check-in').props.accessibilityState.disabled).toBe(false);
    await act(async () => { renderer.unmount(); });
  });

  it('does not generate anything until the user asks', async () => {
    const renderer = await render();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('shows the honest draft-content message and no protocol in production', async () => {
    const renderer = await render();
    await generate(renderer);
    expect(text(renderer)).toContain('reviewed guidance content is still being prepared');
    expect(text(renderer)).not.toContain('step 1');
    expect(text(renderer)).not.toContain('no purchase needed');
    await act(async () => { renderer.unmount(); });
  });

  it('links each setup gap to the destination that can fix it', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [GAP] });
    const onNavigate = vi.fn();
    const renderer = await render(OWNER, onNavigate);
    await generate(renderer);
    expect(text(renderer)).toContain('naturalpattern');
    expect(hasButton(renderer, 'Add this in My Hair')).toBe(true);
    await press(renderer, 'Add this in My Hair');
    expect(onNavigate).toHaveBeenCalledWith('my_hair');
    await act(async () => { renderer.unmount(); });
  });

  it('routes shelf, tool and service gaps to their own destinations', async () => {
    mocks.generate.mockResolvedValue({
      status: 'needs_setup',
      missing: [
        { kind: 'product_capability', detail: 'Shelf gap', subject: 'p1', state: 'unsupported', destination: 'my_shelf' },
        { kind: 'tool_capability', detail: 'Tool gap', subject: 't1', state: 'unsupported', destination: 'my_tools' },
        { kind: 'service_presence', detail: 'Service gap', subject: 's1', state: 'unknown', destination: 'my_hair_services' },
      ],
    });
    const onNavigate = vi.fn();
    const renderer = await render(OWNER, onNavigate);
    await generate(renderer);
    expect(hasButton(renderer, 'Review My Shelf')).toBe(true);
    expect(hasButton(renderer, 'Review My Tools')).toBe(true);
    await act(async () => { renderer.unmount(); });
  });

  it('follows each gap\'s own destination and says in a few words why it stops the plan', async () => {
    mocks.generate.mockResolvedValue({
      status: 'needs_setup',
      missing: [
        { kind: 'service_presence', detail: 'Service gap', subject: 's1', state: 'unsupported', destination: 'my_hair_services' },
        { kind: 'hair_profile', detail: 'Profile gap', subject: 'p', state: 'missing', destination: 'my_hair' },
        { kind: 'current_condition', detail: 'Check-in gap', subject: 'current.goal', state: 'contradictory', destination: 'today_check_in' },
      ],
    });
    const renderer = await render();
    await generate(renderer);
    const rendered = text(renderer);
    expect(rendered).toContain('not covered yet');
    expect(rendered).toContain('not answered yet');
    expect(rendered).toContain('these answers do not agree');
    expect(hasButton(renderer, 'Add this in My Hair')).toBe(true);
    expect(hasButton(renderer, 'Review check-in answers')).toBe(true);
    expect(hasButton(renderer, 'Review My Shelf')).toBe(false);
    await act(async () => { renderer.unmount(); });
  });

  it('names the areas that could not be read instead of one generic message', async () => {
    mocks.generate.mockResolvedValue({
      status: 'source_error',
      detail: 'Your records could not be read completely.',
      incompleteSources: [{ source: 'products', state: 'failed' }, { source: 'tools', state: 'truncated' }],
    });
    const renderer = await render();
    await generate(renderer);
    const rendered = text(renderer);
    expect(rendered).toContain('we could not read my shelf');
    expect(rendered).toContain('we could not read my tools');
    expect(hasButton(renderer, 'Try again')).toBe(true);
    await act(async () => { renderer.unmount(); });
  });

  it('keeps the generic message when no area is known', async () => {
    mocks.generate.mockResolvedValue({ status: 'source_error', detail: 'Your records could not be read completely.' });
    const renderer = await render();
    await generate(renderer);
    const rendered = text(renderer);
    // It says the read failed without naming an area it does not know, and
    // it still offers exactly one way forward.
    expect(rendered).toContain('we could not read your records');
    expect(rendered).not.toContain('my shelf');
    expect(rendered).not.toContain('my tools');
    expect(hasButton(renderer, 'Try again')).toBe(true);
    await act(async () => { renderer.unmount(); });
  });

  it('renders steps, reasons, confidence, evidence, omissions and alternatives', async () => {
    mocks.generate.mockResolvedValue(readyResult());
    const renderer = await render();
    await generate(renderer);
    const rendered = text(renderer);
    expect(rendered).toContain('step 1');
    expect(rendered).toContain('step 2');
    expect(rendered).toContain('rule-wash@1');
    expect(rendered).toContain('moderate');
    expect(rendered).toContain('evidence-1');
    expect(rendered).toContain('omitted synthetic conditioner');
    expect(rendered).toContain('alternative: synthetic balm');
    await act(async () => { renderer.unmount(); });
  });

  it('states no purchase needed only when the decision says so', async () => {
    mocks.generate.mockResolvedValue(readyResult());
    let renderer = await render();
    await generate(renderer);
    expect(text(renderer)).toContain('no purchase needed');
    await act(async () => { renderer.unmount(); });

    mocks.generate.mockResolvedValue(
      readyResult({ decision: readyDecision({ noPurchaseNeeded: false }) }),
    );
    renderer = await render();
    await generate(renderer);
    expect(text(renderer)).not.toContain('no purchase needed');
    await act(async () => { renderer.unmount(); });
  });

  it('keeps needs_input, rule_conflict and unsupported visibly distinct and never successful', async () => {
    for (const status of ['needs_input', 'rule_conflict', 'unsupported'] as const) {
      mocks.generate.mockResolvedValue(
        readyResult({
          status,
          decision: readyDecision({
            status,
            ...(status === 'needs_input' ? { missingInputs: ['profile.unrecorded'] } : {}),
          }),
        }),
      );
      const renderer = await render();
      await generate(renderer);
      const rendered = text(renderer);
      expect(rendered).not.toContain('your plan is ready');
      expect(rendered).toContain(status.replaceAll('_', ' '));
      if (status === 'needs_input') expect(rendered).toContain('profile.unrecorded');
      await act(async () => { renderer.unmount(); });
    }
  });

  it('offers Retry on a source error and keeps the selected goal', async () => {
    mocks.generate.mockResolvedValue({ status: 'source_error', detail: 'Could not read records.' });
    const renderer = await render();
    await generate(renderer);
    expect(text(renderer)).toContain('could not read records');
    expect(hasButton(renderer, 'Try again')).toBe(true);
    expect(text(renderer)).toContain('basic wash');
    mocks.generate.mockResolvedValue(readyResult());
    await press(renderer, 'Try again');
    expect(text(renderer)).toContain('step 1');
    await act(async () => { renderer.unmount(); });
  });

  it('never substitutes cached or generic advice when generation fails', async () => {
    mocks.generate.mockResolvedValue({ status: 'source_error', detail: 'Network unavailable.' });
    const renderer = await render();
    await generate(renderer);
    const rendered = text(renderer);
    expect(rendered).not.toContain('step 1');
    expect(rendered).not.toContain('try this instead');
    await act(async () => { renderer.unmount(); });
  });

  it('persists the decision exactly once after generating', async () => {
    mocks.generate.mockResolvedValue(readyResult());
    const renderer = await render();
    await generate(renderer);
    expect(mocks.recordRun).toHaveBeenCalledTimes(1);
    const command = mocks.recordRun.mock.calls[0][0];
    expect(command.status).toBe('ready');
    expect(command.bundleId).toBe('bundle-synthetic');
    expect(command.inputFingerprint).toBe('a'.repeat(64));
    expect(command.input).toEqual(readyResult().input);
    expect(command.input.historyFacts).toEqual({
      activityKind: 'wash',
      precision: 'exact_day',
      status: 'active',
    });
    expect(JSON.stringify(command.input)).not.toMatch(/notes|zones|correctionReason|voidReason/i);
    await act(async () => { renderer.unmount(); });
  });

  it('never sends the prepared input, owner item names or tool facts to the persistence call', async () => {
    mocks.generate.mockResolvedValue(readyResult({
      prepared: { schemaVersion: 1, products: [{ name: 'Synthetic owner-entered name' }], tools: [{ ownerFacts: { wattageWatts: 1800 } }] },
    }));
    const renderer = await render();
    await generate(renderer);
    const sent = JSON.stringify(mocks.recordRun.mock.calls[0][0]);
    expect(sent).not.toMatch(/prepared|ownerFacts|zoneConcerns|Synthetic owner-entered name|wattage/);
    await act(async () => { renderer.unmount(); });
  });

  it('does not persist a plan that was never generated', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [GAP] });
    const renderer = await render();
    await generate(renderer);
    expect(mocks.recordRun).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('shows a save failure without regenerating or hiding the plan', async () => {
    mocks.generate.mockResolvedValue(readyResult());
    mocks.recordRun.mockRejectedValue(new Error('run-conflict'));
    const renderer = await render();
    await generate(renderer);
    expect(text(renderer)).toContain('plan created, audit save failed');
    expect(text(renderer)).toContain('step 1');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.recordRun).toHaveBeenCalledTimes(1);
    await act(async () => { renderer.unmount(); });
  });

  it('ignores a late response from a superseded request', async () => {
    // First Generate is slow and returns a ready result for a stale bundle;
    // the owner change supersedes it before it lands.
    mocks.generate.mockImplementation(
      () => new Promise(resolve => { setTimeout(() => resolve(readyResult({ bundleId: 'stale-bundle' })), 25); }),
    );
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(TodayGuidance, { ownerId: OWNER, onNavigate: vi.fn() }));
      await Promise.resolve();
    });
    await completeCheckIn(renderer);
    await act(async () => {
      button(renderer, 'Generate my plan').props.onPress();
      await Promise.resolve();
    });
    mocks.generate.mockResolvedValue({ status: 'content_pending' });
    await act(async () => {
      renderer.update(createElement(TodayGuidance, { key: 'owner-2', ownerId: 'owner-2', onNavigate: vi.fn() }));
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      await Promise.resolve();
    });
    expect(text(renderer)).not.toContain('stale-bundle');
    expect(mocks.recordRun).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('ignores a response that arrives after unmount', async () => {
    let resolveGenerate!: (value: ReturnType<typeof readyResult>) => void;
    mocks.generate.mockImplementation(
      () => new Promise(resolve => { resolveGenerate = resolve; }),
    );
    const renderer = await render();
    await completeCheckIn(renderer);
    await act(async () => {
      button(renderer, 'Generate my plan').props.onPress();
      await Promise.resolve();
    });
    await act(async () => { renderer.unmount(); });
    await act(async () => {
      resolveGenerate(readyResult());
      await Promise.resolve();
    });
    expect(mocks.recordRun).not.toHaveBeenCalled();
  });

  it('clears the previous owner result when the owner changes', async () => {
    mocks.generate.mockResolvedValue(readyResult());
    let renderer!: ReactTestRenderer;
    // The component is keyed by owner in records.tsx, so switching owners
    // remounts it and the previous owner's result cannot linger.
    const tree = (id: string) =>
      createElement(TodayGuidance, { key: id, ownerId: id, onNavigate: vi.fn() });
    await act(async () => {
      renderer = create(tree(OWNER));
      await Promise.resolve();
    });
    await generate(renderer);
    expect(text(renderer)).toContain('step 1');
    await act(async () => {
      renderer.update(tree('owner-2'));
      await Promise.resolve();
    });
    expect(text(renderer)).not.toContain('step 1');
    await act(async () => { renderer.unmount(); });
  });

  it('labels controls for screen readers and meets minimum target size', async () => {
    const renderer = await render();
    await press(renderer, CHECK_IN_START_LABEL);
    const dryness = button(renderer, 'Dryness');
    expect(dryness.props.accessibilityRole).toBe('checkbox');
    const style = dryness.props.style as Record<string, unknown>[];
    const base = style[0] as { minHeight?: number };
    expect(base.minHeight).toBeGreaterThanOrEqual(44);
    await act(async () => { renderer.unmount(); });
  });
});

describe('task 6 integration: honest states without purchase pressure', () => {
  function labeled(renderer: ReactTestRenderer, label: string) {
    return renderer.root.find(
      node => node.type === 'span' && node.props.accessibilityLabel === label,
    );
  }

  function hasLabeled(renderer: ReactTestRenderer, label: string): boolean {
    return (
      renderer.root.findAll(
        node => node.type === 'span' && node.props.accessibilityLabel === label,
      ).length > 0
    );
  }

  function unsupportedResult() {
    return readyResult({
      status: 'unsupported',
      decision: readyDecision({
        status: 'unsupported',
        noPurchaseNeeded: null,
        steps: [],
        omissions: [
          "No verified available candidate provides required capability 'condition'",
        ],
        alternatives: [],
      }),
    });
  }

  it('states what is missing when no reviewed combination is available', async () => {
    mocks.generate.mockResolvedValue(unsupportedResult());
    const renderer = await render();
    await generate(renderer);
    const rendered = text(renderer);
    expect(rendered).toContain('no verified available candidate');
    expect(rendered).toContain('condition');
    expect(hasLabeled(renderer, 'What is missing')).toBe(true);
    expect(rendered).not.toContain('no purchase needed');
    await act(async () => { renderer.unmount(); });
  });

  it('labels every new state and control for screen readers', async () => {
    mocks.generate.mockResolvedValue(readyResult());
    let renderer = await render();
    await generate(renderer);
    expect(labeled(renderer, 'Your plan is ready').props.accessibilityRole).toBe('header');
    expect(hasLabeled(renderer, 'No purchase needed — what you own can do this.')).toBe(true);
    await act(async () => { renderer.unmount(); });

    mocks.generate.mockResolvedValue(unsupportedResult());
    renderer = await render();
    await generate(renderer);
    expect(hasLabeled(renderer, 'What is missing')).toBe(true);
    expect(
      hasLabeled(
        renderer,
        "No verified available candidate provides required capability 'condition'",
      ),
    ).toBe(true);
    await act(async () => { renderer.unmount(); });

    mocks.generate.mockResolvedValue({ status: 'source_error', detail: 'Could not read records.' });
    renderer = await render();
    await generate(renderer);
    expect(hasButton(renderer, 'Try again')).toBe(true);
    await act(async () => { renderer.unmount(); });
  });

  it('carries no purchase pressure, retailer direction or outcome promise', async () => {
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
      /toxic/i,
      /checkout/i,
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
    expect(strings.length).toBeGreaterThan(0);
    expect(copy.NO_PURCHASE_NEEDED).toBe('No purchase needed — what you own can do this.');
    for (const candidate of strings) {
      for (const pattern of banned) {
        expect(candidate).not.toMatch(pattern);
      }
    }
    for (const status of ['needs_input', 'rule_conflict', 'unsupported'] as const) {
      const title = copy.statusTitle({ status } as never);
      for (const pattern of banned) {
        expect(title).not.toMatch(pattern);
      }
    }

    mocks.generate.mockResolvedValue(unsupportedResult());
    const renderer = await render();
    await generate(renderer);
    const rendered = text(renderer);
    for (const pattern of banned) {
      expect(rendered).not.toMatch(pattern);
    }
    await act(async () => { renderer.unmount(); });
  });
});

describe('task 5 preflight: condition-aware generation', () => {
  it('opens on a check-in start and never generates on mount or on owner change', async () => {
    const renderer = await render();
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(hasButton(renderer, 'Generate my plan')).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
    await act(async () => {
      renderer.update(createElement(TodayGuidance, { ownerId: 'owner-2', onNavigate: vi.fn() }));
      await Promise.resolve();
    });
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(mocks.generate).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('passes the exact normalized check-in with an explicit reference time', async () => {
    const renderer = await render();
    // Tapped frizz-first: normalization must still sort concerns.
    await generate(renderer, ['Frizz', 'Dryness'], '20');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    const request = mocks.generate.mock.calls[0][0];
    expect(request.ownerId).toBe(OWNER);
    expect(request.goalId).toBe('basic_wash');
    expect(request.now).toBe(request.asOf);
    const expected = normalizeCurrentCondition(
      {
        observedAt: (request.currentCondition as { observedAt: string }).observedAt,
        concerns: ['frizz', 'dryness'],
        goal: 'basic_wash',
        availableMinutes: 20,
      },
      new Date(request.asOf),
    );
    expect(request.currentCondition).toEqual(expected);
    expect(request.currentCondition.concerns).toEqual(['dryness', 'frizz']);
    expect(request.currentCondition).not.toHaveProperty('saveToPassport');
    expect(Object.isFrozen(request.currentCondition)).toBe(true);
    await act(async () => { renderer.unmount(); });
  });

  it('generates only once for duplicate taps on Generate', async () => {
    let release: (value: unknown) => void = () => undefined;
    mocks.generate.mockImplementation(
      () => new Promise(resolve => { release = resolve; }),
    );
    const renderer = await render();
    await completeCheckIn(renderer);
    await act(async () => {
      const generateButton = button(renderer, 'Generate my plan');
      generateButton.props.onPress();
      generateButton.props.onPress();
      await Promise.resolve();
    });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    await act(async () => { release({ status: 'content_pending' }); await Promise.resolve(); });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    await act(async () => { renderer.unmount(); });
  });

  it('discards a late response when the owner changes without a remount', async () => {
    mocks.generate.mockImplementation(
      () => new Promise(resolve => { setTimeout(() => resolve(readyResult()), 25); }),
    );
    const renderer = await render();
    await completeCheckIn(renderer);
    await act(async () => {
      button(renderer, 'Generate my plan').props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.update(createElement(TodayGuidance, { ownerId: 'owner-2', onNavigate: vi.fn() }));
      await Promise.resolve();
    });
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      await Promise.resolve();
    });
    expect(mocks.recordRun).not.toHaveBeenCalled();
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    await act(async () => { renderer.unmount(); });
  });

  it('clears an in-progress check-in when the owner changes', async () => {
    const renderer = await render();
    await press(renderer, CHECK_IN_START_LABEL);
    await press(renderer, 'Dryness');
    expect(
      button(renderer, 'Dryness').props.accessibilityState,
    ).toMatchObject({ checked: true });
    await act(async () => {
      renderer.update(createElement(TodayGuidance, { ownerId: 'owner-2', onNavigate: vi.fn() }));
      await Promise.resolve();
    });
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(hasButton(renderer, 'Dryness')).toBe(false);
    await act(async () => { renderer.unmount(); });
  });

  it('shows the completed check-in beside pending content with no invented advice', async () => {
    const renderer = await render();
    await generate(renderer, ['Dryness'], '20');
    const rendered = text(renderer);
    expect(hasLabeledPreflight(renderer, CHECK_IN_SUMMARY_HEADING)).toBe(true);
    expect(rendered).toContain('dryness');
    expect(rendered).toContain('20 minutes available');
    expect(rendered).toContain('reviewed guidance content is still being prepared');
    expect(rendered).not.toContain('step 1');
    expect(rendered).not.toContain('no purchase needed');
    await act(async () => { renderer.unmount(); });
  });

  it('returns check-in validation failures to the form with its draft intact', async () => {
    const renderer = await render();
    await press(renderer, CHECK_IN_START_LABEL);
    await press(renderer, 'Dryness');
    await press(renderer, CHECK_IN_CONTINUE_LABEL);
    expect(text(renderer)).toContain('time you have available');
    expect(
      button(renderer, 'Dryness').props.accessibilityState,
    ).toMatchObject({ checked: true });
    await act(async () => { renderer.unmount(); });
  });

  it('loops a current-condition gap back to the check-in with the draft intact', async () => {
    mocks.generate.mockResolvedValue({
      status: 'needs_setup',
      missing: [
        {
          kind: 'current_condition',
          detail: 'You chose "I am not sure". Pick what you notice today.',
          subject: 'current.concerns',
          state: 'unknown',
          destination: 'today_check_in',
        },
      ],
    });
    const renderer = await render();
    await generate(renderer, ['Dryness'], '20');
    expect(hasButton(renderer, 'Review check-in answers')).toBe(true);
    expect(hasButton(renderer, 'Add this in My Hair')).toBe(false);
    await press(renderer, 'Review check-in answers');
    expect(
      button(renderer, 'Dryness').props.accessibilityState,
    ).toMatchObject({ checked: true });
    await act(async () => { renderer.unmount(); });
  });

  it('retries a source error with the same normalized check-in', async () => {
    mocks.generate.mockResolvedValue({ status: 'source_error', detail: 'Could not read records.' });
    const renderer = await render();
    await generate(renderer, ['Frizz'], '30');
    const first = mocks.generate.mock.calls[0][0].currentCondition;
    await press(renderer, 'Try again');
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[1][0].currentCondition).toEqual(first);
    await act(async () => { renderer.unmount(); });
  });

  it('starts over from a result without carrying the previous check-in', async () => {
    const renderer = await render();
    await generate(renderer, ['Dryness'], '20');
    expect(hasButton(renderer, START_OVER_LABEL)).toBe(true);
    await press(renderer, START_OVER_LABEL);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(hasButton(renderer, 'Generate my plan')).toBe(false);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    await act(async () => { renderer.unmount(); });
  });

  function hasLabeledPreflight(renderer: ReactTestRenderer, label: string): boolean {
    return (
      renderer.root.findAll(
        node => node.type === 'span' && node.props.accessibilityLabel === label,
      ).length > 0
    );
  }
});
