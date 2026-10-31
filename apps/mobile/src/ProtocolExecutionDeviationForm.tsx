import { Text, View } from 'react-native';

import type { ProtocolExecution as ProtocolExecutionRecord } from '../../../packages/domain/src/index';
import {
  confirmDoneLabel,
  confirmModifyLabel,
  confirmSkipLabel,
  confirmSubstituteLabel,
  EXECUTION_CANCEL_LABEL,
  EXECUTION_CONFIRM_STOP_LABEL,
  EXECUTION_DETAIL_MODIFY_LABEL,
  EXECUTION_REASON_ABANDON_LABEL,
  EXECUTION_REASON_MODIFY_LABEL,
  EXECUTION_REASON_SKIP_LABEL,
  EXECUTION_REASON_SUBSTITUTE_LABEL,
} from './guidance/guidance-copy';
import { Button, Field, styles } from './ui';
import { positionOf } from './ProtocolExecutionProgress';
import type { ArmedFlow } from './useProtocolExecutionController';

export interface ExecutionDeviationFormProps {
  readonly armed: ArmedFlow;
  readonly execution: ProtocolExecutionRecord | null;
  readonly reason: string;
  readonly detail: string;
  readonly formError: string | null;
  readonly busy: boolean;
  readonly onReason: (value: string) => void;
  readonly onDetail: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** The shelf picker, rendered inside the substitute flow. */
  readonly substitutionSlot?: React.ReactNode;
}

export function ExecutionDeviationForm({
  armed,
  execution,
  reason,
  detail,
  formError,
  busy,
  onReason,
  onDetail,
  onConfirm,
  onCancel,
  substitutionSlot,
}: ExecutionDeviationFormProps) {
  if (armed.flow === 'abandon') {
    return <View style={styles.notice}>
      <Field
        label={EXECUTION_REASON_ABANDON_LABEL}
        value={reason}
        onChangeText={onReason}
        placeholder="A short note for your record"
      />
      {formError !== null && (
        <Text accessibilityRole="alert" style={styles.error}>{formError}</Text>
      )}
      <Button
        title={EXECUTION_CONFIRM_STOP_LABEL}
        accessibilityLabel={EXECUTION_CONFIRM_STOP_LABEL}
        onPress={onConfirm}
        disabled={busy}
      />
      <Button
        title={EXECUTION_CANCEL_LABEL}
        accessibilityLabel={EXECUTION_CANCEL_LABEL}
        secondary
        onPress={onCancel}
      />
    </View>;
  }
  if (execution === null) return null;
  return <View style={styles.notice}>
    {armed.flow !== 'complete' && (
      <Field
        label={armed.flow === 'skip' ? EXECUTION_REASON_SKIP_LABEL : armed.flow === 'substitute' ? EXECUTION_REASON_SUBSTITUTE_LABEL : EXECUTION_REASON_MODIFY_LABEL}
        value={reason}
        onChangeText={onReason}
        placeholder="A short note for your record"
      />
    )}
    {armed.flow === 'modify' && (
      <Field
        label={EXECUTION_DETAIL_MODIFY_LABEL}
        value={detail}
        onChangeText={onDetail}
        placeholder="What you actually did"
      />
    )}
    {armed.flow === 'substitute' && substitutionSlot}
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
      onPress={onConfirm}
    />
    <Button
      title={EXECUTION_CANCEL_LABEL}
      accessibilityLabel={EXECUTION_CANCEL_LABEL}
      secondary
      onPress={onCancel}
    />
  </View>;
}
