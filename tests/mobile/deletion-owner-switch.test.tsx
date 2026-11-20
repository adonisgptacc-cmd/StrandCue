import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeletionScreen } from '../../apps/mobile/src/screens/DeletionScreen';

const ownerMocks = vi.hoisted(() => ({
  status: vi.fn(),
  request: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function Host({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    Host.displayName = `Mock${tag}`;
    return Host;
  };
  return {
    ScrollView: host('main'),
    Text: host('span'),
    TextInput: host('input'),
    View: host('div'),
    Pressable: host('button'),
    StyleSheet: { create: (v: unknown) => v },
  };
});

vi.mock('expo-crypto', () => ({ randomUUID: () => 'operation-id' }));

vi.mock('../../apps/mobile/src/deletion-api', () => ({
  requestDeletion: ownerMocks.request,
  cancelDeletion: ownerMocks.cancel,
  statusDeletion: ownerMocks.status,
  deletionCancelMessage: (message: string) => message,
  deletionStatusMessage: (status: { accountStatus: string; deletionReason: string | null }) =>
    `status:${status.accountStatus}:reason:${status.deletionReason ?? 'none'}`,
  recentAuthMessage: (message: string) => message,
}));

const statusA = {
  accountStatus: 'active',
  tombstoneExists: false,
  deletedAt: null,
  purgeCompletedAt: null,
  deletionReason: 'A-server-reason',
};
const statusB = {
  accountStatus: 'active',
  tombstoneExists: false,
  deletedAt: null,
  purgeCompletedAt: null,
  deletionReason: null,
};

function text(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function reasonValue(renderer: ReactTestRenderer): string {
  return renderer.root.find(
    node => node.type === 'input' && node.props.accessibilityLabel === 'Reason for deletion',
  ).props.value as string;
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  vi.clearAllMocks();
  ownerMocks.request.mockResolvedValue({ accountStatus: 'deleting' });
  ownerMocks.cancel.mockResolvedValue({ accountStatus: 'active' });
});

describe('deletion screen owner switching', () => {
  it('renders no stale deletion status or reason on the first frame after an owner switch', async () => {
    ownerMocks.status.mockResolvedValueOnce(statusA).mockResolvedValue(statusB);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(DeletionScreen, { owner: 'owner-a' }));
    });
    expect(text(renderer)).toContain('A-server-reason');

    await act(async () => {
      renderer.root
        .find(node => node.type === 'input' && node.props.accessibilityLabel === 'Reason for deletion')
        .props.onChangeText('A-typed-reason');
    });
    expect(reasonValue(renderer)).toBe('A-typed-reason');

    await act(async () => {
      renderer.update(createElement(DeletionScreen, { owner: 'owner-b' }));
    });

    // First frame for the new owner: clean state, never A's data.
    expect(reasonValue(renderer)).toBe('');
    expect(text(renderer)).not.toContain('A-server-reason');
    expect(text(renderer)).not.toContain('A-typed-reason');
    expect(ownerMocks.status).toHaveBeenCalledTimes(2);
    await act(async () => {
      renderer.unmount();
    });
  });
});
