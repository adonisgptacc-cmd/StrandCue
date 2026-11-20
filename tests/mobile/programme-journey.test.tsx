import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgrammeJourney } from '../../apps/mobile/src/ProgrammeJourney.tsx';
import { createProgrammeController } from '../../apps/mobile/src/programme-state.ts';
import {
  REVIEWED_SEED,
  createFakeProgrammeServer,
  multiRuleSeed,
} from './support/programme-fake-server.ts';
import { announced, mount, press, typeInto, visibleText, withSetup } from './support/programme-harness.tsx';
vi.mock('react-native', async () => (await import('./support/rn-mock.ts')).rnMock);
vi.mock('expo-crypto', async () => (await import('./support/expo-crypto-mock.ts')).expoCryptoMock);
vi.mock('../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));

// The Journey "Treatment programmes" section. It is the owner's own view of
// their programmes: it loads on mount, shows list and detail, and performs no
// recommendation, guidance, catalogue or protocol-execution write of any kind.

const START = '2026-09-01T08:00:00.000Z';
const OFFER = {
  productId: REVIEWED_SEED.productId,
  productVersionId: REVIEWED_SEED.productVersionId,
  ruleId: 'rule-fixture-1',
  ruleVersion: '1',
  label: 'Fixture treatment product',
};

// Nothing in this journey may reach guidance generation or execution writes.
const guards = vi.hoisted(() => ({ run: vi.fn(), transition: vi.fn(), start: vi.fn(), recommend: vi.fn() }));

vi.mock('../../apps/mobile/src/guidance/recommendation-run-api', () => ({ recordRecommendationRun: guards.run }));
vi.mock('../../apps/mobile/src/guidance/protocol-execution-api', () => ({
  startProtocolExecution: guards.start,
  transitionProtocolExecution: guards.transition,
  getActiveProtocolExecution: guards.run,
  listProtocolExecutions: vi.fn(),
}));
vi.mock('../../apps/mobile/src/guidance/guidance-snapshot', () => ({
  loadGuidanceSnapshot: vi.fn(),
  prepareGuidance: guards.recommend,
}));

withSetup(() => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const journey = (server: ReturnType<typeof createFakeProgrammeServer>, offer: typeof OFFER | null = OFFER) =>
    mount({
      type: ProgrammeJourney as never,
      props: {
        owner: 'owner-a',
        api: server.api,
        programmeOffer: offer,
        now: () => new Date('2026-09-20T10:00:00.000Z'),
      },
    });

  describe('the Journey treatment programmes section', () => {
    it('loads the owner programmes on mount', async () => {
      const server = createFakeProgrammeServer(REVIEWED_SEED);
      const renderer = await journey(server, null);
      expect(visibleText(renderer)).toContain('Treatment programmes');
      expect(server.callsNamed('list_programmes')).toHaveLength(1);
    });

    it('shows the honest blocked state in production, where no rule exists', async () => {
      const server = createFakeProgrammeServer({ ...REVIEWED_SEED, rules: [] });
      const renderer = await journey(server, OFFER);
      await typeInto(renderer, 'Programme start date (YYYY-MM-DD)', '2026-09-01');
      await press(renderer, 'Start this treatment programme');
      const text = visibleText(renderer);
      expect(text).toContain('Treatment programme guidance is not available yet');
      expect(text).toContain('reviewed product instructions');
      expect(server.callsNamed('enrol_programme')).toHaveLength(1);
    });

    it('does not insert seed content to make the screen look functional', async () => {
      const server = createFakeProgrammeServer({ ...REVIEWED_SEED, rules: [] });
      await journey(server, OFFER);
      expect(server.rules()).toEqual([]);
      expect(server.callsNamed('enrol_programme')).toHaveLength(0);
      expect(server.callsNamed('list_programmes')).toHaveLength(1);
    });

    it('opens a programme and comes back to the list', async () => {
      const server = createFakeProgrammeServer(REVIEWED_SEED);
      const controller = createProgrammeController({
        ownerKey: 'owner-a', api: server.api,
        newOperationId: () => '44444444-4444-4444-8444-444444444444',
        now: () => new Date('2026-09-20T10:00:00.000Z'),
      });
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      const renderer = await journey(server, null);
      await press(renderer, 'Open treatment programme 1');
      expect(visibleText(renderer)).toContain('Washes so far');
      await press(renderer, 'Back to treatment programmes');
      expect(visibleText(renderer)).toContain('Treatment programmes');
    });

    it('announces the list loading and the detail once each', async () => {
      const server = createFakeProgrammeServer(REVIEWED_SEED);
      const controller = createProgrammeController({
        ownerKey: 'owner-a', api: server.api,
        newOperationId: () => '44444444-4444-4444-8444-444444444444',
        now: () => new Date('2026-09-20T10:00:00.000Z'),
      });
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      const renderer = await journey(server, null);
      const spoken = announced();
      expect(spoken.length).toBeGreaterThan(0);
      expect(String(spoken[0])).toMatch(/treatment programme/i);
      const before = spoken.length;
      await press(renderer, 'Open treatment programme 1');
      const after = announced();
      expect(after.length).toBeGreaterThan(before);
      expect(String(after[after.length - 1])).toMatch(/programme/i);
      // No duplicate announcement of the same event.
      expect(new Set(after).size).toBe(after.length);
    });

    it('performs no recommendation, guidance, catalogue or execution write', async () => {
      const server = createFakeProgrammeServer(REVIEWED_SEED);
      const controller = createProgrammeController({
        ownerKey: 'owner-a', api: server.api,
        newOperationId: () => '44444444-4444-4444-8444-444444444444',
        now: () => new Date('2026-09-20T10:00:00.000Z'),
      });
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      const writesBeforeViewing = server.calls.filter(call => !['list_programmes', 'get_programme'].includes(call.name)).length;
      const renderer = await journey(server, null);
      await press(renderer, 'Open treatment programme 1');
      await press(renderer, 'Back to treatment programmes');
      expect(guards.run).not.toHaveBeenCalled();
      expect(guards.transition).not.toHaveBeenCalled();
      expect(guards.start).not.toHaveBeenCalled();
      expect(guards.recommend).not.toHaveBeenCalled();
      const writes = server.calls.filter(call => !['list_programmes', 'get_programme'].includes(call.name));
      expect(writes).toHaveLength(writesBeforeViewing);
    });

    it('collects a start date and enrols only with a reviewed programme', async () => {
      const server = createFakeProgrammeServer(REVIEWED_SEED);
      const renderer = await journey(server, OFFER);
      await typeInto(renderer, 'Programme start date (YYYY-MM-DD)', '2026-09-01');
      await press(renderer, 'Start this treatment programme');
      expect(server.callsNamed('enrol_programme')).toHaveLength(1);
      expect(visibleText(renderer)).toContain('Open treatment programme 1');
    });

    it('keeps several programmes apart when paging', async () => {
      const server = createFakeProgrammeServer(multiRuleSeed(3));
      let operation = 0;
      const controller = createProgrammeController({
        ownerKey: 'owner-a', api: server.api,
        newOperationId: () => `44444444-4444-4444-8444-${String(++operation).padStart(12, '0')}`,
        now: () => new Date('2026-09-20T10:00:00.000Z'),
      });
      for (const rule of ['rule-fixture-1', 'rule-fixture-2', 'rule-fixture-3']) {
        await controller.enrol({ offer: { ...OFFER, ruleId: rule }, startDate: { precision: 'exact', value: START } });
      }
      const renderer = await journey(server, null);
      expect(visibleText(renderer)).toContain('Open treatment programme 3');
    });
  });
});
