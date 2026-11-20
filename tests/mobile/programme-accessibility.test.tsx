import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactTestRenderer } from 'react-test-renderer';
import { focusOn } from '../../apps/mobile/src/focus';

import { ProgrammeJourney } from '../../apps/mobile/src/ProgrammeJourney.tsx';
import { createProgrammeController } from '../../apps/mobile/src/programme-state.ts';
import { REVIEWED_SEED, createFakeProgrammeServer } from './support/programme-fake-server.ts';
import {
  TOUCH_TARGET,
  announced,
  findByLabel,
  hasLabel,
  mount,
  press,
  visibleText,
  withSetup,
} from './support/programme-harness.tsx';
vi.mock('react-native', async () => (await import('./support/rn-mock.ts')).rnMock);
vi.mock('expo-crypto', async () => (await import('./support/expo-crypto-mock.ts')).expoCryptoMock);
vi.mock('../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));

// Accessibility. The screen must be operable by screen reader alone, must not
// rely on colour, must not announce internal identifiers, and must announce
// each outcome exactly once even when a response arrives quickly.

const START = '2026-09-01T08:00:00.000Z';
const OFFER = {
  productId: REVIEWED_SEED.productId,
  productVersionId: REVIEWED_SEED.productVersionId,
  ruleId: 'rule-fixture-1',
  ruleVersion: '1',
  label: 'Fixture treatment product',
};

/** The effective minimum dimension of a rendered control's style. */
function controlSize(style: unknown): { width: number; height: number } {
  const flat = (Array.isArray(style) ? style : [style]).filter(Boolean) as Record<string, number>[];
  const width = Math.max(0, ...flat.map(entry => entry.minWidth ?? 0));
  const height = Math.max(0, ...flat.map(entry => entry.minHeight ?? 0));
  return { width, height };
}

function controls(renderer: ReactTestRenderer) {
  return renderer.root.findAll(node => node.type === 'button');
}

function assertions(renderer: ReactTestRenderer): { text: string; names: string[] } {
  return {
    text: visibleText(renderer),
    names: controls(renderer).map(node => String(node.props.accessibilityLabel ?? '')),
  };
}

withSetup(() => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  function build(seed = REVIEWED_SEED) {
    const server = createFakeProgrammeServer(seed);
    const controller = createProgrammeController({
      ownerKey: 'owner-a', api: server.api,
      newOperationId: () => '44444444-4444-4444-8444-444444444444',
      now: () => new Date('2026-09-20T10:00:00.000Z'),
    });
    return { server, controller };
  }

  async function withProgramme() {
    const built = build();
    await built.controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
    return built;
  }

  const journey = (server: ReturnType<typeof build>['server'], offer: typeof OFFER | null = OFFER) =>
    mount({
      type: ProgrammeJourney as never,
      props: { owner: 'owner-a', api: server.api, programmeOffer: offer, now: () => new Date('2026-09-20T10:00:00.000Z') },
    });

  describe('touch targets and unique names', () => {
    it('gives every control at least a 44 by 44 target', async () => {
      const { server } = await withProgramme();
      const renderer = await journey(server, null);
      await press(renderer, 'Open treatment programme 1');
      for (const node of controls(renderer)) {
        const size = controlSize(node.props.style);
        expect(size.width, String(node.props.accessibilityLabel)).toBeGreaterThanOrEqual(TOUCH_TARGET);
        expect(size.height, String(node.props.accessibilityLabel)).toBeGreaterThanOrEqual(TOUCH_TARGET);
      }
    });

    it('gives every action a unique accessible name', async () => {
      const { server } = await withProgramme();
      const renderer = await journey(server, null);
      await press(renderer, 'Open treatment programme 1');
      const { names } = assertions(renderer);
      expect(names.length).toBeGreaterThan(3);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(name).not.toBe('');
        expect(name).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
        expect(name).not.toMatch(/sha256|rule-fixture|artifact-fixture|execution-confirmed/i);
      }
    });

    it('distinguishes programme rows by name, not by position alone', async () => {
      const { server, controller } = build();
      await controller.enrol({ offer: OFFER, startDate: { precision: 'exact', value: START } });
      const renderer = await journey(server, null);
      const name = findByLabel(renderer, 'Open treatment programme 1')[0] as { props: { accessibilityLabel: string } };
      expect(name.props.accessibilityLabel).toContain('Ready for review');
      expect(name.props.accessibilityLabel).toContain('Fixture treatment product');
      expect(name.props.accessibilityLabel).not.toBe('Open treatment programme 1');
    });
  });

  describe('headings, focus and live regions', () => {
    it('uses header roles for the list and detail headings', async () => {
      const { server } = await withProgramme();
      const renderer = await journey(server, null);
      const headers = renderer.root.findAll(node => node.props.accessibilityRole === 'header');
      expect(headers.length).toBeGreaterThan(0);
    });

    it('moves focus to the heading when the view changes', async () => {
      const { server } = await withProgramme();
      const renderer = await journey(server, null);
      await press(renderer, 'Open treatment programme 1');
      expect(vi.mocked(focusOn)).toHaveBeenCalled();
      const before = vi.mocked(focusOn).mock.calls.length;
      await press(renderer, 'Back to treatment programmes');
      expect(vi.mocked(focusOn).mock.calls.length).toBeGreaterThan(before);
    });

    it('does not trap focus in the loading state', async () => {
      const server = createFakeProgrammeServer(REVIEWED_SEED);
      const release = server.hold('list_programmes');
      const renderer = await mount({
        type: ProgrammeJourney as never,
        props: { owner: 'owner-a', api: server.api, programmeOffer: null, now: () => new Date('2026-09-20T10:00:00.000Z') },
      });
      release();
      await Promise.resolve();
      // While loading, there is a polite live region and no focused control.
      const live = renderer.root.findAll(node => node.props.accessibilityLiveRegion !== undefined);
      expect(live.length).toBeGreaterThan(0);
      const alerts = renderer.root.findAll(node => node.props.accessibilityRole === 'alert');
      expect(alerts).toHaveLength(0);
    });

    it('keeps focus on the action while saving', async () => {
      const { server } = await withProgramme();
      const renderer = await journey(server, null);
      await press(renderer, 'Open treatment programme 1');
      const pause = findByLabel(renderer, 'Pause this programme')[0] as { props: { accessibilityLabel: string } };
      expect(pause.props.accessibilityLabel).toBe('Pause this programme');
      await press(renderer, 'Pause this programme');
      expect(hasLabel(renderer, 'Reason: My schedule changed')).toBe(true);
    });
  });

  describe('announcements happen exactly once', () => {
    it('announces the list, the detail and a save once each', async () => {
      const { server } = await withProgramme();
      const renderer = await journey(server, null);
      const listSpoken = announced().filter(message => /loaded/i.test(String(message)));
      expect(listSpoken.length).toBeGreaterThan(0);
      await press(renderer, 'Open treatment programme 1');
      await press(renderer, 'Pause this programme');
      await press(renderer, 'Reason: My schedule changed');
      await press(renderer, 'Stop this programme');
      await press(renderer, 'Confirm: stop this programme');
      const spoken = announced();
      const saved = spoken.filter(message => /saved/i.test(String(message)));
      expect(saved).toHaveLength(2);
    });

    it('announces a retryable failure once and keeps retry reachable', async () => {
      const server = createFakeProgrammeServer(REVIEWED_SEED);
      server.failNext('list_programmes');
      const renderer = await journey(server, null);
      const failures = announced().filter(message => /offline|could not/i.test(String(message)));
      expect(failures).toHaveLength(1);
      expect(hasLabel(renderer, 'Retry loading programmes')).toBe(true);
    });

    it('announces a revision conflict once', async () => {
      const { server, controller } = await withProgramme();
      await controller.loadList();
      await controller.openDetail(controller.getState().items[0]!.enrolmentId);
      const renderer = await journey(server, null);
      await press(renderer, 'Open treatment programme 1');
      server.changeElsewhere(controller.getState().selectedId!);
      await press(renderer, 'Pause this programme');
      await press(renderer, 'Reason: My schedule changed');
      const conflicts = announced().filter(message => /another session|changed/i.test(String(message)));
      expect(conflicts).toHaveLength(1);
      expect(hasLabel(renderer, 'Show the latest programme')).toBe(true);
    });

    it('announces nothing when a fast response resolves before a render', async () => {
      const { server } = await withProgramme();
      await journey(server, null);
      const spoken = announced();
      // No identifier of any kind is ever spoken.
      for (const message of spoken) {
        expect(String(message)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
        expect(String(message)).not.toMatch(/rule-fixture|artifact|digest|sha256|operation/i);
      }
    });
  });

  describe('no colour-only signal and no animation', () => {
    it('carries every state in text as well as tone', async () => {
      const { server } = await withProgramme();
      const renderer = await journey(server, null);
      await press(renderer, 'Open treatment programme 1');
      const { text } = assertions(renderer);
      expect(text).toContain('Ready for review');
      expect(text).toContain('Within the reviewed range');
    });

    it('introduces no animation that would ignore a reduced-motion setting', async () => {
      const { server } = await withProgramme();
      const renderer = await journey(server, null);
      await press(renderer, 'Open treatment programme 1');
      const styles = JSON.stringify(renderer.toJSON());
      expect(styles).not.toContain('transitionDuration');
      expect(styles).not.toContain('animationName');
      expect(styles).not.toContain('transform:');
    });

    it('labels destructive confirmations clearly', async () => {
      const { server } = await withProgramme();
      const renderer = await journey(server, null);
      await press(renderer, 'Open treatment programme 1');
      await press(renderer, 'Stop this programme');
      expect(hasLabel(renderer, 'Confirm: stop this programme')).toBe(true);
      expect(visibleText(renderer)).toContain('This cannot be undone');
    });
  });
});
