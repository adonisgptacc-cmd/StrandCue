import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GuidanceGap, ProtocolDecision } from '../../packages/domain/src/index';
import { TodayGuidance } from '../../apps/mobile/src/TodayGuidance';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  recordRun: vi.fn(),
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

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(TodayGuidance, { ownerId: OWNER, onNavigate: vi.fn() }),
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
  mocks.uuidCounter.value = 0;
  mocks.generate.mockResolvedValue({ status: 'content_pending' });
  mocks.recordRun.mockResolvedValue({ requestId: 'request-1' });
});

describe('today guidance states', () => {
  it('shows a loading state and disables Generate while generating', async () => {
    let release: (value: unknown) => void = () => undefined;
    mocks.generate.mockImplementation(
      () => new Promise(resolve => { release = resolve; }),
    );
    const renderer = await render();
    expect(button(renderer, 'Generate my plan').props.accessibilityState.disabled).toBe(false);
    await act(async () => {
      button(renderer, 'Generate my plan').props.onPress();
      await Promise.resolve();
    });
    expect(text(renderer)).toContain('loading');
    expect(button(renderer, 'Working…').props.accessibilityState.disabled).toBe(true);
    await act(async () => { release({ status: 'content_pending' }); await Promise.resolve(); });
    expect(button(renderer, 'Generate my plan').props.accessibilityState.disabled).toBe(false);
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
    await press(renderer, 'Generate my plan');
    expect(text(renderer)).toContain('reviewed guidance content is still being prepared');
    expect(text(renderer)).not.toContain('step 1');
    expect(text(renderer)).not.toContain('no purchase needed');
    await act(async () => { renderer.unmount(); });
  });

  it('links each setup gap to the destination that can fix it', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [GAP] });
    const onNavigate = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(TodayGuidance, { ownerId: OWNER, onNavigate }));
      await Promise.resolve();
    });
    await press(renderer, 'Generate my plan');
    expect(text(renderer)).toContain('naturalpattern');
    expect(hasButton(renderer, 'Go to My Hair')).toBe(true);
    await press(renderer, 'Go to My Hair');
    expect(onNavigate).toHaveBeenCalledWith('my_hair');
    await act(async () => { renderer.unmount(); });
  });

  it('routes shelf, tool and service gaps to their own destinations', async () => {
    mocks.generate.mockResolvedValue({
      status: 'needs_setup',
      missing: [
        { kind: 'product_capability', detail: 'Shelf gap', subject: 'p1' },
        { kind: 'tool_capability', detail: 'Tool gap', subject: 't1' },
        { kind: 'service_presence', detail: 'Service gap', subject: 's1' },
      ],
    });
    const onNavigate = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(TodayGuidance, { ownerId: OWNER, onNavigate }));
      await Promise.resolve();
    });
    await press(renderer, 'Generate my plan');
    expect(hasButton(renderer, 'Go to My Shelf')).toBe(true);
    expect(hasButton(renderer, 'Go to My Tools')).toBe(true);
    await act(async () => { renderer.unmount(); });
  });

  it('renders steps, reasons, confidence, evidence, omissions and alternatives', async () => {
    mocks.generate.mockResolvedValue(readyResult());
    const renderer = await render();
    await press(renderer, 'Generate my plan');
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
    await press(renderer, 'Generate my plan');
    expect(text(renderer)).toContain('no purchase needed');
    await act(async () => { renderer.unmount(); });

    mocks.generate.mockResolvedValue(
      readyResult({ decision: readyDecision({ noPurchaseNeeded: false }) }),
    );
    renderer = await render();
    await press(renderer, 'Generate my plan');
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
      await press(renderer, 'Generate my plan');
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
    await press(renderer, 'Generate my plan');
    expect(text(renderer)).toContain('could not read records');
    expect(hasButton(renderer, 'Retry')).toBe(true);
    expect(text(renderer)).toContain('basic wash');
    mocks.generate.mockResolvedValue(readyResult());
    await press(renderer, 'Retry');
    expect(text(renderer)).toContain('step 1');
    await act(async () => { renderer.unmount(); });
  });

  it('never substitutes cached or generic advice when generation fails', async () => {
    mocks.generate.mockResolvedValue({ status: 'source_error', detail: 'Network unavailable.' });
    const renderer = await render();
    await press(renderer, 'Generate my plan');
    const rendered = text(renderer);
    expect(rendered).not.toContain('step 1');
    expect(rendered).not.toContain('try this instead');
    await act(async () => { renderer.unmount(); });
  });

  it('persists the decision exactly once after generating', async () => {
    mocks.generate.mockResolvedValue(readyResult());
    const renderer = await render();
    await press(renderer, 'Generate my plan');
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

  it('does not persist a plan that was never generated', async () => {
    mocks.generate.mockResolvedValue({ status: 'needs_setup', missing: [GAP] });
    const renderer = await render();
    await press(renderer, 'Generate my plan');
    expect(mocks.recordRun).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('shows a save failure without regenerating or hiding the plan', async () => {
    mocks.generate.mockResolvedValue(readyResult());
    mocks.recordRun.mockRejectedValue(new Error('run-conflict'));
    const renderer = await render();
    await press(renderer, 'Generate my plan');
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
    await press(renderer, 'Generate my plan');
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
    await press(renderer, 'Generate my plan');
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
    await press(renderer, 'Generate my plan');
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
    const generate = button(renderer, 'Generate my plan');
    expect(generate.props.accessibilityRole).toBe('button');
    expect(generate.props.accessibilityLabel).toBe('Generate my plan');
    const style = generate.props.style as Record<string, unknown>[];
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
    await press(renderer, 'Generate my plan');
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
    await press(renderer, 'Generate my plan');
    expect(labeled(renderer, 'Your plan is ready').props.accessibilityRole).toBe('header');
    expect(hasLabeled(renderer, 'No purchase needed — what you own can do this.')).toBe(true);
    await act(async () => { renderer.unmount(); });

    mocks.generate.mockResolvedValue(unsupportedResult());
    renderer = await render();
    await press(renderer, 'Generate my plan');
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
    await press(renderer, 'Generate my plan');
    expect(hasButton(renderer, 'Retry')).toBe(true);
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
    await press(renderer, 'Generate my plan');
    const rendered = text(renderer);
    for (const pattern of banned) {
      expect(rendered).not.toMatch(pattern);
    }
    await act(async () => { renderer.unmount(); });
  });
});
