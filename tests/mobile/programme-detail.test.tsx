import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgrammeDetail } from '../../apps/mobile/src/ProgrammeDetail.tsx';
import { createProgrammeController } from '../../apps/mobile/src/programme-state.ts';
import {
  PROGRAMME_DUE_LABELS,
  PROGRAMME_EVENT_KIND_LABELS,
  PROGRAMME_STATE_LABELS,
  PROGRAMME_UNIT_LABELS,
} from '../../apps/mobile/src/programme-copy.ts';
import {
  REVIEWED_SEED,
  createFakeProgrammeServer,
  reviewedRuleSeed,
  type ProgrammeServerSeed,
} from './support/programme-fake-server.ts';
import { mount, press, typeInto, visibleText, withSetup } from './support/programme-harness.tsx';
vi.mock('react-native', async () => (await import('./support/rn-mock.ts')).rnMock);
vi.mock('expo-crypto', async () => (await import('./support/expo-crypto-mock.ts')).expoCryptoMock);
vi.mock('../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));

// The detail view reports scheduling facts only: the named unit, the reviewed
// range, the exact events used, what is missing and where to fix it. It never
// renders a raw enum key, an identifier or a technical field.

const START = '2026-09-01T08:00:00.000Z';
const OFFER = {
  productId: REVIEWED_SEED.productId,
  productVersionId: REVIEWED_SEED.productVersionId,
  ruleId: 'rule-fixture-1',
  ruleVersion: '1',
  label: 'Fixture treatment product',
};

const SHAMPOO_SEED: ProgrammeServerSeed = {
  ...REVIEWED_SEED,
  rules: [reviewedRuleSeed({ unit: 'shampoo-session' })],
};

withSetup(() => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function instance(seed: ProgrammeServerSeed = REVIEWED_SEED) {
    const server = createFakeProgrammeServer(seed);
    const controller = createProgrammeController({
      ownerKey: 'owner-a',
      api: server.api,
      newOperationId: () => '44444444-4444-4444-8444-444444444444',
      now: () => new Date('2026-09-20T10:00:00.000Z'),
    });
    return { server, controller };
  }

  async function detail(seed: ProgrammeServerSeed, overrides: Record<string, unknown> = {}) {
    const built = instance(seed);
    await built.controller.enrol({ offer: { ...OFFER, ...(overrides.offer ?? {}) }, startDate: { precision: 'exact', value: START } });
    await built.controller.loadList();
    await built.controller.openDetail(built.controller.getState().items[0]!.enrolmentId);
    return built;
  }

  const view = (controller: ReturnType<typeof instance>['controller'], onNavigate?: (destination: 'my_shelf' | 'journey_activities' | 'journey_routines') => void) =>
    mount({
      type: ProgrammeDetail as never,
      props: {
        detail: controller.getState().selected,
        blockedReason: controller.getState().blockedReason,
        saving: controller.getState().phase === 'saving',
        failure: controller.getState().failure,
        controller,
        onNavigate,
      },
    });

  describe('the treatment programme detail', () => {
    it('shows the state, due status, named unit, count and reviewed range', async () => {
      const { controller } = await detail(REVIEWED_SEED);
      const renderer = await view(controller);
      const text = visibleText(renderer);
      expect(text).toContain(PROGRAMME_STATE_LABELS.reassessment);
      expect(text).toContain(PROGRAMME_DUE_LABELS.eligible);
      expect(text).toContain(PROGRAMME_UNIT_LABELS.wash);
      expect(text).toContain('Washes so far: 3');
      expect(text).toContain('Between 2 and 4 washes');
    });

    it('keeps the range a range and never collapses it to one number', async () => {
      const { controller } = await detail(REVIEWED_SEED);
      const text = visibleText(await view(controller));
      expect(text).toContain('Between 2 and 4');
      expect(text).not.toMatch(/due in \d|exactly \d washes/);
    });

    it('shows shampoo sessions as a distinct named unit', async () => {
      const { controller } = await detail(SHAMPOO_SEED);
      const text = visibleText(await view(controller));
      expect(text).toContain(PROGRAMME_UNIT_LABELS['shampoo-session']);
      expect(text).not.toContain('Washes so far');
    });

    it('shows the exact events used, with the application identified separately', async () => {
      const { controller } = await detail(REVIEWED_SEED);
      const renderer = await view(controller);
      const text = visibleText(renderer);
      // One application plus three washes, each as an owner-friendly date only.
      expect(text).toContain(PROGRAMME_EVENT_KIND_LABELS.application);
      const washRows = renderer.root.findAll(node =>
        typeof node.type === 'string' && node.type === 'span' &&
        typeof node.props.children === 'string' && node.props.children.startsWith(`${PROGRAMME_EVENT_KIND_LABELS.wash} on`));
      expect(washRows).toHaveLength(3);
      expect(text).toMatch(/2 September 2026/);
      expect(text).toMatch(/5 September 2026/);
      // The counted events are recorded facts, distinct from the derived answer.
      expect(text).toContain('Counted from your recorded events');
    });

    it('states the as-of time explicitly and in owner-friendly wording', async () => {
      const { controller } = await detail(REVIEWED_SEED);
      const text = visibleText(await view(controller));
      expect(text).toContain('Read on');
      expect(text).toMatch(/\d{1,2} September 2026/);
      expect(text).not.toContain('2026-09');
    });

    it('names the missing fact and where to resolve it', async () => {
      const { controller } = await detail({ ...REVIEWED_SEED, care: [] });
      const text = visibleText(await view(controller));
      expect(text).toContain('What is missing');
      expect(text).toContain('Open Journey routine history from the main navigation');
      expect(text).not.toMatch(/missing-treatment-application|needs_input/);
    });

    it('routes a product problem to My Shelf', async () => {
      const { controller } = await detail({
        ...REVIEWED_SEED,
        unverified: true,
        rules: [reviewedRuleSeed()],
      });
      const text = visibleText(await view(controller));
      expect(text).toContain('Open My Shelf from the main navigation');
      expect(text).not.toContain('product-unverified');
      expect(text).not.toContain('Washes so far');
      expect(text).not.toContain('Between 2 and 4 washes');
      expect(text).not.toContain('Counted from your recorded events');
    });

    it('shows the completed snapshot label once the server closes the programme', async () => {
      const { controller } = await detail(REVIEWED_SEED);
      await press(await view(controller), 'Complete this programme');
      await press(await view(controller), 'Confirm: complete this programme');
      const renderer = await view(controller);
      const text = visibleText(renderer);
      expect(text).toContain('Completed');
      expect(text).toContain('Closed from the record at completion');
      expect(text).toContain(PROGRAMME_STATE_LABELS.completed);
      // The snapshot is the server's; nothing here is recomputed.
      expect(text).toContain('Between 2 and 4 washes');
    });

    it('never renders a raw enum key, rule id, digest or internal identifier', async () => {
      const { controller } = await detail(REVIEWED_SEED);
      const text = visibleText(await view(controller));
      for (const forbidden of ['not_started', 'initial', 'reassessment', 'maintenance', 'paused', 'completed',
        'not_due', 'eligible', 'due', 'needs_input', 'shampoo-session',
        'rule-fixture-1', 'artifact-fixture-1', 'execution-confirmed', 'activity-recorded',
        'rulePublication', 'contentDigest', 'ruleVersion', 'ruleId', 'snapshot:']) {
        expect(text, forbidden).not.toContain(forbidden);
      }
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(text).not.toMatch(/sha256/);
      expect(text).not.toMatch(/[0-9a-f]+:[0-9a-f-]+:[0-9]+:/i);
      expect(text).not.toMatch(/reasonCode/);
    });

    it('shows a paused programme honestly with the resumption requirement', async () => {
      const { controller } = await detail(REVIEWED_SEED);
      await press(await view(controller), 'Pause this programme');
      await press(await view(controller), 'Reason: I chose to pause');
      const text = visibleText(await view(controller));
      expect(text).toContain(PROGRAMME_STATE_LABELS.paused);
      expect(text).toContain('approved resumption');
      // No resume control: the committed contract never confirms one.
      expect(text).not.toContain('Resume this programme');
    });

    it('goes back to the list', async () => {
      const { controller } = await detail(REVIEWED_SEED);
      const renderer = await view(controller);
      await press(renderer, 'Back to treatment programmes');
      expect(controller.getState().selectedId).toBeNull();
      expect(controller.getState().phase).toBe('list-ready');
    });

    it('reloads the authoritative detail on request', async () => {
      const { server, controller } = await detail(REVIEWED_SEED);
      const renderer = await view(controller);
      await press(renderer, 'Reload this programme');
      expect(server.callsNamed('get_programme').length).toBeGreaterThan(1);
      expect(controller.getState().phase).toBe('detail-ready');
    });

    it('does not offer any guidance, recommendation or catalogue action', async () => {
      const { server, controller } = await detail(REVIEWED_SEED);
      await view(controller);
      expect(server.callsNamed('enrol_programme')).toHaveLength(1);
      expect(server.callsNamed('get_programme').length).toBeGreaterThan(0);
      // Opening and reading a programme performs no other write of any kind.
      const writes = server.calls.filter(call => !['enrol_programme', 'get_programme', 'list_programmes', 'change_programme'].includes(call.name));
      expect(writes).toEqual([]);
      expect(server.calls.filter(call => call.name === 'change_programme')).toHaveLength(0);
    });

    it('asks for a start date before enrolling from an offer', async () => {
      const { controller } = instance();
      const renderer = await mount({
        type: ProgrammeDetail as never,
        props: {
          detail: null,
          blockedReason: null,
          saving: false,
          failure: null,
          controller,
          offer: { ...OFFER, label: 'Fixture treatment product' },
        },
      });
      await typeInto(renderer, 'Programme start date (YYYY-MM-DD)', '2026-09-01');
      expect(visibleText(renderer)).toContain('Start this treatment programme');
      await press(renderer, 'Start this treatment programme');
      expect(controller.getState().selected).not.toBeNull();
    });

    it('shows a loading state when neither a detail nor an offer is available', async () => {
      const { controller } = instance();
      const renderer = await mount({
        type: ProgrammeDetail as never,
        props: { detail: null, blockedReason: null, saving: false, failure: null, controller },
      });
      expect(visibleText(renderer)).toContain('Loading this programme');
    });

    it('uses working recovery callbacks for missing routine and product facts', async () => {
      const routine = await detail({ ...REVIEWED_SEED, care: [] });
      const routineNavigate = vi.fn();
      const routineView = await view(routine.controller, routineNavigate);
      await press(routineView, 'Go to Journey routine history');
      expect(routineNavigate).toHaveBeenCalledWith('journey_routines');

      const product = await detail({ ...REVIEWED_SEED, unverified: true, rules: [reviewedRuleSeed()] });
      const productNavigate = vi.fn();
      const productView = await view(product.controller, productNavigate);
      await press(productView, 'Go to My Shelf');
      expect(productNavigate).toHaveBeenCalledWith('my_shelf');
    });
  });
});
