import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';

import type { ProtocolDecision } from '../../../packages/domain/src/index';
import {
  EXECUTION_BOUNDARY,
  EXECUTION_LOADING_LABEL,
  EXECUTION_LOAD_FAILED,
  EXECUTION_RELOAD_LABEL,
  EXECUTION_START_BODY,
  EXECUTION_START_FAILED,
  EXECUTION_START_LABEL,
  EXECUTION_STARTING_LABEL,
} from './guidance/guidance-copy';
import { Button, styles } from './ui';
import { useProtocolExecutionController } from './useProtocolExecutionController';
import { ExecutionProgress } from './ProtocolExecutionProgress';
import { ExecutionActions } from './ProtocolExecutionActions';
import { ExecutionDeviationForm } from './ProtocolExecutionDeviationForm';
import { ExecutionSubstitutionPicker } from './ProtocolExecutionSubstitutionPicker';

export interface ProtocolExecutionProps {
  readonly ownerId: string;
  /** A ready recommendation run. Mounting or viewing it records nothing. */
  readonly decision: ProtocolDecision;
  /**
   * Fix G: fires exactly once per abandoned execution, and ONLY after the
   * authoritative server receipt reconciled (never from the optimistic
   * preview, which also carries status `abandoned` while saving, and never
   * from a failed or retried transition). TodayGuidance uses it to return
   * the restored view to idle through audited server state.
   */
  readonly onTerminalAbandoned?: (receipt: TerminalAbandonReceipt) => void;
}

/**
 * The smallest coordination payload for the post-abandon return: the
 * server-confirmed identity of the abandoned execution. Constructed only
 * from a reconciled receipt — the status is narrowed to `abandoned` so a
 * non-terminal receipt cannot typecheck as a return signal.
 */
export interface TerminalAbandonReceipt {
  readonly executionId: string;
  readonly status: 'abandoned';
  readonly revision: number;
}

/**
 * Resumable protocol execution surface (TD-07–TD-08).
 *
 * Thin composition root: all orchestration lives in
 * `useProtocolExecutionController`; every card below is a pure
 * props-in/render-out view. See the controller for the rules this surface
 * enforces.
 */
export function ProtocolExecution({ ownerId, decision, onTerminalAbandoned }: ProtocolExecutionProps) {
  const controller = useProtocolExecutionController(ownerId, decision);
  const { ui, armed, execution } = controller;
  // Fix G terminal-abandon gate: notify the parent at most once per
  // abandoned execution, and only from authoritative server state. While a
  // transition is in flight (`saving` with a pending operation) `ui.execution`
  // is the LOCAL optimistic preview — which for abandonment already reads
  // `abandoned` — so phase + pending must confirm the receipt reconciled
  // before anyone returns to idle. Failures land in `save_failed` (preview
  // rolled back, pending kept for retry) and never notify.
  const notifiedAbandoned = useRef<string | null>(null);
  useEffect(() => {
    if (onTerminalAbandoned === undefined) return;
    if (ui.phase !== 'ready' || ui.pending !== null) return;
    const confirmed = ui.execution;
    if (confirmed === null || confirmed.status !== 'abandoned') return;
    if (notifiedAbandoned.current === confirmed.executionId) return;
    notifiedAbandoned.current = confirmed.executionId;
    onTerminalAbandoned({
      executionId: confirmed.executionId,
      status: 'abandoned',
      revision: ui.revision,
    });
  }, [onTerminalAbandoned, ui.execution, ui.pending, ui.phase, ui.revision]);

  // Paint-window guard: the reset to `idle` for a new owner lands in an
  // effect, i.e. AFTER the first commit with the new `ownerId`. Rendering
  // `ui.execution` here would paint the previous owner's steps, deviations
  // and results under the new owner's session for that commit. While the
  // stored owner disagrees with the prop, render only the owner-neutral start
  // card — old execution data can never reach this render path. (The `key`
  // at the mount site remounts the whole surface for the app path; this guard
  // covers every prop-change path.)
  if (!controller.ownerMatches) {
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

  // Loading first — and on any run disagreement: while the owner-scoped load
  // is in flight the surface renders neutral loading only — no idle start
  // card, no prior-owner execution, no optimistic preview. The reducer only
  // holds `null` while loading, so stale content cannot reach this render
  // path by construction. The run-agreement conjunct closes the post-commit
  // window on a decision swap: effects reset to loading only AFTER the first
  // commit with the new decision, so without it that commit would paint the
  // previous run's execution under the new run's context.
  if (ui.phase === 'loading' || !controller.runAgrees) {
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
        onPress={() => void controller.handleReload()}
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
        onPress={() => void controller.handleStart()}
      />
      <Text style={styles.subtitle}>{EXECUTION_BOUNDARY}</Text>
    </View>;
  }

  if (ui.execution === null || execution === null) {
    return <View style={styles.card}>
      <Button
        title={EXECUTION_STARTING_LABEL}
        accessibilityLabel={EXECUTION_STARTING_LABEL}
        disabled
        onPress={() => undefined}
      />
    </View>;
  }

  return <View style={styles.card}>
    <ExecutionProgress
      execution={execution}
      busy={controller.busy}
      terminal={controller.terminal}
      actionsHidden={ui.phase === 'save_failed'}
      stepsHeadingRef={controller.stepsHeadingRef}
      onArmStep={controller.arm}
      stepFormSlot={armed !== null && armed.flow !== 'abandon' && ui.phase !== 'save_failed' && (
        <ExecutionDeviationForm
          armed={armed}
          execution={execution}
          reason={controller.reason}
          detail={controller.detail}
          formError={controller.formError}
          busy={controller.busy}
          onReason={controller.setReason}
          onDetail={controller.setDetail}
          onConfirm={controller.confirmArmed}
          onCancel={controller.cancelArmed}
          substitutionSlot={armed.flow === 'substitute' ? (
            <ExecutionSubstitutionPicker
              shelfItems={controller.shelfItems}
              shelfError={controller.shelfError}
              shelfItemId={controller.shelfItemId}
              shelfDetail={controller.shelfDetail}
              busy={controller.busy}
              onSelect={controller.selectShelfItem}
            />
          ) : undefined}
        />
      )}
    />

    <ExecutionActions
      execution={execution}
      busy={controller.busy}
      terminal={controller.terminal}
      saveFailed={ui.phase === 'save_failed' && ui.pending !== null}
      saveError={ui.error}
      onPause={() => {
        controller.beginTransition({ kind: 'pause' });
      }}
      onResume={() => {
        controller.beginTransition({ kind: 'resume' });
      }}
      onFinish={() => {
        controller.beginTransition({ kind: 'complete' });
      }}
      onArmAbandon={() => controller.arm({ flow: 'abandon' })}
      onRetry={() => void controller.handleRetry()}
    />

    {armed !== null && armed.flow === 'abandon' && !controller.terminal && (
      <ExecutionDeviationForm
        armed={armed}
        execution={execution}
        reason={controller.reason}
        detail={controller.detail}
        formError={controller.formError}
        busy={controller.busy}
        onReason={controller.setReason}
        onDetail={controller.setDetail}
        onConfirm={controller.confirmArmed}
        onCancel={controller.cancelArmed}
      />
    )}

    <Text style={styles.subtitle}>{EXECUTION_BOUNDARY}</Text>
  </View>;
}
