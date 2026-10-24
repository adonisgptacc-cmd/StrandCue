import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgrammeActions } from '../../apps/mobile/src/ProgrammeActions.tsx';
import { createProgrammeController } from '../../apps/mobile/src/programme-state.ts';
import { REVIEWED_SEED, createFakeProgrammeServer, reviewedRuleSeed } from './support/programme-fake-server.ts';
import { findByLabel, mount, press, visibleText, withSetup } from './support/programme-harness.tsx';
vi.mock('react-native', async () => (await import('./support/rn-mock.ts')).rnMock);
vi.mock('expo-crypto', async () => (await import('./support/expo-crypto-mock.ts')).expoCryptoMock);
vi.mock('../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));

// Lifecycle actions. Each one is offered only when the server-authorized state
// permits it, is confirmed before it is sent, sends only the owner's own facts,
// and never claims success before the server confirms it.

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

  function instance(seed = REVIEWED_SEED) {
    const server = createFakeProgrammeServer(seed);
    const controller = createProgrammeController({
      ownerKey: 'owner-a',
      api: server.api,
      newOperationId: () => '44444444-4444-4444-8444-444444444444',
      now: () => new Date('2026-09-20T10:00:00.000Z'),
    });
    return { server, controller };
  }

  async function ready(seed = REVIEWED_SEED) {
    const built = instance(seed);
    await built.controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
    await built.controller.loadList();
    await built.controller.openDetail(built.controller.getState().items[0]!.enrolmentId);
    return built;
  }

  const actions = (controller: ReturnType<typeof instance>['controller']) =>
    mount({
      type: ProgrammeActions as never,
      props: {
        detail: controller.getState().selected,
        saving: controller.getState().phase === 'saving',
        failure: controller.getState().failure,
        reloadRequired: controller.getState().reloadRequired,
        controller,
        blocked: controller.getState().blockedReason !== null,
      },
    });

  describe('the programme lifecycle actions', () => {
    it('offers pause, stop and complete on an active programme', async () => {
      const { controller } = await ready();
      const renderer = await actions(controller);
      expect(visibleText(renderer)).toContain('Pause this programme');
      expect(visibleText(renderer)).toContain('Complete this programme');
      expect(visibleText(renderer)).toContain('Stop this programme');
    });

    it('pauses only through an explicit owner choice and a bounded reason code', async () => {
      const { server, controller } = await ready();
      const renderer = await actions(controller);
      await press(renderer, 'Pause this programme');
      expect(controller.getState().confirmation).toBe('pause');
      // The reason is owner-selectable and bounded; no free text is accepted.
      await press(renderer, 'Reason: My schedule changed');
      const [call] = server.callsNamed('change_programme');
      const command = (call!.args as { command: Record<string, unknown> }).command;
      expect(command).toMatchObject({ kind: 'pause', reasonCode: 'scheduling' });
      expect(JSON.stringify(command)).not.toMatch(/reason:|note:|explanation:/i);
      expect(controller.getState().selected?.paused).toMatchObject({ reasonCode: 'scheduling' });
    });

    it('never sends a free-text explanation for a pause', async () => {
      const { server, controller } = await ready();
      const renderer = await actions(controller);
      await press(renderer, 'Pause this programme');
      const fields = findByLabel(renderer, 'Reason: My schedule changed');
      expect(fields).toHaveLength(1);
      // There is deliberately no text field at all on this screen.
      expect(findByLabel(renderer, 'Pause reason').filter(node => (node as { props: { onChangeText?: unknown } }).props.onChangeText !== undefined)).toHaveLength(0);
      expect(server.callsNamed('change_programme')).toHaveLength(0);
    });

    it('does not confirm a pause before the owner confirms it', async () => {
      const { server, controller } = await ready();
      const renderer = await actions(controller);
      await press(renderer, 'Pause this programme');
      await press(renderer, 'Keep it active');
      expect(server.callsNamed('change_programme')).toHaveLength(0);
      expect(controller.getState().selected?.paused).toBeNull();
    });

    it('stops a programme through a neutral confirmation step', async () => {
      const { controller } = await ready();
      const renderer = await actions(controller);
      await press(renderer, 'Stop this programme');
      expect(visibleText(renderer)).toContain('Your past history stays in Journey');
      await press(renderer, 'Confirm: stop this programme');
      expect(controller.getState().selected?.status).toBe('abandoned');
      expect(controller.getState().selected?.evaluation).toBeNull();
      const text = visibleText(await actions(controller));
      expect(text).not.toMatch(/failure|failed|streak|lost/i);
    });

    it('requests completion only and lets the server build the snapshot', async () => {
      const { server, controller } = await ready();
      const renderer = await actions(controller);
      await press(renderer, 'Complete this programme');
      await press(renderer, 'Confirm: complete this programme');
      const [call] = server.callsNamed('change_programme');
      const command = (call!.args as { command: Record<string, unknown> }).command;
      expect(Object.keys(command).sort()).toEqual(['completedAt', 'kind']);
      expect(JSON.stringify(command)).not.toMatch(/snapshot|count|eventsUsed|rulePublication|dueStatus/);
      expect(controller.getState().selected?.completed?.snapshot.count).toBe(3);
    });

    it('offers no resume action: the committed contract never confirms one', async () => {
      const { controller } = await ready();
      const renderer = await actions(controller);
      await press(renderer, 'Pause this programme');
      await press(renderer, 'Reason: My schedule changed');
      const text = visibleText(await actions(controller));
      expect(text).not.toContain('Resume this programme');
      expect(text).toContain('approved resumption');
      expect(text).not.toMatch(/resume_from_pause|resume-fixture/);
    });

    it('offers no action on a programme the server has closed or stopped', async () => {
      const { controller } = await ready();
      await controller.confirmComplete();
      const text = visibleText(await actions(controller));
      expect(text).not.toContain('Pause this programme');
      expect(text).not.toContain('Complete this programme');
      expect(text).not.toContain('Stop this programme');
    });

    it('keeps the owner input and operation id through an offline failure', async () => {
      const { server, controller } = await ready();
      const renderer = await actions(controller);
      await press(renderer, 'Pause this programme');
      server.failNext('change_programme');
      await press(renderer, 'Reason: My schedule changed');
      const failed = controller.getState();
      expect(failed.phase).toBe('offline-pending');
      expect(failed.pending?.operationId).toBe('44444444-4444-4444-8444-444444444444');
      expect(failed.pauseReason).toBe('scheduling');
      await controller.retry();
      expect(controller.getState().selected?.paused).toMatchObject({ reasonCode: 'scheduling' });
      expect(controller.getState().pending).toBeNull();
    });

    it('recovers from a revision conflict by showing the latest programme', async () => {
      const { server, controller } = await ready();
      server.changeElsewhere(controller.getState().selectedId!);
      const renderer = await actions(controller);
      await press(renderer, 'Pause this programme');
      await press(renderer, 'Reason: My schedule changed');
      expect(controller.getState().phase).toBe('conflict-reload');
      const conflicted = await actions(controller);
      expect(visibleText(conflicted)).toContain('Show the latest programme');
      await press(conflicted, 'Show the latest programme');
      expect(controller.getState().phase).toBe('detail-ready');
      expect(controller.getState().reloadRequired).toBe(false);
      expect(controller.getState().selected?.revision).toBe(2);
    });

    it('never claims success before the server confirms it', async () => {
      const { server, controller } = await ready();
      const renderer = await actions(controller);
      await press(renderer, 'Pause this programme');
      await press(renderer, 'Reason: My schedule changed');
      expect(server.callsNamed('change_programme').length).toBeGreaterThan(0);
      expect(controller.getState().selected?.paused).not.toBeNull();
      // A second tap cannot submit a concurrent duplicate command.
      const pending = controller.getState().selected?.revision;
      await controller.confirm();
      expect(controller.getState().selected?.revision).toBe(pending);
    });

    it('allows only a confirmed stop when reviewed guidance becomes withdrawn', async () => {
      const rule = reviewedRuleSeed();
      const withdrawn = await ready({ ...REVIEWED_SEED, rules: [rule] });
      (rule as { state: 'draft' | 'published' | 'withdrawn' }).state = 'withdrawn';
      await withdrawn.controller.openDetail(withdrawn.controller.getState().selectedId!);
      expect(withdrawn.controller.getState()).toMatchObject({ phase: 'blocked-content', blockedReason: 'reviewed-content-withdrawn' });

      const renderer = await actions(withdrawn.controller);
      expect(visibleText(renderer)).not.toContain('Pause this programme');
      expect(visibleText(renderer)).not.toContain('Complete this programme');
      await press(renderer, 'Stop this programme');
      expect(withdrawn.controller.getState().confirmation).toBe('abandon');
      await press(renderer, 'Confirm: stop this programme');

      const calls = withdrawn.server.callsNamed('change_programme');
      expect(calls).toHaveLength(1);
      expect((calls[0]!.args as { command: { kind: string } }).command.kind).toBe('abandon');
      expect(withdrawn.controller.getState().selected?.status).toBe('abandoned');
    });
  });
});
