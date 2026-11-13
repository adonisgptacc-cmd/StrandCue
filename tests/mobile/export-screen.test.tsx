import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportScreen } from '../../apps/mobile/src/screens/ExportScreen';
import { ExportDeliveryError } from '../../apps/mobile/src/export-delivery';

const mocks = vi.hoisted(() => ({
  uuid: vi.fn(),
  store: new Map<string, string>(),
  failRestore: false,
  holdPersist: false,
  releasePersist: null as null | (() => void),
  request: vi.fn(),
  status: vi.fn(),
  download: vi.fn(),
  share: vi.fn(),
}));
vi.mock('react-native', () => {
  const host = (tag: string) => {
    function Host({ children, ...props }: { children?: unknown } & Record<string, unknown>) { return createElement(tag, props, children as never); }
    Host.displayName = `Mock${tag}`;
    return Host;
  };
  return { ScrollView: host('main'), Text: host('span'), View: host('div'), Pressable: host('button'), StyleSheet: { create: (v: unknown) => v } };
});
vi.mock('expo-crypto', () => ({ randomUUID: mocks.uuid }));
vi.mock('../../apps/mobile/src/client.ts', () => ({
  secureStorage: {
    getItem: async (key: string) => {
      if (mocks.failRestore) throw new Error('storage gone');
      return mocks.store.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      if (mocks.holdPersist) await new Promise<void>((resolve) => { mocks.releasePersist = resolve; });
      else mocks.store.set(key, value);
    },
  },
}));
vi.mock('../../apps/mobile/src/export-api', () => ({
  downloadExport: mocks.download,
  exportStatusMessage: (s: { status?: string; recordCount?: number }) => `status:${s.status}:${s.recordCount ?? ''}`,
  recentAuthMessage: (m: string) => m,
  requestExport: mocks.request,
  statusExport: mocks.status,
}));
vi.mock('../../apps/mobile/src/export-delivery', () => ({
  ExportDeliveryError: class extends Error {},
  shareExportDownload: mocks.share,
}));

let consoleSpy: ReturnType<typeof vi.spyOn>;
const originalConsoleError = console.error.bind(console);
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  consoleSpy = vi.spyOn(console, 'error');
});
afterAll(() => consoleSpy.mockRestore());
beforeEach(() => {
  vi.resetAllMocks();
  mocks.store.clear();
  mocks.uuid.mockReturnValue('operation-id');
  consoleSpy.mockImplementation((message?: unknown, ...details: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...details);
  });
});

async function renderScreen(owner = 'owner-a') {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(ExportScreen, { owner })); });
  return renderer;
}

function spans(renderer: ReactTestRenderer): string {
  return renderer.root.findAll((n) => n.type === 'span')
    .map((n) => (Array.isArray(n.children) ? n.children.join('') : '')).join('\n');
}

function press(renderer: ReactTestRenderer, label: string) {
  renderer.root.find((n) => n.type === 'button' && n.props.accessibilityLabel === label).props.onPress();
}

const JOB = 'f0000000-0000-4000-8000-000000000001';

