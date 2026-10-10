import { createElement, StrictMode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Activities } from '../../apps/mobile/src/activities';
import { Shelf } from '../../apps/mobile/src/shelf';
import { Tools } from '../../apps/mobile/src/tools';
import { DeletionScreen } from '../../apps/mobile/src/screens/DeletionScreen';
import { ExportScreen } from '../../apps/mobile/src/screens/ExportScreen';

const mocks = vi.hoisted(() => ({
  activities: vi.fn(), shelf: vi.fn(), tools: vi.fn(), statusExport: vi.fn(), statusDeletion: vi.fn(), cancelDeletion: vi.fn(), requestExport: vi.fn(),
  storage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('react-native', () => {
  const host = (tag: string) => {
    function Host({ children, ...props }: { children?: unknown } & Record<string, unknown>) { return createElement(tag, props, children as never); }
    Host.displayName = `Mock${tag}`;
    return Host;
  };
  return { Text: host('span'), View: host('div'), ScrollView: host('main'), Pressable: host('button'), TextInput: host('input'), StyleSheet: { create: (value: unknown) => value } };
});
vi.mock('expo-crypto', () => ({ randomUUID: () => 'operation-id' }));
vi.mock('../../apps/mobile/src/client.ts', () => ({ secureStorage: mocks.storage }));
vi.mock('../../apps/mobile/src/activity-api.ts', () => ({ listActivities: mocks.activities, getActivity: vi.fn() }));
vi.mock('../../apps/mobile/src/shelf-api.ts', () => ({ listUserProducts: mocks.shelf, getUserProduct: vi.fn() }));
vi.mock('../../apps/mobile/src/tool-api.ts', () => ({ listUserTools: mocks.tools, getUserTool: vi.fn() }));
vi.mock('../../apps/mobile/src/activity-editor.tsx', () => ({ ActivityEditor: () => null }));
vi.mock('../../apps/mobile/src/shelf-editor.tsx', () => ({ ShelfEditor: () => null }));
vi.mock('../../apps/mobile/src/tool-editor.tsx', () => ({ ToolEditor: () => null }));
vi.mock('../../apps/mobile/src/export-api.ts', () => ({ statusExport: mocks.statusExport, requestExport: mocks.requestExport, downloadExport: vi.fn(), recentAuthMessage: (message: string) => message, exportStatusMessage: (status: { jobId: string }) => status.jobId }));
vi.mock('../../apps/mobile/src/export-delivery.ts', () => ({ ExportDeliveryError: class extends Error {}, shareExportDownload: vi.fn() }));

vi.mock('../../apps/mobile/src/deletion-api.ts', () => ({ statusDeletion: mocks.statusDeletion, cancelDeletion: mocks.cancelDeletion, requestDeletion: vi.fn(), recentAuthMessage: (message: string) => message, deletionStatusMessage: (status: { accountStatus: string }) => status.accountStatus }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function press(renderer: ReactTestRenderer, label: string) {
  renderer.root.find(node => node.type === 'button' && node.props.accessibilityLabel === label).props.onPress();
}
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.storage.getItem.mockResolvedValue(null);
  for (const load of [mocks.activities, mocks.shelf, mocks.tools]) load.mockResolvedValue({ items: [], nextCursor: null });
});

const lists = [
  { name: 'activities', Component: Activities, load: mocks.activities, reload: 'Reload activities', more: 'Load more activities', loading: 'Loading activities' },
  { name: 'shelf', Component: Shelf, load: mocks.shelf, reload: 'Reload shelf', more: 'Load more products', loading: 'Loading shelf' },
  { name: 'tools', Component: Tools, load: mocks.tools, reload: 'Reload tools', more: 'Load more tools', loading: 'Loading tools' },
];
describe('owner-scoped async screen lifecycles', () => {
  for (const entry of lists) {
    it(`restarts ${entry.name} after StrictMode effect cleanup and supports reload`, async () => {
      const pending = deferred<{ items: never[]; nextCursor: null }>();
      entry.load.mockReturnValueOnce(pending.promise);
      let renderer!: ReactTestRenderer;
      await act(async () => { renderer = create(createElement(StrictMode, null, createElement(entry.Component, { owner: '20000000-0000-4000-8000-000000000001' }))); });
      expect(entry.load).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(renderer.toJSON())).not.toContain(entry.loading);
      await act(async () => { press(renderer, entry.reload); });
      expect(entry.load).toHaveBeenCalledTimes(3);
      await act(async () => { renderer.unmount(); pending.resolve({ items: [], nextCursor: null }); await pending.promise; });
    });
    it(`appends ${entry.name} with its cursor without triggering another initial load`, async () => {
      const cursor = { id: 'next-page' };
      const item = (id: string, revision: number) => ({ id, revision, manualName: id, manualModel: id, availability: 'available' });
      entry.load.mockResolvedValueOnce({ items: [item('first-item', 111)], nextCursor: cursor })
        .mockResolvedValueOnce({ items: [item('second-item', 222)], nextCursor: null });
      let renderer!: ReactTestRenderer;
      await act(async () => { renderer = create(createElement(entry.Component, { owner: '20000000-0000-4000-8000-000000000001' })); });
      expect(entry.load).toHaveBeenCalledTimes(1);
      await act(async () => { press(renderer, entry.more); });
      expect(entry.load).toHaveBeenCalledTimes(2);
      expect(entry.load.mock.calls[1].at(-1)).toEqual({ cursor });
      const text = JSON.stringify(renderer.toJSON());
      const first = entry.name === 'activities' ? '111' : 'first-item';
      const second = entry.name === 'activities' ? '222' : 'second-item';
      expect(text).toContain(first);
      expect(text).toContain(second);
      expect(text.indexOf(first)).toBeLessThan(text.indexOf(second));
      await act(async () => { renderer.unmount(); });
    });
    it(`ignores late ${entry.name} results after an owner change`, async () => {
      const pending = deferred<{ items: { id: string; revision: number; manualName: string; manualModel: string; availability: string }[]; nextCursor: null }>();
      entry.load.mockReturnValueOnce(pending.promise);
      let renderer!: ReactTestRenderer;
      await act(async () => { renderer = create(createElement(entry.Component, { owner: '20000000-0000-4000-8000-000000000001' })); });
      await act(async () => { renderer.update(createElement(entry.Component, { owner: '20000000-0000-4000-8000-000000000002' })); });
      await act(async () => { pending.resolve({ items: [{ id: 'old', revision: 999, manualName: 'private-old-owner', manualModel: 'private-old-owner', availability: 'available' }], nextCursor: null }); await pending.promise; });
      expect(JSON.stringify(renderer.toJSON())).not.toContain('private-old-owner');
      expect(JSON.stringify(renderer.toJSON())).not.toContain('999');
      await act(async () => { renderer.unmount(); });
    });
  }
  it('never loads or displays an old owner export after switching owners', async () => {
    const oldStoredJob = deferred<string>();
    mocks.storage.getItem.mockReturnValueOnce(oldStoredJob.promise).mockResolvedValueOnce('owner-b-job');
    mocks.statusExport.mockImplementation(async (jobId: string) => ({ jobId, status: 'completed' }));
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(ExportScreen, { owner: '20000000-0000-4000-8000-000000000001' })); });
    await act(async () => { renderer.update(createElement(ExportScreen, { owner: '20000000-0000-4000-8000-000000000002' })); });
    await act(async () => { oldStoredJob.resolve('owner-a-private-job'); await oldStoredJob.promise; });
    expect(mocks.statusExport).not.toHaveBeenCalledWith('owner-a-private-job');
    expect(JSON.stringify(renderer.toJSON())).toContain('owner-b-job');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('owner-a-private-job');
    await act(async () => { renderer.unmount(); });
  });
  it('keeps the current deletion status when a StrictMode mount result arrives late', async () => {
    const oldStatus = deferred<{ accountStatus: string }>();
    mocks.statusDeletion.mockReturnValueOnce(oldStatus.promise).mockResolvedValueOnce({ accountStatus: 'deleting' });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(StrictMode, null, createElement(DeletionScreen))); });
    await act(async () => { oldStatus.resolve({ accountStatus: 'active' }); await oldStatus.promise; });
    expect(JSON.stringify(renderer.toJSON())).toContain('Cancel deletion');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Deletion confirmation');
    await act(async () => { renderer.unmount(); });
  });
  it('does not refresh deletion after an in-flight cancel finishes on an unmounted screen', async () => {
    mocks.statusDeletion.mockResolvedValue({ accountStatus: 'deleting' });
    const cancel = deferred<void>();
    mocks.cancelDeletion.mockReturnValue(cancel.promise);
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(DeletionScreen)); });
    await act(async () => { press(renderer, 'Cancel deletion'); });
    await act(async () => { renderer.unmount(); });
    await act(async () => { cancel.resolve(); await cancel.promise; });
    expect(mocks.statusDeletion).toHaveBeenCalledTimes(1);
  });
  it('does not persist or refresh an export receipt after its owner leaves', async () => {
    const receipt = deferred<{ jobId: string }>();
    mocks.requestExport.mockReturnValue(receipt.promise);
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(ExportScreen, { owner: '20000000-0000-4000-8000-000000000001' })); });
    await act(async () => { press(renderer, 'Create export'); });
    await act(async () => { renderer.unmount(); });
    await act(async () => { receipt.resolve({ jobId: 'owner-a-job' }); await receipt.promise; });
    expect(mocks.storage.setItem).not.toHaveBeenCalled();
    expect(mocks.statusExport).not.toHaveBeenCalled();
  });

  it('blocks deletion requests until the initial account status is known', async () => {
    const initial = deferred<{ accountStatus: string }>();
    mocks.statusDeletion.mockReturnValue(initial.promise);
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(DeletionScreen)); });
    expect(renderer.root.findAll(node => node.type === 'button')[0].props.disabled).toBe(true);
    await act(async () => { renderer.unmount(); });
    await act(async () => { initial.resolve({ accountStatus: 'active' }); await initial.promise; });
  });

});
