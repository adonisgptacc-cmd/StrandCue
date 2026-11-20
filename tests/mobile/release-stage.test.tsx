import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

import {
  CURRENT_RELEASE_STAGE,
  ReleaseStageSchema,
  describeReleaseStage,
  type ReleaseStage,
} from '../../apps/mobile/src/release-stage';
import { ReleaseStageBanner } from '../../apps/mobile/src/ReleaseStageBanner';
import { Records } from '../../apps/mobile/src/records';

const releaseMocks = vi.hoisted(() => ({
  loadPassport: vi.fn(),
  loadProfile: vi.fn(),
  loadService: vi.fn(),
  loadServices: vi.fn(),
  storage: {
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  },
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
    AppState: { addEventListener: () => ({ remove: () => undefined }) },
    Platform: { OS: 'web' },
    Image: host('img'),
    Pressable: host('button'),
    ScrollView: host('main'),
    StyleSheet: { create: (value: unknown) => value },
    Text: host('span'),
    TextInput: host('input'),
    View: host('div'),
  };
});

vi.mock('expo-crypto', () => ({
  randomUUID: () => '30000000-0000-4000-8000-000000000001',
}));

vi.mock('../../apps/mobile/src/client.ts', () => ({
  RECOVERY_KEY: 'strandcue-recovery',
  secureStorage: releaseMocks.storage,
  supabase: {
    auth: {},
    from: () => ({
      select: () => ({ maybeSingle: releaseMocks.loadProfile }),
    }),
    rpc: vi.fn(),
  },
}));

vi.mock('../../apps/mobile/src/passport-api.ts', () => ({
  loadPassport: releaseMocks.loadPassport,
  savePassport: vi.fn(),
}));

vi.mock('../../apps/mobile/src/services-api.ts', () => ({
  loadService: releaseMocks.loadService,
  loadServices: releaseMocks.loadServices,
}));

vi.mock('../../apps/mobile/src/activities.tsx', () => ({ Activities: () => null }));
vi.mock('../../apps/mobile/src/shelf.tsx', () => ({ Shelf: () => null }));
vi.mock('../../apps/mobile/src/tools.tsx', () => ({ Tools: () => null }));
vi.mock('../../apps/mobile/src/screens/ExportScreen.tsx', () => ({ ExportScreen: () => null }));
vi.mock('../../apps/mobile/src/screens/DeletionScreen.tsx', () => ({ DeletionScreen: () => null }));

function renderedText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

const owner = '20000000-0000-4000-8000-000000000001';
const confirmedUser = {
  id: owner,
  email_confirmed_at: '2026-09-01T00:00:00.000Z',
} as User;

const originalConsoleError = console.error.bind(console);
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...details: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...details);
  });
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
  releaseMocks.storage.getItem.mockResolvedValue(null);
  releaseMocks.storage.removeItem.mockResolvedValue(undefined);
  releaseMocks.storage.setItem.mockResolvedValue(undefined);
  releaseMocks.loadProfile.mockResolvedValue({
    data: { username: 'fixture-owner' },
    error: null,
  });
  releaseMocks.loadPassport.mockResolvedValue(null);
});

describe('release stage contract', () => {
  it('pins the current release stage to technical alpha', () => {
    expect(CURRENT_RELEASE_STAGE).toBe('technical_alpha');
    expect(ReleaseStageSchema.parse('technical_alpha')).toBe('technical_alpha');
  });

  it('describes every supported stage with a stable label', () => {
    const stages = ReleaseStageSchema.options as readonly ReleaseStage[];
    expect([...stages]).toEqual([
      'technical_alpha',
      'guided_founder_alpha',
      'closed_beta',
      'public_release',
    ]);
    for (const stage of stages) {
      const descriptor = describeReleaseStage(stage);
      expect(descriptor.id).toBe(stage);
      expect(descriptor.label.length).toBeGreaterThan(0);
      expect(descriptor.description.length).toBeGreaterThan(0);
    }
  });

  it('states the technical alpha limitation honestly', () => {
    const descriptor = describeReleaseStage('technical_alpha');
    expect(descriptor.label).toBe('TECHNICAL ALPHA');
    expect(descriptor.description).toBe(
      'Records and privacy controls are being tested. Personalized guidance is not available yet.',
    );
  });

  it('exposes the stage and limitation through role and label', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ReleaseStageBanner));
    });
    const banner = renderer.root.find(
      node => node.type === 'div' && node.props.accessibilityRole === 'summary',
    );
    expect(String(banner.props.accessibilityLabel)).toContain('Technical Alpha');
    expect(String(banner.props.accessibilityLabel)).toContain(
      'Personalized guidance is not available yet',
    );
    const text = renderedText(renderer);
    expect(text).toContain('TECHNICAL ALPHA');
    expect(text).toContain('Records and privacy controls are being tested.');
    await act(async () => { renderer.unmount(); });
  });

  it('keeps the banner visible in the loaded authenticated app', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Records, { user: confirmedUser }));
      await Promise.resolve();
    });
    const text = renderedText(renderer);
    expect(text).toContain('TECHNICAL ALPHA');
    expect(text).toContain('Records and privacy controls are being tested.');
    await act(async () => { renderer.unmount(); });
  });

  it('keeps the banner visible when owner loading fails', async () => {
    releaseMocks.loadProfile.mockRejectedValue(new Error('supabase misconfigured'));
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Records, { user: confirmedUser }));
      await Promise.resolve();
    });
    await act(async () => { await Promise.resolve(); });
    const text = renderedText(renderer);
    expect(text).toContain('TECHNICAL ALPHA');
    await act(async () => { renderer.unmount(); });
  });
});