describe('export screen promise copy', () => {
  it('names consent and guidance history as part of the complete copy', async () => {
    const renderer = await renderScreen();
    const copy = spans(renderer);
    expect(copy).toMatch(/consent/i);
    expect(copy).toMatch(/guidance|recommendation|protocol/i);
    expect(copy).toMatch(/export receipts|service-internal|not included/i);
    await act(async () => renderer.unmount());
  });

  it('claims catalogue facts for the JSON export, not CSV', async () => {
    const renderer = await renderScreen();
    const copy = spans(renderer);
    expect(copy).toMatch(/catalogue facts are included in the JSON export/i);
    await act(async () => renderer.unmount());
  });

  it('requests an export, shows status and offers download', async () => {
    mocks.request.mockResolvedValue({ jobId: JOB, status: 'completed', recordCount: 7, expiresAt: '2024-03-02T10:00:00Z' });
    mocks.status.mockResolvedValue({ status: 'completed', recordCount: 7 });
    const renderer = await renderScreen();
    await act(async () => press(renderer, 'Create export'));
    expect(mocks.request).toHaveBeenCalledWith('operation-id', 'json');
    expect(spans(renderer)).toContain('status:completed:7');
    await act(async () => press(renderer, 'Download export'));
    expect(mocks.download).toHaveBeenCalledWith(JOB);
    expect(mocks.share).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  it('requests a CSV export after switching format', async () => {
    mocks.request.mockResolvedValue({ jobId: JOB, status: 'completed', recordCount: 7, expiresAt: '2024-03-02T10:00:00Z' });
    mocks.status.mockResolvedValue({ status: 'completed', recordCount: 7 });
    const renderer = await renderScreen();
    await act(async () => press(renderer, 'Export format: csv'));
    await act(async () => press(renderer, 'Create export'));
    expect(mocks.request).toHaveBeenCalledWith('operation-id', 'csv');
    await act(async () => renderer.unmount());
  });

  it('surfaces request failures and refreshes status', async () => {
    mocks.request.mockRejectedValueOnce(new Error('recent-auth-required'));
    const renderer = await renderScreen();
    await act(async () => press(renderer, 'Create export'));
    expect(spans(renderer)).toMatch(/recent-auth-required/i);
    mocks.request.mockResolvedValue({ jobId: JOB, status: 'completed', recordCount: 7, expiresAt: '2024-03-02T10:00:00Z' });
    mocks.status.mockResolvedValueOnce({ status: 'completed', recordCount: 7 });
    await act(async () => press(renderer, 'Create export'));
    mocks.status.mockRejectedValueOnce(new Error('status unavailable'));
    await act(async () => press(renderer, 'Refresh status'));
    expect(spans(renderer)).toMatch(/status unavailable/i);
    await act(async () => renderer.unmount());
  });

  it('skips refresh when unmounted while persisting the job', async () => {
    mocks.request.mockResolvedValueOnce({ jobId: JOB, status: 'completed', recordCount: 7, expiresAt: '2024-03-02T10:00:00Z' });
    mocks.holdPersist = true;
    const renderer = await renderScreen();
    act(() => { press(renderer, 'Create export'); });
    expect(spans(renderer)).toMatch(/Working…/);
    await act(async () => {});
    await act(async () => renderer.unmount());
    await act(async () => { mocks.releasePersist?.(); });
    mocks.holdPersist = false;
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for an empty request failure', async () => {
    mocks.request.mockRejectedValueOnce({});
    const renderer = await renderScreen();
    await act(async () => press(renderer, 'Create export'));
    expect(spans(renderer)).toMatch(/Export could not be requested/i);
    await act(async () => renderer.unmount());
  });

  it('offers no download without a job', async () => {
    // Pins the `if (!jobId) return` contract at the UI layer: the Download
    // button only renders once a job exists, so the early return is
    // unreachable by construction.
    const renderer = await renderScreen();
    expect(renderer.root.findAll((n) => n.type === 'button' && n.props.accessibilityLabel === 'Download export')).toEqual([]);
    await act(async () => renderer.unmount());
  });

  it('drops a late request failure after unmount', async () => {
    let rejectRequest!: (reason: unknown) => void;
    mocks.request.mockReturnValueOnce(new Promise((_, reject) => { rejectRequest = reject; }));
    const renderer = await renderScreen();
    act(() => { press(renderer, 'Create export'); });
    await act(async () => renderer.unmount());
    await act(async () => { rejectRequest(new Error('boom')); });
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('restores the last export and reports download failures', async () => {
    mocks.store.set('strandcue-export-last-owner-a', JOB);
    mocks.status.mockResolvedValue({ status: 'completed', recordCount: 7 });
    const renderer = await renderScreen();
    expect(mocks.status).toHaveBeenCalledWith(JOB);
    expect(spans(renderer)).toContain('status:completed:7');
    mocks.download.mockResolvedValue({ jobId: JOB, document: {} });
    // The module mock replaces the zero-arg real constructor with a plain
    // Error subclass at runtime, so the message travels via the cast.
    const DeliveryErrorWithMessage = ExportDeliveryError as unknown as new (message: string) => Error;
    mocks.share.mockRejectedValueOnce(new DeliveryErrorWithMessage('share sheet unavailable'));
    await act(async () => press(renderer, 'Download export'));
    expect(spans(renderer)).toMatch(/share sheet unavailable/i);
    await act(async () => renderer.unmount());
  });

  it('drops a stale status response when refreshes overlap', async () => {
    mocks.request.mockResolvedValue({ jobId: JOB, status: 'completed', recordCount: 7, expiresAt: '2024-03-02T10:00:00Z' });
    mocks.status.mockResolvedValue({ status: 'completed', recordCount: 7 });
    const renderer = await renderScreen();
    await act(async () => press(renderer, 'Create export'));
    mocks.status.mockResolvedValueOnce({ status: 'completed', recordCount: 1 });
    mocks.status.mockResolvedValueOnce({ status: 'completed', recordCount: 2 });
    await act(async () => { press(renderer, 'Refresh status'); press(renderer, 'Refresh status'); });
    expect(spans(renderer)).toContain('status:completed:2');
    await act(async () => renderer.unmount());
  });

  it('ignores a late status response after unmount and reports a lost restore', async () => {
    mocks.request.mockResolvedValue({ jobId: JOB, status: 'completed', recordCount: 7, expiresAt: '2024-03-02T10:00:00Z' });
    mocks.status.mockResolvedValue({ status: 'completed', recordCount: 7 });
    const renderer = await renderScreen();
    await act(async () => press(renderer, 'Create export'));
    let resolveStatus!: (value: unknown) => void;
    mocks.status.mockReturnValueOnce(new Promise((resolve) => { resolveStatus = resolve; }));
    act(() => { press(renderer, 'Refresh status'); });
    await act(async () => renderer.unmount());
    await act(async () => { resolveStatus({ status: 'completed', recordCount: 9 }); });

    mocks.failRestore = true;
    const revived = await renderScreen();
    expect(spans(revived)).toMatch(/could not be restored/i);
    mocks.failRestore = false;
    await act(async () => revived.unmount());
  });
});
