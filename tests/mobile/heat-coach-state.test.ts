import { describe, expect, it } from 'vitest';

import { createHeatCoachController } from '../../apps/mobile/src/heat-coach-state';
import type { HeatCoachReceipt } from '../../apps/mobile/src/heat-coach-api';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const digest = `sha256:${'a'.repeat(64)}`;
const publication = { publicationId: id, publicationDigest: digest };
const receipt = { assessmentId: id, status: 'needs_input', stale: false } as HeatCoachReceipt;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

describe('Heat Coach owner controller', () => {
  it('synchronously clears draft and result on owner change and ignores the old reply', async () => {
    const first = deferred<HeatCoachReceipt>();
    const calls: unknown[] = [];
    const controller = createHeatCoachController({ ownerKey: 'owner-a', publication,
      newOperationId: () => id, api: { createHeatCoachAssessment: command => { calls.push(command); return first.promise; } } });
    controller.editIntent({ method: { state: 'known', value: 'heated-air' } });
    const saving = controller.save();
    expect(controller.getState().phase).toBe('saving');
    controller.setOwner('owner-b');
    expect(controller.getState()).toMatchObject({ ownerKey: 'owner-b', phase: 'idle', receipt: null, pending: null });
    expect(controller.getState().intent.method).toEqual({ state: 'unknown' });
    first.resolve(receipt);
    await saving;
    expect(controller.getState().receipt).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('a newer request wins over a slower earlier request', async () => {
    const first = deferred<HeatCoachReceipt>();
    const second = deferred<HeatCoachReceipt>();
    let count = 0;
    const controller = createHeatCoachController({ ownerKey: 'owner-a', publication,
      newOperationId: () => crypto.randomUUID(),
      api: { createHeatCoachAssessment: () => (++count === 1 ? first.promise : second.promise) } });
    const oldSave = controller.save();
    controller.editIntent({ passes: { state: 'known', value: 2 } });
    const newSave = controller.save();
    second.resolve(receipt);
    await newSave;
    first.resolve({ ...receipt, assessmentId: crypto.randomUUID() });
    await oldSave;
    expect(controller.getState().receipt?.assessmentId).toBe(id);
  });

  it('reuses an operation id only for an unchanged retry and preserves unsent intent', async () => {
    const commands: { operationId: string; intent: unknown }[] = [];
    let next = 0;
    const controller = createHeatCoachController({ ownerKey: 'owner-a', publication,
      newOperationId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
      api: { createHeatCoachAssessment: async command => {
        commands.push(command as { operationId: string; intent: unknown });
        throw new Error('offline');
      } } });
    controller.editIntent({ setting: { state: 'known', value: ' Low ' } });
    await controller.save();
    expect(controller.getState().intent.setting).toEqual({ state: 'known', value: ' Low ' });
    await controller.retry();
    expect(commands[1]?.operationId).toBe(commands[0]?.operationId);
    controller.editIntent({ setting: { state: 'known', value: 'High' } });
    await controller.save();
    expect(commands[2]?.operationId).not.toBe(commands[0]?.operationId);
  });

  it('does not save twice after a confirmed result', async () => {
    let calls = 0;
    const controller = createHeatCoachController({ ownerKey: 'owner-a', publication,
      newOperationId: () => id,
      api: { createHeatCoachAssessment: async () => { calls += 1; return receipt; } } });
    await controller.save();
    controller.editIntent({ method: { state: 'unknown' } });
    await controller.save();
    expect(calls).toBe(1);
  });

  it('captures a detached intent snapshot before sending it', async () => {
    const zones: { region: 'front' | 'nape'; segment: 'roots' }[] = [{ region: 'front', segment: 'roots' }];
    const first = deferred<HeatCoachReceipt>();
    let sent: unknown;
    const controller = createHeatCoachController({ ownerKey: 'owner-a', publication,
      newOperationId: () => id,
      api: { createHeatCoachAssessment: command => { sent = command.intent.zones; return first.promise; } } });
    controller.editIntent({ zones });
    const saving = controller.save();
    zones[0] = { region: 'nape', segment: 'roots' };
    expect(sent).toEqual([{ region: 'front', segment: 'roots' }]);
    first.resolve(receipt);
    await saving;
  });
});
