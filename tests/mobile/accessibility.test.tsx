import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolPreviewModel } from '../../apps/mobile/src/guidance/protocol-preview-model';
import { ProtocolPreview } from '../../apps/mobile/src/ProtocolPreview';
import { buildProtocolPreview } from '../../apps/mobile/src/guidance/protocol-preview-model';
import { colors, styles } from '../../apps/mobile/src/ui';
import { focusOn } from '../../apps/mobile/src/focus';

vi.mock('../../apps/mobile/src/focus', () => ({
  focusOn: vi.fn(),
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
    View: host('div'),
  };
});

const REGISTRY_ID = 'basic-wash-evidence';
const REGISTRY_VERSION = '1';

function evidenceRegistry(): Record<string, unknown> {
  return {
    registryId: REGISTRY_ID,
    version: REGISTRY_VERSION,
    records: [
      {
        evidenceId: 'evidence-1',
        sourceType: 'manufacturer',
        trustTier: 'T5',
        title: 'Manufacturer directions',
        sourceUrl: 'https://example.com/za/shampoo-directions',
        archivedUrl: null,
        publisher: 'Garnier South Africa',
        market: 'ZA',
        versionIds: ['version-1'],
        claim: 'Apply as usual.',
        limitations: 'Web-only.',
        checkedAt: '2026-10-10T00:00:00+02:00',
        authoredBy: 'author-1',
        reviewedAt: '2026-10-10T00:00:00+02:00',
        reviewedBy: 'reviewer-1',
        status: 'reviewed',
      },
    ],
  };
}

function capabilityEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'product',
    versionId: 'version-1',
    displayName: 'Garnier shampoo',
    verifiedCapabilities: ['cleanse'],
    evidenceIds: ['evidence-1'],
    status: 'published',
    reviewedAt: '2026-10-10T00:00:00+02:00',
    reviewedBy: 'reviewer-1',
    authoredBy: 'author-1',
    ...overrides,
  };
}

function publishedBundle(): Record<string, unknown> {
  return {
    bundleId: 'today-core-guidance',
    version: '2',
    status: 'published',
    reviewedAt: '2026-10-10T00:00:00.000Z',
    reviewedBy: 'reviewer-1',
    authoredBy: 'author-1',
    evidenceRegistryId: REGISTRY_ID,
    evidenceRegistryVersion: REGISTRY_VERSION,
    goals: [{ id: 'basic_wash', label: 'Basic wash', requiredProfileFacts: ['pattern'] }],
    capabilities: [capabilityEntry()],
    rules: [],
  };
}

function context(): Record<string, unknown> {
  return {
    requestId: 'request-1',
    asOf: '2026-10-11T09:00:00.000Z',
    goal: 'basic_wash',
    profileFacts: {},
    products: [
      {
        productId: 'product-1',
        versionId: 'version-1',
        name: 'Garnier shampoo',
        owned: true,
        available: true,
        verifiedCapabilities: ['cleanse'],
        unknownCapabilities: [],
      },
    ],
    tools: [],
    historyFacts: {},
    environmentFacts: {},
    rules: [],
  };
}

function readyDecision(): Record<string, unknown> {
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
        productId: 'product-1',
        productVersionId: 'version-1',
        toolId: null,
        toolVersionId: null,
        waitSeconds: null,
        rinse: null,
        reasons: [],
      },
    ],
    omissions: [],
    alternatives: [],
    missingInputs: [],
    audit: {
      requestId: 'request-1',
      engineVersion: '1',
      evaluatedRules: [{ ruleId: 'rule-a', versionId: '1', outcome: 'applied', reason: 'ok', evidenceIds: ['evidence-1'] }],
      conflicts: [],
      rankedCandidates: [],
      rejectedCandidates: [],
      restrictions: [],
      missingInputs: [],
    },
  };
}

function readyModel(): ProtocolPreviewModel {
  return buildProtocolPreview({
    decision: readyDecision() as never,
    context: context() as never,
    bundle: publishedBundle() as never,
    evidenceRegistry: evidenceRegistry() as never,
  });
}

async function render(model: ProtocolPreviewModel): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(ProtocolPreview, { model, onStart: vi.fn() }));
  });
  return renderer;
}

/** Relative luminance of an sRGB hex color (WCAG). */
function luminance(hex: string): number {
  const rgb = hex
    .replace('#', '')
    .match(/../g)!
    .map(part => parseInt(part, 16) / 255);
  const linear = rgb.map(channel =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string): number {
  const l1 = luminance(foreground);
  const l2 = luminance(background);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('accessibility', () => {
  it('reaches at least 4.5:1 text contrast against the card background', () => {
    expect(contrast(colors.ink, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.quiet, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.error, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('uses graphical contrast of at least 3:1 for interactive controls', () => {
    // Button text on button fill, and the selected state, must be clearly distinct.
    expect(contrast(colors.white, colors.ink)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.white, colors.accent)).toBeGreaterThanOrEqual(3);
  });

  it('keeps controls at least 44x44', () => {
    expect(styles.button.minHeight).toBeGreaterThanOrEqual(44);
    expect(styles.button.minWidth).toBeGreaterThanOrEqual(44);
    expect(styles.pill.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('uses scalable text with no fixed line height', () => {
    for (const style of [styles.title, styles.subtitle, styles.body, styles.label]) {
      expect(style.lineHeight).toBeUndefined();
    }
  });

  it('renders exactly one header so the page has one clear heading', async () => {
    const model = readyModel();
    const renderer = await render(model);
    const rendered = JSON.stringify(renderer.toJSON()).toLowerCase();
    expect((rendered.match(/accessibilityrole":"header"/g) ?? []).length).toBe(1);
    await act(async () => { renderer.unmount(); });
  });

  it('moves focus to the Start button once a ready preview is generated', async () => {
    const model = readyModel();
    await render(model);
    expect(focusOn).toHaveBeenCalled();
  });

  it('does not move focus when the preview is not ready', async () => {
    const model = buildProtocolPreview({
      decision: { ...readyDecision(), status: 'content_pending' } as never,
      context: context() as never,
      bundle: publishedBundle() as never,
      evidenceRegistry: evidenceRegistry() as never,
    });
    await render(model);
    expect(focusOn).not.toHaveBeenCalled();
  });
});
