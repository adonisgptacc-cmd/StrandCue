import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

import { HeatCoachIntent } from '../../apps/mobile/src/HeatCoachIntent';
import { emptyHeatCoachIntent } from '../../apps/mobile/src/heat-coach-state';
import type { HeatCoachIntent as Intent } from '../../apps/mobile/src/heat-coach-api';

vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);
const original = console.error.bind(console);
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    original(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());

const toolId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function render(intent: Intent, onChange = vi.fn(), onOpenDestination = vi.fn()) {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(HeatCoachIntent, {
    ownerKey: 'owner-a', intent, ownedTools: [{ ownerItemId: toolId, label: 'My dryer' }],
    onChange, onAssess: vi.fn(), onOpenDestination, saving: false,
  })); });
  const control = (label: string) => renderer.root.find(node => node.props.accessibilityLabel === label && typeof node.type === 'string');
  return { renderer, control, onChange, onOpenDestination };
}

describe('Heat Coach intent form', () => {
  it('starts with explicit unknown choices and keeps a named setting separate from temperature', async () => {
    const intent = emptyHeatCoachIntent();
    const { renderer, control, onChange } = await render(intent);
    expect(JSON.stringify(renderer.toJSON())).toContain('Not sure');
    await act(async () => control('Heat method: Heated air').props.onPress());
    expect(onChange).toHaveBeenCalledWith({ method: { state: 'known', value: 'heated-air' } });
    await act(async () => control('Owned tool: My dryer').props.onPress());
    expect(onChange).toHaveBeenCalledWith({ toolOwnerItemId: toolId });
    await act(async () => control('Named setting').props.onChangeText('Low'));
    expect(onChange).toHaveBeenCalledWith({ setting: { state: 'known', value: 'Low' } });
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ temperature: expect.objectContaining({ state: 'known' }) }));
  });

  it('records numeric temperature with unit and passes without guessing blank fields', async () => {
    const { control, onChange } = await render(emptyHeatCoachIntent());
    await act(async () => control('Temperature number').props.onChangeText('120'));
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ temperature: expect.objectContaining({ state: 'known' }) }));
    await act(async () => control('Temperature unit: Celsius').props.onPress());
    expect(onChange).toHaveBeenCalledWith({ temperature: { state: 'known', value: { value: 120, unit: 'C' } } });
    await act(async () => control('Passes').props.onChangeText('2'));
    expect(onChange).toHaveBeenCalledWith({ passes: { state: 'known', value: 2 } });
  });

  it('updates an already selected numeric temperature when its number changes', async () => {
    const selected = { ...emptyHeatCoachIntent(), temperature: { state: 'known' as const,
      value: { value: 120, unit: 'C' as const } } };
    const { control, onChange } = await render(selected);
    await act(async () => control('Temperature number').props.onChangeText('130'));
    expect(onChange).toHaveBeenCalledWith({ temperature: { state: 'known', value: { value: 130, unit: 'C' } } });
  });

  it('offers setup paths for facts the owner has not recorded', async () => {
    const { control, onOpenDestination } = await render(emptyHeatCoachIntent());
    await act(async () => control('Set up tool in My Tools').props.onPress());
    await act(async () => control('Update current condition in My Hair').props.onPress());
    await act(async () => control('Add protection product in My Shelf').props.onPress());
    expect(onOpenDestination).toHaveBeenNthCalledWith(1, 'my_tools');
    expect(onOpenDestination).toHaveBeenNthCalledWith(2, 'my_hair');
    expect(onOpenDestination).toHaveBeenNthCalledWith(3, 'my_shelf');
  });

  it('clears a stale known temperature when its visible number becomes invalid', async () => {
    const selected = { ...emptyHeatCoachIntent(), temperature: { state: 'known' as const,
      value: { value: 120, unit: 'C' as const } } };
    const { control, onChange } = await render(selected);
    await act(async () => control('Temperature number').props.onChangeText('999'));
    expect(onChange).toHaveBeenCalledWith({ temperature: { state: 'unknown' } });
  });

  it('clears local numeric text immediately when the owner changes', async () => {
    const selected = { ...emptyHeatCoachIntent(), temperature: { state: 'known' as const,
      value: { value: 120, unit: 'C' as const } } };
    const { renderer } = await render(selected);
    await act(async () => renderer.update(createElement(HeatCoachIntent, {
      ownerKey: 'owner-b', intent: emptyHeatCoachIntent(), ownedTools: [],
      onChange: vi.fn(), onAssess: vi.fn(), saving: false,
    })));
    const number = renderer.root.find(node => node.props.accessibilityLabel === 'Temperature number' && typeof node.type === 'string');
    expect(number.props.value).toBe('');
  });

  it('announces the selected owned tool and lets the owner remove an area', async () => {
    const selected = { ...emptyHeatCoachIntent(), toolOwnerItemId: toolId,
      zones: [{ region: 'front' as const, segment: 'roots' as const }] };
    const { control, onChange } = await render(selected);
    expect(control('Owned tool: My dryer').props.accessibilityState.selected).toBe(true);
    await act(async () => control('Remove area: front roots').props.onPress());
    expect(onChange).toHaveBeenCalledWith({ zones: [] });
  });

  it('lets the owner explicitly mark a number as not sure', async () => {
    const selected = { ...emptyHeatCoachIntent(), passes: { state: 'known' as const, value: 2 } };
    const { control, onChange } = await render(selected);
    await act(async () => control('Passes: Not sure').props.onPress());
    expect(onChange).toHaveBeenCalledWith({ passes: { state: 'unknown' } });
  });
});
