import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from 'react';
import { type Text } from 'react-native';
import * as Crypto from 'expo-crypto';

import {
  type ExecutionCommand,
  type ProtocolDecision,
  type ProtocolExecution as ProtocolExecutionRecord,
} from '../../../packages/domain/src/index';
import {
  EXECUTION_EMPTY_REASON,
  EXECUTION_RESUME_UNVERIFIED,
  EXECUTION_SHELF_LOAD_FAILED,
  EXECUTION_SHELF_REQUIRED,
} from './guidance/guidance-copy';
import {
  executionUiReducer,
  initialExecutionUi,
  type ExecutionUiState,
} from './guidance/protocol-execution-state';
import {
  createProtocolTransitionDispatcher,
  startErrorCopy,
  type ProtocolTransitionDispatcher,
  type TransitionWireRequest,
} from './guidance/protocol-transition-dispatch';
import { startProtocolExecution, getActiveProtocolExecution } from './guidance/protocol-execution-api';
import {
  resumeErrorCopy,
  validateResumedReceipt,
} from './guidance/protocol-execution-resume';
import {
  getUserProduct,
  listUserProducts,
  type ShelfDetail,
  type ShelfItem,
} from './shelf-api';

export type ArmedFlow =
  | { readonly flow: 'complete'; readonly stepId: string }
  | { readonly flow: 'skip'; readonly stepId: string }
  | { readonly flow: 'substitute'; readonly stepId: string }
  | { readonly flow: 'modify'; readonly stepId: string }
  | { readonly flow: 'abandon' };

function nowIso(): string {
  return new Date().toISOString();
}

function asExecution(value: unknown): ProtocolExecutionRecord {
  return value as ProtocolExecutionRecord;
}

export interface ProtocolExecutionController {
  readonly ui: ExecutionUiState;
  readonly armed: ArmedFlow | null;
  readonly reason: string;
  readonly detail: string;
  readonly shelfItemId: string;
  readonly shelfItems: ShelfItem[] | null;
  readonly shelfError: string | null;
  readonly shelfDetail: ShelfDetail | null;
  readonly formError: string | null;
  readonly execution: ProtocolExecutionRecord | null;
  readonly busy: boolean;
  readonly terminal: boolean;
  readonly ordered: ProtocolExecutionRecord['steps'];
  readonly pendingSteps: ProtocolExecutionRecord['steps'];
  readonly handledSteps: ProtocolExecutionRecord['steps'];
  /** False while the stored owner disagrees with the prop (post-commit window before the reset effect). */
  readonly ownerMatches: boolean;
  /** False while the loaded execution belongs to a previous run (post-swap window before the reload effect). */
  readonly runAgrees: boolean;
  readonly stepsHeadingRef: RefObject<Text | null>;
  readonly setReason: (value: string) => void;
  readonly setDetail: (value: string) => void;
  readonly handleReload: () => Promise<void>;
  readonly handleStart: () => Promise<void>;
  readonly handleRetry: () => Promise<void>;
  readonly beginTransition: (command: ExecutionCommand) => void;
  readonly confirmArmed: () => void;
  readonly arm: (flow: ArmedFlow) => void;
  readonly cancelArmed: () => void;
  readonly selectShelfItem: (item: ShelfItem) => void;
}

/**
 * All orchestration for the resumable protocol execution surface (TD-07–TD-08).
 *
 * Three rules this controller exists to enforce:
 *
 * 1. Mounting, viewing, or arming a flow records nothing. Only an explicit
 *    start tap calls `startProtocolExecution`, and only a confirmed action
 *    calls `transitionProtocolExecution`. Arming without confirming is
 *    discarded silently.
 * 2. Retries reuse the same operation id, so a lost response can never
 *    duplicate history (the server treats a repeated operation id as the
 *    same write).
 * 3. An owner change, a decision change, or unmount discards in-flight work:
 *    the epoch/token pattern from the Today preflight means a late response
 *    can never paint another owner's — or another run's — execution onto the
 *    screen. A render-time run-agreement guard holds the same line for the
 *    post-commit window before the reload effect fires.
 *
 * Deviation free text is rendered as record text only. It travels inside the
 * confirmed command and its result — never into facts, snapshots, or
 * recommendation input, of which this controller builds none.
 *
 * Renders nothing. Exposes the view-model plus callbacks only.
 */
