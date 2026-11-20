import { Text, View } from 'react-native';

import type { ProtocolExecution as ProtocolExecutionRecord } from '../../../packages/domain/src/index';
import {
  EXECUTION_ABANDON_LABEL,
  EXECUTION_FINISH_HINT,
  EXECUTION_FINISH_LABEL,
  EXECUTION_PAUSE_LABEL,
  EXECUTION_RESUME_LABEL,
  EXECUTION_RETRY_LABEL,
  EXECUTION_SAVE_FAILED,
} from './guidance/guidance-copy';
import { Button, styles } from './ui';

export interface ExecutionActionsProps {
  readonly execution: ProtocolExecutionRecord;
  readonly busy: boolean;
  readonly terminal: boolean;
  readonly saveFailed: boolean;
  readonly saveError: string | null;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onFinish: () => void;
  readonly onArmAbandon: () => void;
  readonly onRetry: () => void;
}

export function ExecutionActions({
  execution,
  busy,
  terminal,
  saveFailed,
  saveError,
  onPause,
  onResume,
  onFinish,
  onArmAbandon,
  onRetry,
}: ExecutionActionsProps) {
  const pendingSteps = execution.steps.filter(step => step.state === 'pending');
  return <>
    {saveFailed && (
      <View style={styles.notice}>
        <Text accessibilityRole="alert" style={styles.error}>{`${EXECUTION_SAVE_FAILED} (${saveError ?? 'save failed'})`}</Text>
        <Button
          title={EXECUTION_RETRY_LABEL}
          accessibilityLabel={EXECUTION_RETRY_LABEL}
          onPress={onRetry}
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
            onPress={onPause}
          />
        )}
        {execution.status === 'paused' && (
          <Button
            title={EXECUTION_RESUME_LABEL}
            accessibilityLabel={EXECUTION_RESUME_LABEL}
            secondary
            disabled={busy}
            onPress={onResume}
          />
        )}
        {pendingSteps.length === 0 && execution.status === 'in_progress' && (
          <Button
            title={EXECUTION_FINISH_LABEL}
            accessibilityLabel={EXECUTION_FINISH_LABEL}
            disabled={busy}
            onPress={onFinish}
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
          onPress={onArmAbandon}
        />
      </View>
    )}
  </>;
}
