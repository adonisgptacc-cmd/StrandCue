import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ProtocolPreview } from '../../apps/mobile/src/ProtocolPreview';
import { buildProtocolPreview, type ProtocolPreviewInput, type ProtocolPreviewModel } from '../../apps/mobile/src/guidance/protocol-preview-model';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

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

function evidenceRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    evidenceId: 'evidence-1',
    sourceType: 'manufacturer',
    trustTier: 'T5',
    title: 'Manufacturer directions for the exact shampoo version',
    sourceUrl: 'https://example.com/za/shampoo-directions',
    archivedUrl: null,
    publisher: 'Garnier South Africa',
    market: 'ZA',
    versionIds: ['version-1'],
    claim: 'Apply as usual, lather, rinse thoroughly.',
    limitations: 'Web-only; packaging is authoritative.',
    checkedAt: '2026-10-10T00:00:00+02:00',
    authoredBy: 'author-1',
    reviewedAt: '2026-10-10T00:00:00+02:00',
    reviewedBy: 'reviewer-1',
    status: 'reviewed',
    ...overrides,
  };
}

function evidenceRegistry(): Record<string, unknown> {
  return { registryId: REGISTRY_ID, version: REGISTRY_VERSION, records: [evidenceRecord()] };
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

function publishedBundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    ...overrides,
  };
}

function context(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    ...overrides,
  };
}

function readyDecision(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
        reasons: ["rule-wash@1 requires 'cleanse'"],
      },
      {
        stepId: 'step-2',
        position: 2,
        action: 'wait',
        productId: null,
        productVersionId: null,
        toolId: null,
        toolVersionId: null,
        waitSeconds: 60,
        rinse: null,
        reasons: ['rule-wait@1 requires a 60s wait'],
      },
      {
        stepId: 'step-3',
        position: 3,
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
    omissions: [],
    alternatives: [],
    missingInputs: [],
    audit: {
      requestId: 'request-1',
      engineVersion: '1',
      evaluatedRules: [
        { ruleId: 'rule-a', versionId: '1', outcome: 'applied', reason: 'ok', evidenceIds: ['evidence-1'] },
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

function readyModel(overrides: Record<string, unknown> = {}): ProtocolPreviewModel {
  return buildProtocolPreview({
    decision: readyDecision(),
    context: context(),
    bundle: publishedBundle(),
    evidenceRegistry: evidenceRegistry(),
    ...(overrides as Partial<ProtocolPreviewInput>),
  } as unknown as ProtocolPreviewInput);
}

async function render(model: ProtocolPreviewModel): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(ProtocolPreview, { model, onStart: vi.fn() }));
  });
  return renderer;
}

function text(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON()).toLowerCase();
}

function headerCount(renderer: ReactTestRenderer): number {
  return (text(renderer).match(/accessibilityrole":"header"/g) ?? []).length;
}

function hasButton(renderer: ReactTestRenderer, label: string): boolean {
  return (
    renderer.root.findAll(
      node => node.type === 'button' && node.props.accessibilityLabel === label,
    ).length > 0
  );
}

describe('ProtocolPreview', () => {
  it('shows the route summary, owned items, ordered steps and no purchase copy for a ready plan', async () => {
    const model = readyModel();
    expect(model.status).toBe('ready');
    const renderer = await render(model);
    const rendered = text(renderer);
    expect(rendered).toContain('what your plan will do');
    expect(rendered).toContain('basic wash');
    expect(rendered).toContain('products and tools this plan uses');
    expect(rendered).toContain('garnier shampoo');
    expect(rendered).toContain('available');
    expect(rendered).toContain('step 1');
    expect(rendered).toContain('step 2');
    expect(rendered).toContain('step 3');
    expect(rendered).toContain('use garnier shampoo.');
    expect(rendered).toContain('wait 60 seconds.');
    expect(rendered).toContain('rinse it out.');
    expect(rendered).toContain('moderate confidence');
    expect(rendered).toContain('reviewed evidence supports each rule in this plan.');
    expect(rendered).toContain('no purchase needed — what you own can do this.');
    expect(hasButton(renderer, 'Start this plan')).toBe(true);
    await act(async () => { renderer.unmount(); });
  });

  it('shows eligible alternatives and honest limitations', async () => {
    const model = readyModel({
      context: context({
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
          {
            productId: 'product-2',
            versionId: 'version-2',
            name: 'Synthetic balm',
            owned: true,
            available: true,
            verifiedCapabilities: ['cleanse'],
            unknownCapabilities: [],
          },
        ],
      }),
      bundle: publishedBundle({
        capabilities: [capabilityEntry(), capabilityEntry({ versionId: 'version-2' })],
      }),
    });
    expect(model.status).toBe('ready');
    const renderer = await render(model);
    const rendered = text(renderer);
    expect(rendered).toContain('eligible alternatives');
    expect(rendered).toContain('synthetic balm');
    expect(rendered).toContain('things to know');
    expect(rendered).toContain('cosmetic hair care only');
    await act(async () => { renderer.unmount(); });
  });

  it('shows a confidence limitation when confidence is limited', async () => {
    const model = readyModel({
      decision: readyDecision({ confidence: 'limited' }) as never,
    });
    expect(model.status).toBe('ready');
    const renderer = await render(model);
    const rendered = text(renderer);
    expect(rendered).toContain('limited confidence');
    expect(rendered).toContain('best-fit plan');
    await act(async () => { renderer.unmount(); });
  });

  it('does not offer Start and shows an explanation when content is pending', async () => {
    const model = buildProtocolPreview({
      decision: { ...readyDecision(), status: 'content_pending' },
      context: context(),
      bundle: publishedBundle({ status: 'draft' }),
      evidenceRegistry: evidenceRegistry(),
    } as unknown as ProtocolPreviewInput);
    expect(model.status).toBe('content_pending');
    const renderer = await render(model);
    const rendered = text(renderer);
    expect(rendered).toContain('reviewed guidance is not available yet');
    expect(hasButton(renderer, 'Start this plan')).toBe(false);
    await act(async () => { renderer.unmount(); });
  });

  it('does not offer Start when a binding cannot be verified', async () => {
    const model = buildProtocolPreview({
      decision: readyDecision({
        steps: [
          {
            stepId: 'step-1',
            position: 1,
            action: 'apply',
            productId: 'product-1',
            productVersionId: 'version-9',
            toolId: null,
            toolVersionId: null,
            waitSeconds: null,
            rinse: null,
            reasons: [],
          },
        ],
      }),
      context: context(),
      bundle: publishedBundle(),
      evidenceRegistry: evidenceRegistry(),
    } as unknown as ProtocolPreviewInput);
    expect(model.status).toBe('unavailable');
    const renderer = await render(model);
    const rendered = text(renderer);
    expect(rendered).toContain('this plan cannot be verified');
    expect(hasButton(renderer, 'Start this plan')).toBe(false);
    await act(async () => { renderer.unmount(); });
  });

  it('renders one header and no raw engine internals in visible text', async () => {
    const model = readyModel();
    const renderer = await render(model);
    expect(headerCount(renderer)).toBe(1);
    const rendered = text(renderer);
    for (const token of [
      'rule-', 'evidence-', 'product-1', 'version-1', 'step-1', 'request-1', 'reviewer-1', 'author-1',
      'https://', 'rule-wash@1', 'rule-wait@1',
    ]) {
      expect(rendered).not.toContain(token);
    }
    await act(async () => { renderer.unmount(); });
  });
});
