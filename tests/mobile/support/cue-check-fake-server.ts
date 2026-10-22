import type { CueCheckApi, CueCheckDetail, CueCheckPage, CueCheckReceipt } from '../../../apps/mobile/src/cue-check-api';
import { CueCheckError } from '../../../apps/mobile/src/cue-check-errors';

/**
 * An in-memory stand-in for the five Cue Check RPCs. It mirrors the database's
 * observable rules (idempotent operations, one active check per execution and
 * timing, expected-revision checks, voided records, keyset paging) so UI
 * journeys exercise real sequences without a network.
 */

type Json = Record<string, unknown>;

export interface FakeExecution {
  readonly executionId: string;
  readonly status: 'completed' | 'abandoned' | 'in_progress' | 'paused';
  readonly confirmedSteps?: readonly Json[];
}

interface StoredRevision {
  revisionId: string;
  sequence: number;
  kind: 'create' | 'correct' | 'void';
  observation: Json | null;
  correctsId: string | null;
  correctionReason: string | null;
  voidReason: string | null;
  receivedAt: string;
}

interface StoredRecord {
  receipt: Json;
  revisions: StoredRevision[];
  rowId: string;
}

const RUN_ID = '55555555-5555-4555-8555-555555555555';

function uuid(prefix: string, n: number): string {
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function createFakeCueServer(executions: readonly FakeExecution[]) {
  const records = new Map<string, StoredRecord>();
  const operations = new Map<string, { payload: string; result: Json }>();
  const calls: { name: string; args: unknown }[] = [];
  const gates = new Map<string, Promise<void>>();
  let counter = 0;
  let offline = false;
  let clockSecond = 0;

  const tick = (): string => {
    clockSecond += 1;
    const minutes = Math.floor(clockSecond / 60);
    return `2026-10-22T14:${String(minutes).padStart(2, '0')}:${String(clockSecond % 60).padStart(2, '0')}.000000+00:00`;
  };

  const enter = async (name: string, args: unknown): Promise<void> => {
    calls.push({ name, args });
    const gate = gates.get(name);
    if (gate !== undefined) {
      gates.delete(name);
      await gate;
    }
    if (offline || failures.delete(name)) throw new CueCheckError('offline');
  };

  const receiptOf = (record: StoredRecord): CueCheckReceipt =>
    JSON.parse(JSON.stringify(record.receipt)) as CueCheckReceipt;

  const idempotent = (opId: string, payload: unknown, build: () => Json): CueCheckReceipt => {
    const text = JSON.stringify(payload);
    const prior = operations.get(opId);
    if (prior !== undefined) {
      if (prior.payload !== text) throw new CueCheckError('operation-conflict');
      return prior.result as unknown as CueCheckReceipt;
    }
    const result = build();
    operations.set(opId, { payload: text, result });
    return result as unknown as CueCheckReceipt;
  };

  const lose = new Set<string>();
  const failures = new Set<string>();
  const raw: CueCheckApi = {
    async recordCueCheck(command) {
      const c = command as { operationId: string; executionId: string; observation: Json };
      await enter('record', c);
      return idempotent(c.operationId, c, () => {
        const execution = executions.find(entry => entry.executionId === c.executionId);
        if (execution === undefined) throw new CueCheckError('execution-not-found');
        if (execution.status !== 'completed' && execution.status !== 'abandoned') {
          throw new CueCheckError('execution-not-terminal');
        }
        const timing = c.observation.timing as string;
        const clash = [...records.values()].some(
          record =>
            record.receipt.executionId === c.executionId &&
            record.receipt.timing === timing &&
            record.receipt.lifecycle === 'active',
        );
        if (clash) throw new CueCheckError('duplicate-active');
        counter += 1;
        const receivedAt = tick();
        const recordId = uuid('77777777', counter);
        const receipt: Json = {
          recordId,
          executionId: c.executionId,
          recommendationRunId: RUN_ID,
          goal: 'basic_wash',
          timing,
          lifecycle: 'active',
          revision: 1,
          observedAt: c.observation.observedAt,
          receivedAt,
          observation: c.observation,
          confirmedSteps: execution.confirmedSteps ?? [],
          executionStatus: execution.status,
          createdAt: receivedAt,
          updatedAt: receivedAt,
        };
        records.set(recordId, {
          receipt,
          rowId: uuid('cccccccc', counter),
          revisions: [
            {
              revisionId: uuid('bbbbbbbb', counter * 100 + 1),
              sequence: 1,
              kind: 'create',
              observation: c.observation,
              correctsId: null,
              correctionReason: null,
              voidReason: null,
              receivedAt,
            },
          ],
        });
        return receipt;
      });
    },
    async correctCueCheck(command) {
      const c = command as {
        operationId: string;
        recordId: string;
        expectedRevision: number;
        observation: Json;
        reason: string;
      };
      await enter('correct', c);
      return idempotent(c.operationId, c, () => {
        const record = records.get(c.recordId);
        if (record === undefined) throw new CueCheckError('record-not-found');
        if (record.receipt.lifecycle === 'voided') throw new CueCheckError('record-voided');
        if (record.receipt.revision !== c.expectedRevision) throw new CueCheckError('revision-conflict');
        if (JSON.stringify(record.receipt.observation) === JSON.stringify(c.observation)) {
          throw new CueCheckError('no-op-correction');
        }
        const head = record.revisions[record.revisions.length - 1]!;
        const receivedAt = tick();
        record.revisions.push({
          revisionId: uuid('bbbbbbbb', counter * 100 + record.revisions.length + 1),
          sequence: record.revisions.length + 1,
          kind: 'correct',
          observation: c.observation,
          correctsId: head.revisionId,
          correctionReason: c.reason,
          voidReason: null,
          receivedAt,
        });
        record.receipt = {
          ...record.receipt,
          revision: (record.receipt.revision as number) + 1,
          observation: c.observation,
          observedAt: c.observation.observedAt,
          receivedAt,
          updatedAt: receivedAt,
        };
        return record.receipt;
      });
    },
    async voidCueCheck(command) {
      const c = command as { operationId: string; recordId: string; expectedRevision: number; reason: string };
      await enter('void', c);
      return idempotent(c.operationId, c, () => {
        const record = records.get(c.recordId);
        if (record === undefined) throw new CueCheckError('record-not-found');
        if (record.receipt.lifecycle === 'voided') throw new CueCheckError('record-voided');
        if (record.receipt.revision !== c.expectedRevision) throw new CueCheckError('revision-conflict');
        const head = record.revisions[record.revisions.length - 1]!;
        const receivedAt = tick();
        record.revisions.push({
          revisionId: uuid('bbbbbbbb', counter * 100 + record.revisions.length + 1),
          sequence: record.revisions.length + 1,
          kind: 'void',
          observation: null,
          correctsId: head.revisionId,
          correctionReason: null,
          voidReason: c.reason,
          receivedAt,
        });
        record.receipt = {
          ...record.receipt,
          revision: (record.receipt.revision as number) + 1,
          lifecycle: 'voided',
          receivedAt,
          updatedAt: receivedAt,
        };
        return record.receipt;
      });
    },
    async listCueChecks(query) {
      const q = query as { limit: number; cursor: { createdAt: string; id: string } | null };
      await enter('list', q);
      const ordered = [...records.values()].sort((left, right) => {
        const a = String(left.receipt.createdAt);
        const b = String(right.receipt.createdAt);
        return a === b ? (left.rowId < right.rowId ? 1 : -1) : a < b ? 1 : -1;
      });
      const start = q.cursor === null ? 0 : ordered.findIndex(record => record.rowId === q.cursor!.id) + 1;
      const slice = ordered.slice(start, start + q.limit);
      const last = slice[slice.length - 1];
      const more = start + q.limit < ordered.length;
      const page = {
        items: slice.map(receiptOf),
        nextCursor: more && last !== undefined ? { createdAt: String(last.receipt.createdAt), id: last.rowId } : null,
      };
      return page as unknown as CueCheckPage;
    },
    async getCueCheck(recordId) {
      await enter('get', recordId);
      const record = records.get(recordId as string);
      if (record === undefined) throw new CueCheckError('record-not-found');
      const revisions = record.revisions.map((revision, index) => ({
        ...revision,
        state:
          revision.kind === 'void'
            ? null
            : index === record.revisions.length - 1
              ? record.receipt.lifecycle
              : record.revisions[index + 1]?.kind === 'void'
                ? 'voided'
                : 'corrected',
      }));
      return { ...receiptOf(record), revisions } as unknown as CueCheckDetail;
    },
  };

  // A response can be lost after the server committed: run the call, then fail.
  const wrap = <A extends unknown[], R>(name: string, call: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      const result = await call(...args);
      if (lose.delete(name)) throw new CueCheckError('offline');
      return result;
    };
  const api: CueCheckApi = {
    recordCueCheck: wrap('record', raw.recordCueCheck),
    correctCueCheck: wrap('correct', raw.correctCueCheck),
    voidCueCheck: wrap('void', raw.voidCueCheck),
    listCueChecks: wrap('list', raw.listCueChecks),
    getCueCheck: wrap('get', raw.getCueCheck),
  };

  return {
    api,
    calls,
    records,
    callsNamed: (name: string) => calls.filter(call => call.name === name),
    setOffline: (value: boolean) => {
      offline = value;
    },
    /** Hold the next call to `name` until the returned function is invoked. */
    hold(name: string): () => void {
      let release: () => void = () => undefined;
      gates.set(
        name,
        new Promise<void>(resolve => {
          release = resolve;
        }),
      );
      return release;
    },
    /** The next call to `name` fails as offline before reaching the server. */
    failNext(name: string): void {
      failures.add(name);
    },
    /** The server commits the next call to `name`, but its response never arrives. */
    loseResponse(name: string): void {
      lose.add(name);
    },
    /** Another session corrects a record: a coherent new revision, so the history stays valid. */
    changeElsewhere(recordId: string): void {
      const record = records.get(recordId)!;
      const head = record.revisions[record.revisions.length - 1]!;
      const receivedAt = tick();
      const observation = { ...(record.receipt.observation as Json), notes: 'changed on another device' };
      record.revisions.push({
        revisionId: uuid('bbbbbbbb', 9000 + record.revisions.length),
        sequence: record.revisions.length + 1,
        kind: 'correct',
        observation,
        correctsId: head.revisionId,
        correctionReason: 'Changed elsewhere',
        voidReason: null,
        receivedAt,
      });
      record.receipt = { ...record.receipt, revision: (record.receipt.revision as number) + 1, observation, receivedAt, updatedAt: receivedAt };
    },
    /** Another session changes a record behind the owner's back. */
    touch(recordId: string, change: Json): void {
      const record = records.get(recordId)!;
      record.receipt = { ...record.receipt, ...change };
    },
  };
}
