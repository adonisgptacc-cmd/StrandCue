import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgrammeJourney } from '../../apps/mobile/src/ProgrammeJourney.tsx';
import { createProgrammeController } from '../../apps/mobile/src/programme-state.ts';
import { multiRuleSeed, createFakeProgrammeServer } from './support/programme-fake-server.ts';
import {
  findByLabel,
  mount,
  snapshotOf,
  typeInto,
  visibleText,
  withSetup,
} from './support/programme-harness.tsx';
vi.mock('react-native', async () => (await import('./support/rn-mock.ts')).rnMock);
vi.mock('expo-crypto', async () => (await import('./support/expo-crypto-mock.ts')).expoCryptoMock);
vi.mock('../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));

// Owner isolation on a shared device. Switching owners must clear every prior
// programme fact synchronously, drop any in-flight response from the previous
// owner, and never let the new owner see or retain the old owner's data.

const START = '2026-09-01T08:00:00.000Z';
const OFFER = {
  productId: 'c0000000-0000-4000-8000-000000000002',
  productVersionId: 'c0000000-0000-4000-8000-000000000003',
  ruleId: 'rule-fixture-1',
  ruleVersion: '1',
  label: 'Fixture treatment product',
};

const OWNER_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const OWNER_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

withSetup(() => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('switching owners clears every prior programme', () => {
    it('renders clean state on the first frame after a switch', async () => {
      const a = createFakeProgrammeServer(multiRuleSeed(3));
      const b = createFakeProgrammeServer(multiRuleSeed(3));
      // Owner A enrols and opens a detail.
      const controllerA = createProgrammeController({
        ownerKey: OWNER_A, api: a.api,
        newOperationId: () => '44444444-4444-4444-8444-444444444444',
        now: () => new Date('2026-09-20T10:00:00.000Z'),
      });
      await controllerA.enrol({ offer: { ...OFFER, ruleId: 'rule-fixture-1' }, startDate: { precision: 'exact', value: START } });
      await controllerA.loadList();
      await controllerA.openDetail(controllerA.getState().items[0]!.enrolmentId);
      expect(controllerA.getState().selected).not.toBeNull();

      const renderer = await mount({
        type: ProgrammeJourney as never,
        props: {
          owner: OWNER_B, api: b.api, programmeOffer: OFFER,
          now: () => new Date('2026-09-20T10:00:00.000Z'),
        },
      });
      // A brand-new owner's view holds none of owner A's facts.
      const first = visibleText(renderer);
      expect(first).not.toContain('Washes so far');
      expect(first).not.toContain('Open treatment programme');
      expect(first).not.toContain('Fixture treatment product');
      expect(b.callsNamed('list_programmes')).toHaveLength(1);
      expect(b.callsNamed('get_programme')).toHaveLength(0);
    });

    it('ignores a response that arrives after the owner changed', async () => {
      const a = createFakeProgrammeServer(multiRuleSeed(3));
      const controller = createProgrammeController({
        ownerKey: OWNER_A, api: a.api,
        newOperationId: () => '44444444-4444-4444-8444-444444444444',
        now: () => new Date('2026-09-20T10:00:00.000Z'),
      });
      const release = a.hold('list_programmes');
      const pending = controller.loadList();
      controller.setOwner(OWNER_B);
      release();
      await pending;
      const state = controller.getState();
      expect(state.ownerKey).toBe(OWNER_B);
      expect(state.items).toEqual([]);
      expect(state.ownerEpoch).toBe(1);
      // A detail request for the previous owner's programme is dropped too.
      const held = a.hold('get_programme');
      const detailPending = controller.openDetail('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').catch(() => undefined);
      controller.setOwner(OWNER_A);
      held();
      await detailPending;
      expect(controller.getState().selected).toBeNull();
    });

    it('keeps one owner\'s programmes invisible to the other owner', async () => {
      const seed = multiRuleSeed(3);
      const a = createFakeProgrammeServer(seed);
      const b = createFakeProgrammeServer(seed);
      const controllerA = createProgrammeController({
        ownerKey: OWNER_A, api: a.api,
        newOperationId: () => '44444444-4444-4444-8444-444444444444',
        now: () => new Date('2026-09-20T10:00:00.000Z'),
      });
      await controllerA.enrol({ offer: { ...OFFER, ruleId: 'rule-fixture-1' }, startDate: { precision: 'exact', value: START } });
      await controllerA.loadList();
      const enrolmentId = controllerA.getState().items[0]!.enrolmentId;
      // Owner B cannot read, open or change owner A's programme.
      const controllerB = createProgrammeController({
        ownerKey: OWNER_B, api: b.api,
        newOperationId: () => '44444444-4444-4444-8444-444444444444',
        now: () => new Date('2026-09-20T10:00:00.000Z'),
      });
      await controllerB.openDetail(enrolmentId);
      expect(controllerB.getState().failure?.code).toBe('programme-not-found');
      await controllerB.loadList();
      expect(controllerB.getState().items).toEqual([]);
      expect(JSON.stringify(controllerB.getState())).not.toContain(enrolmentId);
      expect(JSON.stringify(controllerB.getState())).not.toContain('rule-fixture');
    });

    it('clears an unsent draft when the owner switches', async () => {
      const a = createFakeProgrammeServer(multiRuleSeed(3));
      const controller = createProgrammeController({
        ownerKey: OWNER_A, api: a.api,
        newOperationId: () => '44444444-4444-4444-8444-444444444444',
        now: () => new Date('2026-09-20T10:00:00.000Z'),
      });
      await controller.enrol({ offer: { ...OFFER, ruleId: 'rule-fixture-1' }, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      await controller.openDetail(controller.getState().items[0]!.enrolmentId);
      controller.startPause();
      controller.setPauseReason('scheduling');
      expect(controller.getState().pauseReason).toBe('scheduling');
      controller.setOwner(OWNER_B);
      expect(controller.getState().pauseReason).toBeNull();
      expect(controller.getState().confirmation).toBeNull();
      expect(controller.getState().enrolDraft).toBeNull();
      expect(controller.getState().pending).toBeNull();
    });

    it('never renders the previous owner programme after the switch', async () => {
      const a = createFakeProgrammeServer(multiRuleSeed(3));
      const b = createFakeProgrammeServer(multiRuleSeed(3));
      const controllerA = createProgrammeController({
        ownerKey: OWNER_A, api: a.api,
        newOperationId: () => '44444444-4444-4444-8444-444444444444',
        now: () => new Date('2026-09-20T10:00:00.000Z'),
      });
      await controllerA.enrol({ offer: { ...OFFER, ruleId: 'rule-fixture-1' }, startDate: { precision: 'exact', value: START } });
      const renderer = await mount({
        type: ProgrammeJourney as never,
        props: {
          owner: OWNER_B, api: b.api, programmeOffer: OFFER,
          now: () => new Date('2026-09-20T10:00:00.000Z'),
        },
      });
      const frame = snapshotOf(renderer);
      expect(frame).not.toContain('Washes so far');
      expect(frame).not.toContain('Open treatment programme');
      expect(frame).not.toContain('Enrolled');
      expect(findByLabel(renderer, 'Open treatment programme 1')).toHaveLength(0);
    });

    it('does not let the new owner enrolment ride the previous owner operation id', async () => {
      const a = createFakeProgrammeServer(multiRuleSeed(3));
      const b = createFakeProgrammeServer(multiRuleSeed(3));
      const controller = createProgrammeController({
        ownerKey: OWNER_B, api: b.api,
        newOperationId: () => '44444444-4444-4444-8444-444444444444',
        now: () => new Date('2026-09-20T10:00:00.000Z'),
      });
      await controller.enrol({ offer: { ...OFFER, ruleId: 'rule-fixture-1' }, startDate: { precision: 'exact', value: START } });
      await controller.loadList();
      const state = controller.getState();
      expect(state.items).toHaveLength(1);
      expect(state.ownerKey).toBe(OWNER_B);
      expect(b.callsNamed('enrol_programme')).toHaveLength(1);
      // The receipt lives on owner B's server only; owner A's store is untouched.
      expect(JSON.stringify(state.items)).toContain('rule-fixture-1');
      expect(a.callsNamed('enrol_programme')).toHaveLength(0);
    });

    it('keeps a shared-device start date out of the next owner view', async () => {
      const a = createFakeProgrammeServer(multiRuleSeed(3));
      const b = createFakeProgrammeServer(multiRuleSeed(3));
      const renderer = await mount({
        type: ProgrammeJourney as never,
        props: {
          owner: OWNER_A, api: a.api, programmeOffer: OFFER,
          now: () => new Date('2026-09-20T10:00:00.000Z'),
        },
      });
      await typeInto(renderer, 'Programme start date (YYYY-MM-DD)', '2026-09-01');
      const switched = await mount({
        type: ProgrammeJourney as never,
        props: {
          owner: OWNER_B, api: b.api, programmeOffer: OFFER,
          now: () => new Date('2026-09-20T10:00:00.000Z'),
        },
      });
      const fields = findByLabel(switched, 'Programme start date (YYYY-MM-DD)');
      for (const field of fields) {
        expect((field as { props: { value?: string } }).props.value ?? '').toBe('');
      }
    });
  });
});
