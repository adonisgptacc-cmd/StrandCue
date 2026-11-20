import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExportScreen } from '../../apps/mobile/src/screens/ExportScreen';

const mocks = vi.hoisted(() => ({
  downloadExport: vi.fn(),
  deletedFiles: [] as string[],
  fileWrites: [] as { uri: string; contents: string }[],
  shareAsync: vi.fn(),
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
    Text: host('span'), View: host('div'), ScrollView: host('main'), Pressable: host('button'),
    StyleSheet: { create: (value: unknown) => value },
  };
});
vi.mock('expo-crypto', () => ({ randomUUID: () => 'operation-id' }));
vi.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class MockFile {
    uri: string;
    constructor(_directory: string, name: string) { this.uri = `file:///cache/${name}`; }
    write(contents: string) { mocks.fileWrites.push({ uri: this.uri, contents }); }
    delete() { mocks.deletedFiles.push(this.uri); }
  },
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(async () => true),
  shareAsync: mocks.shareAsync,
}));
vi.mock('../../apps/mobile/src/client.ts', () => ({
  secureStorage: { getItem: vi.fn(async () => 'f0000000-0000-4000-8000-000000000001'), setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('../../apps/mobile/src/export-api.ts', () => ({
  statusExport: vi.fn(async (jobId: string) => ({ jobId, status: 'completed', format: 'json' })),
  requestExport: vi.fn(),
  downloadExport: mocks.downloadExport,
  recentAuthMessage: (message: string) => message,
  exportStatusMessage: () => 'Ready to download',
}));

function press(renderer: ReactTestRenderer, label: string) {
  renderer.root.find(node => node.type === 'button' && node.props.accessibilityLabel === label).props.onPress();
}

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.deletedFiles.length = 0;
  mocks.fileWrites.length = 0;
  mocks.downloadExport.mockResolvedValue({
    jobId: 'f0000000-0000-4000-8000-000000000001',
    format: 'json',
    expiresAt: '2026-10-11T10:00:00.000Z',
    document: { passport: { revision: 2 } },
  });
  mocks.shareAsync.mockResolvedValue(undefined);
});

describe('export file delivery', () => {
  it('writes a named JSON file and opens the native share sheet', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(ExportScreen, { owner: '20000000-0000-4000-8000-000000000001' })); });

    await act(async () => { press(renderer, 'Download export'); });

    expect(mocks.fileWrites).toEqual([{
      uri: 'file:///cache/strandcue-export-f0000000-0000-4000-8000-000000000001.json',
      contents: `${JSON.stringify({ passport: { revision: 2 } }, null, 2)}\n`,
    }]);
    expect(mocks.shareAsync).toHaveBeenCalledWith(
      'file:///cache/strandcue-export-f0000000-0000-4000-8000-000000000001.json',
      expect.objectContaining({ mimeType: 'application/json' }),
    );
    expect(mocks.deletedFiles).toEqual([
      'file:///cache/strandcue-export-f0000000-0000-4000-8000-000000000001.json',
    ]);
  });

  it('preserves a CSV payload and uses a CSV filename and MIME type', async () => {
    mocks.downloadExport.mockResolvedValueOnce({
      jobId: 'f0000000-0000-4000-8000-000000000001',
      format: 'csv',
      expiresAt: '2026-10-11T10:00:00.000Z',
      document: 'kind,date\nwash,2026-10-10\n',
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(ExportScreen, { owner: '20000000-0000-4000-8000-000000000001' })); });

    await act(async () => { press(renderer, 'Download export'); });

    expect(mocks.fileWrites).toEqual([{
      uri: 'file:///cache/strandcue-export-f0000000-0000-4000-8000-000000000001.csv',
      contents: 'kind,date\nwash,2026-10-10\n',
    }]);
    expect(mocks.shareAsync).toHaveBeenCalledWith(expect.stringMatching(/\.csv$/), expect.objectContaining({ mimeType: 'text/csv' }));
  });

  it('shows a retryable error when the native share sheet cannot open', async () => {
    mocks.shareAsync.mockRejectedValueOnce(new Error('native detail'));
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(ExportScreen, { owner: '20000000-0000-4000-8000-000000000001' })); });

    await act(async () => { press(renderer, 'Download export'); });

    const alert = renderer.root.find(node => node.type === 'span' && node.props.accessibilityRole === 'alert');
    expect(alert.props.children).toContain('could not be prepared or shared');
    expect(alert.props.children).toContain('try again');
    expect(alert.props.children).not.toContain('native detail');
  });
});
