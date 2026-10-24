import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgrammeJourney } from '../../apps/mobile/src/ProgrammeJourney.tsx';
import { createProgrammeController } from '../../apps/mobile/src/programme-state.ts';
import { FORBIDDEN_PHRASES } from '../../apps/mobile/src/programme-copy.ts';
import {
  PRODUCTION_SEED,
  REVIEWED_SEED,
  createFakeProgrammeServer,
  multiRuleSeed,
  reviewedRuleSeed,
} from './support/programme-fake-server.ts';
import { findByLabel, mount, press, typeInto, visibleText, withSetup } from './support/programme-harness.tsx';
vi.mock('react-native', async () => (await import('./support/rn-mock.ts')).rnMock);
vi.mock('expo-crypto', async () => (await import('./support/expo-crypto-mock.ts')).expoCryptoMock);
vi.mock('../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));

// The end-to-end owner journey over a fake server that models the committed
// I5.4 RPC contract. This proves the client behaviour, not a real database,
// PostgREST, a device or a screen reader.

const START = '2026-09-01T08:00:00.000Z';
const OFFER = {
  productId: PRODUCTION_SEED.productId,
  productVersionId: PRODUCTION_SEED.productVersionId,
  ruleId: 'rule-fixture-1',
  ruleVersion: '1',
  label: 'Fixture treatment product',
};

const guards = vi.hoisted(() => ({ run: vi.fn(), transition: vi.fn(), start: vi.fn(), catalogue: vi.fn(), recommend: vi.fn() }));
vi.mock('../../apps/mobile/src/guidance/recommendation-run-api', () => ({ recordRecommendationRun: guards.run }));
vi.mock('../../apps/mobile/src/guidance/protocol-execution-api', () => ({
  startProtocolExecution: guards.start,
  transitionProtocolExecution: guards.transition,
  getActiveProtocolExecution: guards.run,
  listProtocolExecutions: vi.fn(),
}));
vi.mock('../../apps/mobile/src/catalogue-search-api', () => ({ searchCatalogue: guards.catalogue }));
vi.mock('../../apps/mobile/src/guidance/guidance-snapshot', () => ({
  loadGuidanceSnapshot: vi.fn(),
  prepareGuidance: guards.recommend,
}));

withSetup(() => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function build(seed = REVIEWED_SEED, pageSize = 20) {
    const server = createFakeProgrammeServer(seed);
    let operation = 0;
    const controller = createProgrammeController({
      ownerKey: 'owner-a', api: server.api,
      newOperationId: () => `44444444-4444-4444-8444-${String(++operation).padStart(12, '0')}`,
      now: () => new Date('2026-09-20T10:00:00.000Z'),
      pageSize,
    });
    return { server, controller };
  }

  const journey = (server: ReturnType<typeof build>['server'], offer: typeof OFFER | null = OFFER) =>
    mount({
      type: ProgrammeJourney as never,
      props: { owner: 'owner-a', api: server.api, programmeOffer: offer, now: () => new Date('2026-09-20T10:00:00.000Z') },
    });

  describe('the full owner journey over the committed contract', () => {
    it('enrols, counts, pauses, stops and leaves readable history', async () => {
      const { server, controller } = build();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      expect(controller.getState().selected?.revision).toBe(1);
      await controller.loadList();
      await controller.openDetail(controller.getState().items[0]!.enrolmentId);
      const countedRenderer = await journey(server, null);
      await press(countedRenderer, 'Open treatment programme 1');
      const counted = visibleText(countedRenderer);
      expect(counted).toContain('Washes so far: 3');

      const renderer = await journey(server, null);
      await press(renderer, 'Open treatment programme 1');
      await press(renderer, 'Pause this programme');
      await press(renderer, 'Reason: My schedule changed');
      await controller.openDetail(controller.getState().selectedId!);
      expect(controller.getState().selected?.paused).toMatchObject({ reasonCode: 'scheduling' });

      await press(renderer, 'Show the latest programme').catch(() => undefined);
      await press(renderer, 'Stop this programme');
      await press(renderer, 'Confirm: stop this programme');
      await controller.openDetail(controller.getState().selectedId!);
      expect(controller.getState().selected?.status).toBe('abandoned');
      const stoppedRenderer = await journey(server, null);
      await press(stoppedRenderer, 'Open treatment programme 1');
      const stopped = visibleText(stoppedRenderer);
      expect(stopped).toContain('Enrolled');
      expect(stopped).toContain('Schedule changed');
      expect(stopped).toContain('Stopped');
    });

    it('completes through the server-generated snapshot boundary', async () => {
      const { server, controller } = build();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      await controller.openDetail(controller.getState().items[0]!.enrolmentId);
      await controller.confirmComplete();
      const state = controller.getState();
      expect(state.selected?.status).toBe('completed');
      expect(state.selected?.evaluation?.fromCompletedSnapshot).toBe(true);
      expect(state.selected?.completed?.snapshot.count).toBe(3);
      // The snapshot is server-built: no client write carried any derived fact.
      const [call] = server.callsNamed('change_programme');
      const sent = JSON.stringify((call!.args as { command: unknown }).command);
      expect(sent).not.toMatch(/snapshot|count|eventsUsed|rulePublication|dueStatus|evidence/);
    });

    it('keeps wash and shampoo-session units distinct in the owner view', async () => {
      const wash = build();
      await wash.controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await wash.controller.loadList();
      await wash.controller.openDetail(wash.controller.getState().items[0]!.enrolmentId);
      const washRenderer = await journey(wash.server, null);
      await press(washRenderer, 'Open treatment programme 1');
      expect(visibleText(washRenderer)).toContain('Washes so far');

      const shampoo = build({ ...REVIEWED_SEED, rules: [reviewedRuleSeed({ unit: 'shampoo-session' })] });
      await shampoo.controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await shampoo.controller.loadList();
      await shampoo.controller.openDetail(shampoo.controller.getState().items[0]!.enrolmentId);
      const shampooRenderer = await journey(shampoo.server, null);
      await press(shampooRenderer, 'Open treatment programme 1');
      expect(visibleText(shampooRenderer)).toContain('Shampoo sessions');
    });

    it('renders the honest blocked state when the reviewed rule store is empty', async () => {
      const { server } = build({ ...REVIEWED_SEED, rules: [] });
      const renderer = await journey(server, OFFER);
      await typeInto(renderer, 'Programme start date (YYYY-MM-DD)', '2026-09-01');
      await press(renderer, 'Start this treatment programme');
      const text = visibleText(renderer);
      expect(text).toContain('Treatment programme guidance is not available yet');
      expect(text).not.toMatch(/not working|broken|error|failed|bug/i);
      expect(text).not.toMatch(/promised|coming soon|next week/i);
      expect(server.callsNamed('enrol_programme')).toHaveLength(1);
      expect(server.rules()).toEqual([]);
    });

    it('leaves a blocked programme readable rather than empty', async () => {
      const { server } = build({ ...REVIEWED_SEED, rules: [] });
      const renderer = await journey(server, OFFER);
      await typeInto(renderer, 'Programme start date (YYYY-MM-DD)', '2026-09-01');
      await press(renderer, 'Start this treatment programme');
      expect(visibleText(renderer)).toContain('Treatment programme guidance is not available yet');
    });

    it('retries an offline mutation without duplicating history', async () => {
      const { server, controller } = build();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      await controller.openDetail(controller.getState().items[0]!.enrolmentId);
      server.loseResponse('change_programme');
      controller.startPause();
      controller.setPauseReason('scheduling');
      await controller.confirm();
      expect(controller.getState().phase).toBe('offline-pending');
      await controller.retry();
      const history = controller.getState().selected!.history!.map(entry => entry.kind);
      expect(history.filter(kind => kind === 'pause')).toHaveLength(1);
      expect(controller.getState().selected?.paused).not.toBeNull();
    });

    it('recovers from a committed-then-lost response', async () => {
      const { server, controller } = build();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      await controller.openDetail(controller.getState().items[0]!.enrolmentId);
      server.loseResponse('change_programme');
      controller.startPause();
      controller.setPauseReason('personal-choice');
      await controller.confirm();
      await controller.retry();
      expect(controller.getState().pending).toBeNull();
      expect(controller.getState().selected?.paused).toMatchObject({ reasonCode: 'personal-choice' });
      expect(server.callsNamed('change_programme')).toHaveLength(2);
    });

    it('offers a recovery state when a confirmed save cannot be reloaded', async () => {
      const { server, controller } = build();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      await controller.openDetail(controller.getState().items[0]!.enrolmentId);
      server.loseResponse('get_programme');
      controller.startPause();
      controller.setPauseReason('personal-choice');
      await controller.confirm();
      const state = controller.getState();
      expect(state.lastSaved).toMatchObject({ kind: 'pause' });
      expect(state.reloadAfterSaveFailed).toBe(true);
      expect(state.failure?.source).toBe('detail');
      expect(state.selected?.paused).toMatchObject({ reasonCode: 'personal-choice' });
    });

    it('pages without duplicates or lost rows', async () => {
      const { server, controller } = build(multiRuleSeed(3), 2);
      for (const rule of ['rule-fixture-1', 'rule-fixture-2', 'rule-fixture-3']) {
        await controller.enrol({ offer: { ...OFFER, ruleId: rule }, startDate: { precision: 'exact', value: START } });
      }
      await controller.loadList();
      const seen = controller.getState().items.map(item => item.enrolmentId);
      await controller.loadMore();
      const all = controller.getState().items.map(item => item.enrolmentId);
      expect(new Set(all).size).toBe(all.length);
      expect(all.length).toBe(3);
      expect(seen.length).toBeLessThan(3);
      expect(visibleText(await journey(server, null))).toContain('Open treatment programme 3');
    });

    it('keeps every visible and accessibility label free of forbidden wording', async () => {
      const { server, controller } = build();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      await controller.openDetail(controller.getState().items[0]!.enrolmentId);
      await controller.confirmComplete();
      const renderer = await journey(server, null);
      const text = visibleText(renderer).toLowerCase();
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(text, phrase).not.toContain(phrase.toLowerCase());
      }
    });

    it('performs no recommendation, guidance, catalogue or execution work while viewing', async () => {
      const { server, controller } = build();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      const writesBeforeViewing = server.calls.filter(call => !['list_programmes', 'get_programme'].includes(call.name)).length;
      const renderer = await journey(server, null);
      await press(renderer, 'Open treatment programme 1');
      await press(renderer, 'Back to treatment programmes');
      expect(guards.run).not.toHaveBeenCalled();
      expect(guards.transition).not.toHaveBeenCalled();
      expect(guards.start).not.toHaveBeenCalled();
      expect(guards.catalogue).not.toHaveBeenCalled();
      expect(guards.recommend).not.toHaveBeenCalled();
      const writes = server.calls.filter(call => !['list_programmes', 'get_programme'].includes(call.name));
      expect(writes).toHaveLength(writesBeforeViewing);
    });

    it('holds unique accessible names for every control on the journey', async () => {
      const { server, controller } = build();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      const renderer = await journey(server, null);
      const names = renderer.root.findAll(node => node.type === 'button').map(node => String(node.props.accessibilityLabel ?? ''));
      expect(new Set(names).size).toBe(names.length);
      const detail = await journey(server, null);
      await press(detail, 'Open treatment programme 1');
      const detailNames = detail.root.findAll(node => node.type === 'button').map(node => String(node.props.accessibilityLabel ?? ''));
      expect(new Set(detailNames).size).toBe(detailNames.length);
    });

    it('never renders a technical field anywhere in the journey', async () => {
      const { server, controller } = build();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      await controller.openDetail(controller.getState().items[0]!.enrolmentId);
      await controller.confirmComplete();
      const renderer = await journey(server, null);
      const text = visibleText(renderer);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(text).not.toMatch(/sha256/);
      expect(text).not.toMatch(/rule-fixture|artifact-fixture|resume-fixture/i);
      expect(text).not.toMatch(/execution-confirmed|activity-recorded|reasonCode|operationId/);
      expect(text).not.toContain('2026-09-20T');
    });

    it('keeps the production shape honest when every store is empty', async () => {
      const { server } = build(PRODUCTION_SEED);
      const renderer = await journey(server, OFFER);
      await typeInto(renderer, 'Programme start date (YYYY-MM-DD)', '2026-09-01');
      await press(renderer, 'Start this treatment programme');
      const text = visibleText(renderer);
      expect(text).toContain('Treatment programme guidance is not available yet');
      expect(server.rules()).toEqual([]);
      // The server remains authoritative and refuses the unreviewed offer.
      expect(server.callsNamed('enrol_programme')).toHaveLength(1);
      expect(findByLabel(renderer, 'Open treatment programme 1')).toHaveLength(0);
    });
  });
});