export function useProtocolExecutionController(
  ownerId: string,
  decision: ProtocolDecision,
): ProtocolExecutionController {
  const [ui, dispatch] = useReducer(executionUiReducer, ownerId, initialExecutionUi);
  const [armed, setArmed] = useState<ArmedFlow | null>(null);
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  // SC-004: a substitution names one owned shelf item, never free-form
  // product ids. The picker is fed by the existing shelf readers; the
  // server re-verifies ownership, membership, and the catalogue version.
  const [shelfItemId, setShelfItemId] = useState('');
  const [shelfItems, setShelfItems] = useState<ShelfItem[] | null>(null);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [shelfDetail, setShelfDetail] = useState<ShelfDetail | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [seenOwner, setSeenOwner] = useState(ownerId);
  // Render-time adjustment (never in an effect): a new owner discards the
  // previous owner's armed flow and form input alongside the reducer reset.
  if (seenOwner !== ownerId) {
    setSeenOwner(ownerId);
    setArmed(null);
    setShelfItemId('');
    setShelfItems(null);
    setShelfError(null);
    setShelfDetail(null);
    setFormError(null);
  }
  // Same treatment for a re-run decision under the same owner: an armed flow
  // names steps of the previous run and must not survive into the new context.
  const [seenRequestId, setSeenRequestId] = useState(decision.requestId);
  if (seenRequestId !== decision.requestId) {
    setSeenRequestId(decision.requestId);
    setArmed(null);
    setReason('');
    setDetail('');
    setShelfItemId('');
    setShelfItems(null);
    setShelfError(null);
    setShelfDetail(null);
    setFormError(null);
  }
  const decisionRequestId = decision.requestId;
  const prevOwnerRef = useRef<string | null>(null);
  const ownerToken = useRef(0);
  const mounted = useRef(true);
  const decisionRef = useRef(decision);
  const stepsRef = useRef<Text | null>(null);
  const dispatcherRef = useRef<ProtocolTransitionDispatcher | null>(null);
  if (dispatcherRef.current === null) {
    dispatcherRef.current = createProtocolTransitionDispatcher({
      nowIso,
      newOperationId: () => Crypto.randomUUID(),
    });
  }
  const dispatcher = dispatcherRef.current;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ownerToken.current += 1;
      dispatcherRef.current?.reset();
    };
  }, []);

  // Keeps the fingerprint source fresh without widening the load effect's
  // dependencies: the owner-scoped load runs on mount, owner change, and
  // decision change (compared by stable requestId below).
  useEffect(() => {
    decisionRef.current = decision;
  });

  // Idempotent owner-scoped read: `getActiveProtocolExecution` takes no
  // arguments (the database derives the owner from `auth.uid()`), so a retry
  // resends nothing and can never duplicate history. Validation against the
  // current decision's fingerprint happens before anything paints.
  const loadActiveExecution = useCallback(async (token: number): Promise<void> => {
    const live = () => mounted.current;
    let receipt: unknown;
    try {
      receipt = await getActiveProtocolExecution();
    } catch (error) {
      if (!live() || token !== ownerToken.current) return;
      dispatch({ type: 'resume_failed', error: resumeErrorCopy(error).copy });
      return;
    }
    if (!live() || token !== ownerToken.current) return;
    const validated = validateResumedReceipt(receipt, decisionRef.current);
    if (!live() || token !== ownerToken.current) return;
    if (validated.status === 'resumable') {
      dispatch({
        type: 'resume_succeeded',
        execution: validated.execution,
        revision: validated.revision,
      });
    } else if (validated.status === 'absent') {
      dispatch({ type: 'resume_absent' });
    } else {
      dispatch({ type: 'resume_failed', error: EXECUTION_RESUME_UNVERIFIED });
    }
  }, []);

  useEffect(() => {
    if (prevOwnerRef.current === null || prevOwnerRef.current !== ownerId) {
      prevOwnerRef.current = ownerId;
      dispatch({ type: 'owner_changed', ownerId });
    } else {
      // Same owner, new decision context (guidance re-run): the on-screen
      // execution was validated against the previous run and must not survive
      // under the new one. Reset to neutral loading and re-validate; the
      // token bump plus dispatcher reset reuse the existing epoch guards, so
      // in-flight work is discarded, never orphaned onto the new context.
      dispatch({ type: 'discarded' });
    }
    dispatcherRef.current?.reset();
    ownerToken.current += 1;
    // Owner-scoped active-execution load (MB-001): mount, every owner change,
    // and every decision change reload through the same idempotent read. The
    // token guard plus the reducer's loading-only resume actions mean a late
    // response can never paint another owner's — or another run's — execution
    // onto the screen.
    const token = ownerToken.current;
    void loadActiveExecution(token);
  }, [ownerId, decisionRequestId, loadActiveExecution]);

  // The substitute picker loads the owner's shelf when armed. Reading is
  // display-only: the server re-verifies the chosen item at command time.
  // (Resetting runs in `arm`, so this effect performs no synchronous set.)
  useEffect(() => {
    if (armed === null || armed.flow !== 'substitute') return;
    let cancelled = false;
    void listUserProducts({ limit: 25 }).then(
      list => {
        if (!cancelled) setShelfItems(list.items);
      },
      () => {
        if (!cancelled) setShelfError(EXECUTION_SHELF_LOAD_FAILED);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [armed]);

  useEffect(() => () => {
    dispatch({ type: 'discarded' });
  }, []);

  useEffect(() => {
    if (ui.phase === 'ready') stepsRef.current?.focus?.();
  }, [ui.phase]);

  const live = () => mounted.current;

  async function handleReload(): Promise<void> {
    if (ui.phase !== 'load_failed') return;
    dispatch({ type: 'reload_requested' });
    await loadActiveExecution(ownerToken.current);
  }

  async function handleStart(): Promise<void> {
    if (ui.phase === 'save_failed' && ui.startRequest !== null) {
      const request = ui.startRequest;
      dispatch({ type: 'retry_requested' });
      const token = ownerToken.current;
      try {
        const receipt = await startProtocolExecution({
          operationId: request.operationId,
          executionId: request.executionId,
          recommendationRunId: request.recommendationRunId,
          startedAt: request.startedAt,
        });
        if (!live() || token !== ownerToken.current) return;
        dispatch({
          type: 'start_succeeded',
          execution: asExecution(receipt.execution),
          revision: receipt.revision,
        });
      } catch (error) {
        if (!live() || token !== ownerToken.current) return;
        dispatch({ type: 'start_failed', error: startErrorCopy(error).copy });
      }
      return;
    }
    if (ui.phase !== 'idle') return;
    const request = {
      operationId: Crypto.randomUUID(),
      executionId: Crypto.randomUUID(),
      recommendationRunId: decision.requestId,
      startedAt: nowIso(),
    };
    dispatch({ type: 'start_requested', ...request });
    const token = ownerToken.current;
    try {
      const receipt = await startProtocolExecution({
        operationId: request.operationId,
        executionId: request.executionId,
        recommendationRunId: decision.requestId,
        startedAt: request.startedAt,
      });
      if (!live() || token !== ownerToken.current) return;
      dispatch({
        type: 'start_succeeded',
        execution: asExecution(receipt.execution),
        revision: receipt.revision,
      });
    } catch (error) {
      if (!live() || token !== ownerToken.current) return;
      dispatch({ type: 'start_failed', error: startErrorCopy(error).copy });
    }
  }

  async function deliverTransition(request: TransitionWireRequest): Promise<void> {
    const token = ownerToken.current;
    const outcome = await dispatcher.deliver(request);
    if (!live() || token !== ownerToken.current) return;
    if (outcome.status === 'succeeded') {
      dispatch({
        type: 'transition_succeeded',
        execution: asExecution(outcome.receipt.execution),
        revision: outcome.receipt.revision,
      });
    } else if (outcome.status === 'failed') {
      // The dispatcher already mapped the stable code to user copy: the raw
      // code never reaches the screen.
      dispatch({ type: 'transition_failed', error: outcome.copy });
    }
    // `busy` means a newer operation owns the guard; nothing to apply.
  }

  async function handleRetry(): Promise<void> {
    const retrying = ui.pending;
    const retryingStart = ui.startRequest;
    if (retrying === null && retryingStart === null) return;
    dispatch({ type: 'retry_requested' });
    if (!live()) return;
    if (retrying !== null && ui.execution !== null) {
      await deliverTransition({
        operationId: retrying.operationId,
        executionId: ui.execution.executionId,
        expectedRevision: retrying.expectedRevision,
        command: retrying.command,
        at: retrying.at,
      });
      return;
    }
    if (retryingStart !== null) {
      await handleStart();
    }
  }

  function beginTransition(command: ExecutionCommand): void {
    const current = ui.execution;
    if (current === null || ui.phase !== 'ready' || ui.revision < 0) return;
    // One dispatcher, one clock read, one pending guard for every action. The
    // optimistic preview and the wire command share the same `eventAt`; the
    // authoritative server receipt reconciles on delivery.
    const begun = dispatcher.begin({
      command,
      execution: current,
      executionId: current.executionId,
      expectedRevision: ui.revision,
    });
    if (begun.status !== 'ready') return;
    setArmed(null);
    setReason('');
    setDetail('');
    setShelfItemId('');
    setShelfItems(null);
    setShelfError(null);
    setShelfDetail(null);
    setFormError(null);
    dispatch({
      type: 'transition_requested',
      operationId: begun.request.operationId,
      command,
      at: begun.request.at,
      result: begun.preview,
      expectedRevision: ui.revision,
    });
    void deliverTransition(begun.request);
  }

  function confirmed(command: ExecutionCommand): void {
    beginTransition(command);
  }

  function confirmArmed(): void {
    if (armed === null) return;
    if (armed.flow === 'abandon') {
      const trimmed = reason.trim();
      if (trimmed === '') {
        setFormError(EXECUTION_EMPTY_REASON);
        return;
      }
      confirmed({ kind: 'abandon', reason: trimmed });
      return;
    }
    if (armed.flow === 'complete') {
      confirmed({ kind: 'complete-step', stepId: armed.stepId });
      return;
    }
    const current = ui.execution;
    if (current === null) return;
    const trimmed = reason.trim();
    if (trimmed === '') {
      setFormError(EXECUTION_EMPTY_REASON);
      return;
    }
    switch (armed.flow) {
      case 'skip':
        confirmed({ kind: 'skip-step', stepId: armed.stepId, reason: trimmed });
        break;
      case 'substitute': {
        const shelf = shelfItemId.trim();
        if (shelf === '') {
          setFormError(EXECUTION_SHELF_REQUIRED);
          return;
        }
        confirmed({
          kind: 'substitute-step',
          stepId: armed.stepId,
          reason: trimmed,
          replacement: { shelfItemId: shelf },
        });
        break;
      }
      case 'modify': {
        const changed = detail.trim();
        if (changed === '') {
          setFormError(EXECUTION_EMPTY_REASON);
          return;
        }
        confirmed({ kind: 'modify-step', stepId: armed.stepId, reason: trimmed, detail: changed });
        break;
      }
    }
  }

  function arm(flow: ArmedFlow): void {
    setArmed(flow);
    setReason('');
    setDetail('');
    setShelfItemId('');
    setShelfItems(null);
    setShelfError(null);
    setShelfDetail(null);
    setFormError(null);
  }

  function cancelArmed(): void {
    setArmed(null);
    setFormError(null);
  }

  function selectShelfItem(item: ShelfItem): void {
    setShelfItemId(item.id);
    setShelfDetail(null);
    setFormError(null);
    // Display-only detail for the chosen item; a late response after an
    // owner change or unmount is discarded like every other async result.
    const token = ownerToken.current;
    void getUserProduct(item.id).then(
      detail => {
        if (!live() || token !== ownerToken.current) return;
        if (detail !== null && detail.id === item.id) setShelfDetail(detail);
      },
      () => {
        if (!live() || token !== ownerToken.current) return;
        setShelfDetail(null);
      },
    );
  }

  const execution = ui.execution;
  const busy = ui.phase === 'saving' || ui.phase === 'starting';
  const terminal = execution !== null && (execution.status === 'completed' || execution.status === 'abandoned');
  const pendingSteps = execution !== null ? execution.steps.filter(step => step.state === 'pending') : [];
  const handledSteps = execution !== null ? execution.steps.filter(step => step.state !== 'pending') : [];
  const ordered = execution !== null ? [...execution.steps].sort((left, right) => left.position - right.position) : [];
  const runAgrees = execution === null || execution.recommendationRunId === decision.requestId;

  return {
    ui,
    armed,
    reason,
    detail,
    shelfItemId,
    shelfItems,
    shelfError,
    shelfDetail,
    formError,
    execution,
    busy,
    terminal,
    ordered,
    pendingSteps,
    handledSteps,
    ownerMatches: ui.ownerId === ownerId,
    runAgrees,
    stepsHeadingRef: stepsRef,
    setReason,
    setDetail,
    handleReload,
    handleStart,
    handleRetry,
    beginTransition,
    confirmArmed,
    arm,
    cancelArmed,
    selectShelfItem,
  };
}
