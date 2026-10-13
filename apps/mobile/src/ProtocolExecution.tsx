import { useEffect, useReducer, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import {
  applyExecutionCommand,
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
  EXECUTION_NOTHING_CONFIRMED,
  EXECUTION_PAUSE_LABEL,
  EXECUTION_PLANNED_HEADING,
  EXECUTION_PRODUCT_HELP,
  EXECUTION_PRODUCT_ID_LABEL,
  EXECUTION_PRODUCT_VERSION_LABEL,
  EXECUTION_REASON_ABANDON_LABEL,
  EXECUTION_REASON_MODIFY_LABEL,
  EXECUTION_REASON_SKIP_LABEL,
  EXECUTION_REASON_SUBSTITUTE_LABEL,
  EXECUTION_RESUME_LABEL,
  EXECUTION_RETRY_LABEL,
  EXECUTION_SAVE_FAILED,
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
} from './guidance/guidance-copy';
import {
  executionUiReducer,
  initialExecutionUi,
} from './guidance/protocol-execution-state';
import {
  startProtocolExecution,
  transitionProtocolExecution,
  type ProtocolExecutionReceipt,
} from './guidance/protocol-execution-api';
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

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : 'save failed';
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
  const [productId, setProductId] = useState('');
  const [productVersionId, setProductVersionId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [seenOwner, setSeenOwner] = useState(ownerId);
  // Render-time adjustment (never in an effect): a new owner discards the
  // previous owner's armed flow and form input alongside the reducer reset.
  if (seenOwner !== ownerId) {
    setSeenOwner(ownerId);
    setArmed(null);
    setFormError(null);
  }
  const ownerToken = useRef(0);
  const mounted = useRef(true);
  const stepsRef = useRef<Text | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ownerToken.current += 1;
    };
  }, []);

  useEffect(() => {
    dispatch({ type: 'owner_changed', ownerId });
    ownerToken.current += 1;
  }, [ownerId]);

  useEffect(() => () => {
    dispatch({ type: 'discarded' });
  }, []);

  useEffect(() => {
    if (ui.phase === 'ready') stepsRef.current?.focus?.();
  }, [ui.phase]);

  const live = () => mounted.current;

  async function handleStart(): Promise<void> {
    if (ui.phase === 'save_failed' && ui.startRequest !== null) {
      const request = ui.startRequest;
      dispatch({ type: 'retry_requested' });
      const token = ownerToken.current;
      try {
        const receipt = await startProtocolExecution({
          operationId: request.operationId,
          executionId: request.executionId,
          recommendationRunId: request.decision.requestId,
          decision: request.decision as unknown as Record<string, unknown>,
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
        dispatch({ type: 'start_failed', error: errorMessage(error) });
      }
      return;
    }
    if (ui.phase !== 'idle') return;
    const request = {
      operationId: Crypto.randomUUID(),
      executionId: Crypto.randomUUID(),
      decision,
      startedAt: nowIso(),
    };
    dispatch({ type: 'start_requested', ...request });
    const token = ownerToken.current;
    try {
      const receipt = await startProtocolExecution({
        operationId: request.operationId,
        executionId: request.executionId,
        recommendationRunId: decision.requestId,
        decision: decision as unknown as Record<string, unknown>,
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
      dispatch({ type: 'start_failed', error: errorMessage(error) });
    }
  }

  async function sendTransition(command: ExecutionCommand, result: ProtocolExecutionRecord): Promise<void> {
    const current = ui.execution;
    if (current === null || ui.revision < 0) return;
    const operationId = Crypto.randomUUID();
    const at = nowIso();
    const expectedRevision = ui.revision;
    dispatch({ type: 'transition_requested', operationId, command, at, result, expectedRevision });
    await deliverTransition({
      operationId,
      executionId: current.executionId,
      expectedRevision,
      command,
      at,
      result,
    });
  }

  async function deliverTransition(args: {
    readonly operationId: string;
    readonly executionId: string;
    readonly expectedRevision: number;
    readonly command: ExecutionCommand;
    readonly at: string;
    readonly result: ProtocolExecutionRecord;
  }): Promise<void> {
    const token = ownerToken.current;
    try {
      const receipt: ProtocolExecutionReceipt = await transitionProtocolExecution({
        operationId: args.operationId,
        executionId: args.executionId,
        expectedRevision: args.expectedRevision,
        command: args.command,
        at: args.at,
        result: args.result as unknown as Record<string, unknown>,
      });
      if (!live() || token !== ownerToken.current) return;
      dispatch({
        type: 'transition_succeeded',
        execution: asExecution(receipt.execution),
        revision: receipt.revision,
      });
    } catch (error) {
      if (!live() || token !== ownerToken.current) return;
      dispatch({ type: 'transition_failed', error: errorMessage(error) });
    }
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
        result: retrying.result,
      });
      return;
    }
    if (retryingStart !== null) {
      await handleStart();
    }
  }

  function confirmed(command: ExecutionCommand): void {
    const current = ui.execution;
    if (current === null || ui.phase !== 'ready') return;
    let result: ProtocolExecutionRecord;
    try {
      result = applyExecutionCommand(current, command, { at: nowIso() });
    } catch {
      return;
    }
    setArmed(null);
    setReason('');
    setDetail('');
    setProductId('');
    setProductVersionId('');
    setFormError(null);
    void sendTransition(command, result);
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
        const ownedId = productId.trim();
        const ownedVersion = productVersionId.trim();
        if (ownedId === '' || ownedVersion === '') {
          setFormError(EXECUTION_EMPTY_REASON);
          return;
        }
        confirmed({
          kind: 'substitute-step',
          stepId: armed.stepId,
          reason: trimmed,
          replacement: { productId: ownedId, productVersionId: ownedVersion, owned: true },
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
    setProductId('');
    setProductVersionId('');
    setFormError(null);
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
          <Text style={styles.body}>{EXECUTION_PRODUCT_HELP}</Text>
          <Field
            label={EXECUTION_PRODUCT_ID_LABEL}
            value={productId}
            onChangeText={setProductId}
            placeholder="Owned product id"
          />
          <Field
            label={EXECUTION_PRODUCT_VERSION_LABEL}
            value={productVersionId}
            onChangeText={setProductVersionId}
            placeholder="Exact version id"
          />
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
              try {
                const result = applyExecutionCommand(execution, { kind: 'pause' }, { at: nowIso() });
                void sendTransition({ kind: 'pause' }, result);
              } catch {
                return;
              }
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
              try {
                const result = applyExecutionCommand(execution, { kind: 'resume' }, { at: nowIso() });
                void sendTransition({ kind: 'resume' }, result);
              } catch {
                return;
              }
            }}
          />
        )}
        {pendingSteps.length === 0 && execution.status === 'in_progress' && (
          <Button
            title={EXECUTION_FINISH_LABEL}
            accessibilityLabel={EXECUTION_FINISH_LABEL}
            disabled={busy}
            onPress={() => {
              try {
                const result = applyExecutionCommand(execution, { kind: 'complete' }, { at: nowIso() });
                void sendTransition({ kind: 'complete' }, result);
              } catch {
                return;
              }
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
