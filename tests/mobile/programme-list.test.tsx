import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgrammeList } from '../../apps/mobile/src/ProgrammeList.tsx';
import { createProgrammeController } from '../../apps/mobile/src/programme-state.ts';
import { PROGRAMME_DUE_LABELS, PROGRAMME_STATE_LABELS } from '../../apps/mobile/src/programme-copy.ts';
import {
  REVIEWED_SEED,
  createFakeProgrammeServer,
  multiRuleSeed,
} from './support/programme-fake-server.ts';
import {
  findByLabel,
  hasLabel,
  mount,
  press,
  typeInto,
  visibleText,
  withSetup,
} from './support/programme-harness.tsx';
vi.mock('react-native', async () => (await import('./support/rn-mock.ts')).rnMock);
vi.mock('expo-crypto', async () => (await import('./support/expo-crypto-mock.ts')).expoCryptoMock);
vi.mock('../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));

// The owner's programme list. It shows what the server holds and nothing it does
// not: no enrol affordance without a reviewed programme, no raw enum keys, no
// identifiers, and no claim that a treatment worked.

const START = '2026-09-01T08:00:00.000Z';
const OFFER = {
  productId: REVIEWED_SEED.productId,
  productVersionId: REVIEWED_SEED.productVersionId,
  ruleId: 'rule-fixture-1',
  ruleVersion: '1',
  label: 'Fixture treatment product',
};

withSetup(() => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function instance(seed = REVIEWED_SEED, pageSize = 20) {
    const server = createFakeProgrammeServer(seed);
    let operation = 0;
    const controller = createProgrammeController({
      ownerKey: 'owner-a',
      api: server.api,
      newOperationId: () => `44444444-4444-4444-8444-${String(++operation).padStart(12, '0')}`,
      now: () => new Date('2026-09-20T10:00:00.000Z'),
      pageSize,
    });
    return { server, controller };
  }

  const list = (controller: ReturnType<typeof instance>['controller'], offer: typeof OFFER | null = null) =>
    mount({ type: ProgrammeList as never, props: { state: controller.getState(), controller, offer } });

  describe('the treatment programme list', () => {
    it('shows a loading state before anything arrives', async () => {
      const { controller } = instance();
      const renderer = await list(controller);
      expect(visibleText(renderer)).toContain('Loading your treatment programmes');
    });

    it('shows the reviewed-content blocked state when enrolment is refused', async () => {
      const { server, controller } = instance({ ...REVIEWED_SEED, rules: [] });
      const renderer = await list(controller, OFFER);
      await typeInto(renderer, 'Programme start date (YYYY-MM-DD)', '2026-09-01');
      await press(renderer, 'Start this treatment programme');
      const text = visibleText(renderer);
      expect(text).toContain('Treatment programme guidance is not available yet');
      expect(text).toContain('reviewed product instructions');
      expect(server.callsNamed('enrol_programme')).toHaveLength(1);
      expect(text).not.toMatch(/not working|broken|bug|fault/i);
    });

    it('shows an honest empty state with no misleading enrol button', async () => {
      const { controller } = instance();
      await controller.loadList();
      const renderer = await list(controller);
      const text = visibleText(renderer);
      expect(text).toContain('No treatment programmes yet');
      expect(text).toContain('reviewed product instructions');
      expect(hasLabel(renderer, 'Start this treatment programme')).toBe(false);
    });

    it('does not offer enrolment before the server confirms reviewed content', async () => {
      const { controller } = instance();
      await controller.loadList();
      const renderer = await list(controller);
      expect(findByLabel(renderer, 'Start this treatment programme')).toHaveLength(0);
      expect(visibleText(renderer)).not.toContain('Fixture treatment product');
    });

    it('lists programmes with plain state and due labels in the accessible name', async () => {
      const { controller } = instance();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      const renderer = await list(controller);
      const text = visibleText(renderer);
      expect(text).toContain(PROGRAMME_STATE_LABELS.reassessment);
      expect(text).toContain(PROGRAMME_DUE_LABELS.eligible);
      expect(text).toContain('Washes');
      const open = findByLabel(renderer, 'Open treatment programme 1');
      expect(open).toHaveLength(1);
      const name = (open[0] as { props: { accessibilityLabel: string } }).props.accessibilityLabel;
      expect(name).toContain(PROGRAMME_STATE_LABELS.reassessment);
      expect(name).toContain(PROGRAMME_DUE_LABELS.eligible);
      expect(name).toContain('Fixture treatment product');
      expect(name).toContain('changed');
    });

    it('renders no raw enum key, identifier or technical field', async () => {
      const { controller } = instance();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      const renderer = await list(controller);
      const text = visibleText(renderer);
      for (const forbidden of ['not_started', 'initial', 'reassessment', 'maintenance', 'paused', 'completed',
        'not_due', 'eligible', 'needs_input', 'shampoo-session']) {
        expect(text, forbidden).not.toContain(forbidden);
      }
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(text).not.toMatch(/sha256/i);
      expect(text).not.toMatch(/rule-fixture|artifact-fixture|execution-confirmed|activity-recorded/i);
      expect(text).not.toContain('rulePublication');
    });

    it('shows a last-changed time only as an owner-friendly date', async () => {
      const { controller } = instance();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      const renderer = await list(controller);
      const text = visibleText(renderer);
      expect(text).toMatch(/\d{1,2} September 2026/);
      expect(text).not.toContain('2026-09');
    });

    it('pages without duplicates or lost rows', async () => {
      const { controller } = instance(multiRuleSeed(3), 2);
      for (const rule of ['rule-fixture-1', 'rule-fixture-2', 'rule-fixture-3']) {
        await controller.enrol({ offer: { ...OFFER, ruleId: rule }, startDate: { precision: 'exact', value: START } });
      }
      await controller.loadList();
      const first = controller.getState();
      expect(first.items).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      await controller.loadMore();
      const paged = controller.getState();
      const all = paged.items.map(item => item.enrolmentId);
      expect(all).toHaveLength(3);
      expect(new Set(all).size).toBe(3);
      expect(paged.hasMore).toBe(false);
      const renderer = await list(controller);
      expect(hasLabel(renderer, 'Open treatment programme 1')).toBe(true);
      expect(hasLabel(renderer, 'Open treatment programme 3')).toBe(true);
    });

    it('offers a retry when a list load fails offline', async () => {
      const { server, controller } = instance();
      server.failNext('list_programmes');
      await controller.loadList();
      expect(controller.getState().phase).toBe('failed');
      const renderer = await list(controller);
      expect(hasLabel(renderer, 'Retry loading programmes')).toBe(true);
      await press(renderer, 'Retry loading programmes');
      expect(controller.getState().phase).toBe('list-ready');
    });

    it('reloads from the server on request', async () => {
      const { server, controller } = instance();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      const renderer = await list(controller);
      await press(renderer, 'Reload treatment programmes');
      expect(server.callsNamed('list_programmes')).toHaveLength(2);
      expect(controller.getState().items).toHaveLength(1);
    });

    it('opens a programme detail from its row', async () => {
      const { server, controller } = instance();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      const renderer = await list(controller);
      const before = server.callsNamed('get_programme').length;
      await press(renderer, 'Open treatment programme 1');
      expect(controller.getState().phase).toBe('detail-ready');
      expect(server.callsNamed('get_programme')).toHaveLength(before + 1);
    });
  });
});
