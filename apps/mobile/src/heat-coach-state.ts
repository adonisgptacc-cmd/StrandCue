import type { HeatCoachIntent, HeatCoachReceipt } from './heat-coach-api';
import { HeatCoachError, type HeatCoachErrorCode } from './heat-coach-errors';

export type HeatCoachPhase = 'idle' | 'editing' | 'saving' | 'ready' | 'failed';

export interface HeatCoachState {
  readonly ownerKey: string;
  readonly ownerEpoch: number;
  readonly phase: HeatCoachPhase;
  readonly intent: HeatCoachIntent;
  readonly receipt: HeatCoachReceipt | null;
  readonly pending: { readonly operationId: string; readonly fingerprint: string } | null;
  readonly activeRequestId: number | null;
  readonly failure: HeatCoachErrorCode | null;
}

export interface HeatCoachCommand {
  readonly operationId: string;
  readonly publicationId: string;
  readonly publicationDigest: string;
  readonly intent: HeatCoachIntent;
}

export interface HeatCoachController {
  readonly getState: () => HeatCoachState;
  readonly subscribe: (listener: (state: HeatCoachState) => void) => () => void;
  readonly setOwner: (ownerKey: string) => void;
  readonly editIntent: (patch: Partial<HeatCoachIntent>) => void;
  readonly save: () => Promise<void>;
  readonly retry: () => Promise<void>;
}

export interface HeatCoachControllerOptions {
  readonly ownerKey: string;
  readonly publication: { readonly publicationId: string; readonly publicationDigest: string };
  readonly api: { readonly createHeatCoachAssessment: (command: HeatCoachCommand) => Promise<HeatCoachReceipt> };
  readonly newOperationId: () => string;
}

const unknown = <T>() => Object.freeze({ state: 'unknown' as const }) as T;
const detach = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const freezeDeep = <T,>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) freezeDeep(nested);
    Object.freeze(value);
  }
  return value;
};

export function emptyHeatCoachIntent(): HeatCoachIntent {
  return Object.freeze({
    method: unknown<HeatCoachIntent['method']>(), toolOwnerItemId: null, productOwnerItemId: null,
    temperature: unknown<HeatCoachIntent['temperature']>(), setting: unknown<HeatCoachIntent['setting']>(),
    passes: unknown<HeatCoachIntent['passes']>(), durationMinutes: unknown<HeatCoachIntent['durationMinutes']>(),
    zones: Object.freeze([]) as unknown as HeatCoachIntent['zones'],
  });
}

export function initialHeatCoachState(ownerKey: string, ownerEpoch = 0): HeatCoachState {
  return Object.freeze({ ownerKey, ownerEpoch, phase: 'idle', intent: emptyHeatCoachIntent(),
    receipt: null, pending: null, activeRequestId: null, failure: null });
}

/** Holds the unsent intent locally; only a validated API call can create an assessment. */
export function createHeatCoachController(options: HeatCoachControllerOptions): HeatCoachController {
  let state = initialHeatCoachState(options.ownerKey);
  let sequence = 0;
  const listeners = new Set<(state: HeatCoachState) => void>();
  const publish = (next: HeatCoachState) => {
    state = Object.freeze(next);
    for (const listener of [...listeners]) listener(state);
  };
  const editIntent = (patch: Partial<HeatCoachIntent>) => {
    const intent = freezeDeep(detach({ ...state.intent, ...patch }));
    const oldFingerprint = JSON.stringify(state.intent);
    const fingerprint = JSON.stringify(intent);
    if (fingerprint === oldFingerprint) return;
    publish({ ...state, intent, phase: 'editing', receipt: null, failure: null,
      pending: null, activeRequestId: null });
  };
  const save = async () => {
    if (state.phase === 'saving' || state.phase === 'ready') return;
    const fingerprint = JSON.stringify(state.intent);
    const operationId = state.pending?.fingerprint === fingerprint
      ? state.pending.operationId : options.newOperationId();
    const ownerKey = state.ownerKey;
    const ownerEpoch = state.ownerEpoch;
    const requestId = ++sequence;
    const command: HeatCoachCommand = { ...options.publication, operationId, intent: state.intent };
    publish({ ...state, phase: 'saving', activeRequestId: requestId, failure: null,
      pending: { operationId, fingerprint } });
    try {
      const receipt = await options.api.createHeatCoachAssessment(command);
      if (state.ownerKey !== ownerKey || state.ownerEpoch !== ownerEpoch || state.activeRequestId !== requestId) return;
      publish({ ...state, phase: 'ready', receipt, activeRequestId: null, pending: null });
    } catch (error) {
      if (state.ownerKey !== ownerKey || state.ownerEpoch !== ownerEpoch || state.activeRequestId !== requestId) return;
      publish({ ...state, phase: 'failed', activeRequestId: null,
        failure: error instanceof HeatCoachError ? error.code : 'unknown' });
    }
  };
  return {
    getState: () => state,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setOwner: ownerKey => {
      if (ownerKey !== state.ownerKey) publish(initialHeatCoachState(ownerKey, state.ownerEpoch + 1));
    },
    editIntent,
    save,
    retry: async () => { if (state.phase === 'failed') await save(); },
  };
}
