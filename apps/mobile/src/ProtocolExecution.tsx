import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import {
  type ExecutionCommand,
  type ProtocolDecision,
  type ProtocolExecution as ProtocolExecutionRecord,
} from '../../../packages/domain/src/index';
import {
  confirmDoneLabel,
  confirmModifyLabel,
  confirmSkipLabel,
  confirmSubstituteLabel,
  EXECUTION_ABANDON_LABEL,
  EXECUTION_ACTUAL_HEADING,
  EXECUTION_BOUNDARY,
  EXECUTION_CANCEL_LABEL,
  EXECUTION_CONFIRM_STOP_LABEL,
  EXECUTION_DETAIL_MODIFY_LABEL,
  EXECUTION_EMPTY_REASON,
  EXECUTION_FINISH_HINT,
  EXECUTION_FINISH_LABEL,
  EXECUTION_LOADING_LABEL,
  EXECUTION_LOAD_FAILED,
  EXECUTION_NOTHING_CONFIRMED,
  EXECUTION_PAUSE_LABEL,
  EXECUTION_PLANNED_HEADING,
  EXECUTION_REASON_ABANDON_LABEL,
  EXECUTION_REASON_MODIFY_LABEL,
  EXECUTION_REASON_SKIP_LABEL,
  EXECUTION_REASON_SUBSTITUTE_LABEL,
  EXECUTION_RELOAD_LABEL,
  EXECUTION_RESUME_LABEL,
  EXECUTION_RESUME_UNVERIFIED,
  EXECUTION_RETRY_LABEL,
  EXECUTION_SAVE_FAILED,
  EXECUTION_SHELF_EMPTY,
  EXECUTION_SHELF_ITEM_HELP,
  EXECUTION_SHELF_LOAD_FAILED,
  EXECUTION_SHELF_LOADING,
  EXECUTION_SHELF_PICKER_LABEL,
  EXECUTION_SHELF_REQUIRED,
  EXECUTION_START_BODY,
  EXECUTION_START_FAILED,
  EXECUTION_START_LABEL,
  EXECUTION_STARTING_LABEL,
  EXECUTION_STATUS_LABELS,
  markDoneLabel,
  modifyLabel,
  skipLabel,
  stepLabel,
  substituteLabel,
  selectedShelfItemLabel,
  shelfItemOptionLabel,
  shelfItemVersionLabel,
} from './guidance/guidance-copy';
import {
  executionUiReducer,
  initialExecutionUi,
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
import { Button, Field, styles } from './ui';

export interface ProtocolExecutionProps {
  readonly ownerId: string;
  /** A ready recommendation run. Mounting or viewing it records nothing. */
  readonly decision: ProtocolDecision;
}

type ArmedFlow =
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

function positionOf(execution: ProtocolExecutionRecord, stepId: string): number {
  return execution.steps.find(step => step.stepId === stepId)?.position ?? 0;
}

function deviationSummary(step: ProtocolExecutionRecord['steps'][number]): string | null {
  if (step.state === 'confirmed') return `Done ${stepLabel(step.position).toLowerCase()}`;
  const deviation = step.deviation;
  if (deviation === null) return null;
  switch (deviation.kind) {
    case 'skip':
      return `Skipped ${stepLabel(step.position).toLowerCase()}: ${deviation.reason}`;
    case 'substitute':
      return `Substituted ${stepLabel(step.position).toLowerCase()}: ${deviation.reason}`;
    case 'modify':
      return `Changed ${stepLabel(step.position).toLowerCase()}: ${deviation.reason} — ${deviation.detail}`;
  }
}

/**
 * Resumable protocol execution surface (TD-07–TD-08).
 *
 * Three rules this component exists to enforce:
 *
 * 1. Mounting, viewing, or arming a flow records nothing. Only an explicit
 *    start tap calls `startProtocolExecution`, and only a confirmed action
 *    calls `transitionProtocolExecution`. Arming without confirming is
 *    discarded silently.
 * 2. Retries reuse the same operation id, so a lost response can never
 *    duplicate history (the server treats a repeated operation id as the
 *    same write).
 * 3. An owner change or unmount discards in-flight work: the epoch/token
 *    pattern from the Today preflight means a late response can never paint
 *    another owner's execution onto the screen.
 *
 * Deviation free text is rendered as record text only. It travels inside the
 * confirmed command and its result — never into facts, snapshots, or
 * recommendation input, of which this component builds none.
 */
export function ProtocolExecution({ ownerId, decision }: ProtocolExecutionProps) {
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
  // dependencies: the owner-scoped load runs on mount and owner change only.
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
    dispatch({ type: 'owner_changed', ownerId });
    dispatcherRef.current?.reset();
    ownerToken.current += 1;
    // Owner-scoped active-execution load (MB-001): mount and every owner
    // change reload through the same idempotent read. The token guard plus
    // the reducer's loading-only resume actions mean a late response can
    // never paint another owner's execution onto the screen.
    const token = ownerToken.current;
    void loadActiveExecution(token);
  }, [ownerId, loadActiveExecution]);

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

  // Paint-window guard: the reset to `idle` for a new owner lands in an
  // effect, i.e. AFTER the first commit with the new `ownerId`. Rendering
  // `ui.execution` here would paint the previous owner's steps, deviations
  // and results under the new owner's session for that commit. While the
  // stored owner disagrees with the prop, render only the owner-neutral start
  // card — old execution data can never reach this render path. (The `key`
  // at the mount site remounts the whole surface for the app path; this guard
  // covers every prop-change path.)
  if (ui.ownerId !== ownerId) {
    return <View style={styles.card}>
      <Text style={styles.heading}>Follow this plan</Text>
      <Text style={styles.body}>{EXECUTION_START_BODY}</Text>
      <Button
        title={EXECUTION_START_LABEL}
        accessibilityLabel={EXECUTION_START_LABEL}
        disabled
        onPress={() => undefined}
      />
      <Text style={styles.subtitle}>{EXECUTION_BOUNDARY}</Text>
    </View>;
  }

  // Loading first: while the owner-scoped load is in flight the surface
  // renders neutral loading only — no idle start card, no prior-owner
  // execution, no optimistic preview. The reducer only holds `null` while
  // loading, so stale content cannot reach this render path by construction.
  if (ui.phase === 'loading') {
    return <View style={styles.card}>
      <Text style={styles.heading}>Follow this plan</Text>
      <Text style={styles.body}>{EXECUTION_LOADING_LABEL}</Text>
      <Text style={styles.subtitle}>{EXECUTION_BOUNDARY}</Text>
    </View>;
  }

  // A failed load is an explicit error with an idempotent retry — never a
  // silent fall back to the idle start card (which would offer a fresh start
  // over a server-held execution) and never a partial render.
  if (ui.phase === 'load_failed') {
    return <View style={styles.card}>
      <Text style={styles.heading}>Follow this plan</Text>
      <Text accessibilityRole="alert" style={styles.error}>{ui.error ?? EXECUTION_LOAD_FAILED}</Text>
      <Button
        title={EXECUTION_RELOAD_LABEL}
        accessibilityLabel={EXECUTION_RELOAD_LABEL}
        onPress={() => void handleReload()}
      />
      <Text style={styles.subtitle}>{EXECUTION_BOUNDARY}</Text>
    </View>;
  }

  if (ui.phase === 'idle' || (ui.phase === 'save_failed' && ui.execution === null && ui.startRequest !== null && ui.pending === null)) {
    return <View style={styles.card}>
      <Text style={styles.heading}>Follow this plan</Text>
      <Text style={styles.body}>{EXECUTION_START_BODY}</Text>
      {ui.phase === 'save_failed' && (
        <Text accessibilityRole="alert" style={styles.error}>{`${EXECUTION_START_FAILED} (${ui.error ?? 'save failed'})`}</Text>
      )}
      <Button
        title={EXECUTION_START_LABEL}
        accessibilityLabel={EXECUTION_START_LABEL}
        onPress={() => void handleStart()}
      />
      <Text style={styles.subtitle}>{EXECUTION_BOUNDARY}</Text>
    </View>;
  }

  if (ui.execution === null) {
    return <View style={styles.card}>
      <Button
        title={EXECUTION_STARTING_LABEL}
        accessibilityLabel={EXECUTION_STARTING_LABEL}
        disabled
        onPress={() => undefined}
      />
    </View>;
  }

  const execution = ui.execution;
  const busy = ui.phase === 'saving' || ui.phase === 'starting';
  const terminal = execution.status === 'completed' || execution.status === 'abandoned';
  const pendingSteps = execution.steps.filter(step => step.state === 'pending');
  const handledSteps = execution.steps.filter(step => step.state !== 'pending');
  const ordered = [...execution.steps].sort((left, right) => left.position - right.position);

  return <View style={styles.card}>
    <Text
      ref={stepsRef}
      style={styles.heading}
      accessibilityRole="header"
      accessibilityLabel={EXECUTION_PLANNED_HEADING}
    >
      {EXECUTION_PLANNED_HEADING}
    </Text>
    <Text style={styles.body}>{EXECUTION_STATUS_LABELS[execution.status]}</Text>

    {ordered.map(step => (
      <View key={step.stepId} style={styles.notice}>
        <Text style={styles.label}>{stepLabel(step.position)}</Text>
        <Text style={styles.body}>{step.planned.action}</Text>
        {step.planned.reasons.map(entry => <Text key={entry} style={styles.subtitle}>{entry}</Text>)}
        {!terminal && step.state === 'pending' && ui.phase !== 'save_failed' && (
          <View style={{ gap: 8 }}>
            <Button
              title={markDoneLabel(step.position)}
              accessibilityLabel={markDoneLabel(step.position)}
              secondary
              disabled={busy}
              onPress={() => arm({ flow: 'complete', stepId: step.stepId })}
            />
            <Button
              title={skipLabel(step.position)}
              accessibilityLabel={skipLabel(step.position)}
              secondary
              disabled={busy}
              onPress={() => arm({ flow: 'skip', stepId: step.stepId })}
            />
            <Button
              title={substituteLabel(step.position)}
              accessibilityLabel={substituteLabel(step.position)}
              secondary
              disabled={busy}
              onPress={() => arm({ flow: 'substitute', stepId: step.stepId })}
            />
            <Button
              title={modifyLabel(step.position)}
              accessibilityLabel={modifyLabel(step.position)}
              secondary
              disabled={busy}
              onPress={() => arm({ flow: 'modify', stepId: step.stepId })}
            />
          </View>
        )}
      </View>
    ))}

    {armed !== null && armed.flow !== 'abandon' && ui.phase !== 'save_failed' && (
      <View style={styles.notice}>
        {armed.flow !== 'complete' && (
          <Field
            label={armed.flow === 'skip' ? EXECUTION_REASON_SKIP_LABEL : armed.flow === 'substitute' ? EXECUTION_REASON_SUBSTITUTE_LABEL : EXECUTION_REASON_MODIFY_LABEL}
            value={reason}
            onChangeText={setReason}
            placeholder="A short note for your record"
          />
        )}
        {armed.flow === 'modify' && (
          <Field
            label={EXECUTION_DETAIL_MODIFY_LABEL}
            value={detail}
            onChangeText={setDetail}
            placeholder="What you actually did"
          />
        )}
        {armed.flow === 'substitute' && <>
          <Text style={styles.body}>{EXECUTION_SHELF_ITEM_HELP}</Text>
          <Text style={styles.label}>{EXECUTION_SHELF_PICKER_LABEL}</Text>
          {shelfError !== null
            ? <Text accessibilityRole="alert" style={styles.error}>{shelfError}</Text>
            : shelfItems === null
              ? <Text style={styles.body}>{EXECUTION_SHELF_LOADING}</Text>
              : shelfItems.length === 0
                ? <Text style={styles.body}>{EXECUTION_SHELF_EMPTY}</Text>
                : shelfItems.map(item => (
                  <Button
                    key={item.id}
                    title={`${item.manualName ?? 'Unnamed shelf item'} (${item.availability})`}
                    accessibilityLabel={shelfItemOptionLabel(item.id)}
                    secondary
                    disabled={busy}
                    onPress={() => selectShelfItem(item)}
                  />
                ))}
          {shelfItemId !== '' && (
            <Text style={styles.body}>{selectedShelfItemLabel(shelfItemId)}</Text>
          )}
          {shelfDetail !== null && shelfDetail.id === shelfItemId && shelfDetail.versionId !== null && (
            <Text style={styles.body}>{shelfItemVersionLabel(shelfDetail.versionId)}</Text>
          )}
        </>}
        {formError !== null && (
          <Text accessibilityRole="alert" style={styles.error}>{formError}</Text>
        )}
        <Button
          title={armed.flow === 'complete'
            ? confirmDoneLabel(positionOf(execution, armed.stepId))
            : armed.flow === 'skip'
              ? confirmSkipLabel(positionOf(execution, armed.stepId))
              : armed.flow === 'substitute'
                ? confirmSubstituteLabel(positionOf(execution, armed.stepId))
                : confirmModifyLabel(positionOf(execution, armed.stepId))}
          accessibilityLabel={armed.flow === 'complete'
            ? confirmDoneLabel(positionOf(execution, armed.stepId))
            : armed.flow === 'skip'
              ? confirmSkipLabel(positionOf(execution, armed.stepId))
              : armed.flow === 'substitute'
                ? confirmSubstituteLabel(positionOf(execution, armed.stepId))
                : confirmModifyLabel(positionOf(execution, armed.stepId))}
          disabled={busy}
          onPress={confirmArmed}
        />
        <Button
          title={EXECUTION_CANCEL_LABEL}
          accessibilityLabel={EXECUTION_CANCEL_LABEL}
          secondary
          onPress={() => {
            setArmed(null);
            setFormError(null);
          }}
        />
      </View>
    )}

    <Text style={styles.heading} accessibilityRole="header" accessibilityLabel={EXECUTION_ACTUAL_HEADING}>
      {EXECUTION_ACTUAL_HEADING}
    </Text>
    {handledSteps.length === 0
      ? <Text style={styles.body}>{EXECUTION_NOTHING_CONFIRMED}</Text>
      : handledSteps.map(step => (
        <Text key={step.stepId} style={styles.body}>{deviationSummary(step) ?? stepLabel(step.position)}</Text>
      ))}
    {execution.closeReason !== null && (
      <Text style={styles.body}>{`Stopped: ${execution.closeReason}`}</Text>
    )}

    {ui.phase === 'save_failed' && ui.pending !== null && (
      <View style={styles.notice}>
        <Text accessibilityRole="alert" style={styles.error}>{`${EXECUTION_SAVE_FAILED} (${ui.error ?? 'save failed'})`}</Text>
        <Button
          title={EXECUTION_RETRY_LABEL}
          accessibilityLabel={EXECUTION_RETRY_LABEL}
          onPress={() => void handleRetry()}
        />
      </View>
    )}

    {!terminal && (
      <View style={{ gap: 8 }}>
        {execution.status === 'in_progress' && (
          <Button
            title={EXECUTION_PAUSE_LABEL}
            accessibilityLabel={EXECUTION_PAUSE_LABEL}
            secondary
            disabled={busy}
            onPress={() => {
              beginTransition({ kind: 'pause' });
            }}
          />
        )}
        {execution.status === 'paused' && (
          <Button
            title={EXECUTION_RESUME_LABEL}
            accessibilityLabel={EXECUTION_RESUME_LABEL}
            secondary
            disabled={busy}
            onPress={() => {
              beginTransition({ kind: 'resume' });
            }}
          />
        )}
        {pendingSteps.length === 0 && execution.status === 'in_progress' && (
          <Button
            title={EXECUTION_FINISH_LABEL}
            accessibilityLabel={EXECUTION_FINISH_LABEL}
            disabled={busy}
            onPress={() => {
              beginTransition({ kind: 'complete' });
            }}
          />
        )}
        {pendingSteps.length > 0 && execution.status === 'in_progress' && (
          <Text style={styles.body}>{EXECUTION_FINISH_HINT}</Text>
        )}
        <Button
          title={EXECUTION_ABANDON_LABEL}
          accessibilityLabel={EXECUTION_ABANDON_LABEL}
          secondary
          disabled={busy}
          onPress={() => arm({ flow: 'abandon' })}
        />
      </View>
    )}

    {armed !== null && armed.flow === 'abandon' && !terminal && (
      <View style={styles.notice}>
        <Field
          label={EXECUTION_REASON_ABANDON_LABEL}
          value={reason}
          onChangeText={setReason}
          placeholder="A short note for your record"
        />
        {formError !== null && (
          <Text accessibilityRole="alert" style={styles.error}>{formError}</Text>
        )}
        <Button
          title={EXECUTION_CONFIRM_STOP_LABEL}
          accessibilityLabel={EXECUTION_CONFIRM_STOP_LABEL}
          onPress={confirmArmed}
          disabled={busy}
        />
        <Button
          title={EXECUTION_CANCEL_LABEL}
          accessibilityLabel={EXECUTION_CANCEL_LABEL}
          secondary
          onPress={() => {
            setArmed(null);
            setFormError(null);
          }}
        />
      </View>
    )}

    <Text style={styles.subtitle}>{EXECUTION_BOUNDARY}</Text>
  </View>;
}
