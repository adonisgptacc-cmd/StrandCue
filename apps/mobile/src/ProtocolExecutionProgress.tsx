import type { ReactNode, RefObject } from 'react';
import { Text, View, type TextInstance } from 'react-native';

import type { ProtocolExecution as ProtocolExecutionRecord } from '../../../packages/domain/src/index';
import {
  EXECUTION_ACTUAL_HEADING,
  EXECUTION_NOTHING_CONFIRMED,
  EXECUTION_PLANNED_HEADING,
  EXECUTION_STATUS_LABELS,
  HEAT_PROTOCOL_BOUNDARY,
  markDoneLabel,
  modifyLabel,
  skipLabel,
  stepLabel,
  substituteLabel,
} from './guidance/guidance-copy';
import { Button, styles } from './ui';
import type { ArmedFlow } from './useProtocolExecutionController';

export function positionOf(execution: ProtocolExecutionRecord, stepId: string): number {
  return execution.steps.find(step => step.stepId === stepId)?.position ?? 0;
}

export function deviationSummary(step: ProtocolExecutionRecord['steps'][number]): string | null {
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

export interface ExecutionProgressProps {
  readonly execution: ProtocolExecutionRecord;
  readonly busy: boolean;
  readonly terminal: boolean;
  /** While a save failed, step actions hide until the retry resolves. */
  readonly actionsHidden: boolean;
  readonly stepsHeadingRef: RefObject<TextInstance | null>;
  readonly onArmStep: (flow: ArmedFlow) => void;
  /** The armed step-flow form, rendered between planned steps and actuals. */
  readonly stepFormSlot?: ReactNode;
}

export function ExecutionProgress({
  execution,
  busy,
  terminal,
  actionsHidden,
  stepsHeadingRef,
  onArmStep,
  stepFormSlot,
}: ExecutionProgressProps) {
  const ordered = [...execution.steps].sort((left, right) => left.position - right.position);
  const handledSteps = execution.steps.filter(step => step.state !== 'pending');
  return <>
    <Text
      ref={stepsHeadingRef}
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
        {step.planned.heatPrescription !== undefined && <>
          <Text style={styles.body}>Method: {step.planned.heatPrescription.method.replaceAll('-', ' ')}</Text>
          <Text style={styles.body}>Temperature: {step.planned.heatPrescription.temperature.value}°{step.planned.heatPrescription.temperature.unit}</Text>
          <Text style={styles.body}>Named setting: {step.planned.heatPrescription.setting ?? 'Not recorded'}</Text>
          <Text style={styles.body}>Passes: {step.planned.heatPrescription.passes}</Text>
          <Text style={styles.body}>Duration: {step.planned.heatPrescription.durationMinutes} minutes</Text>
          <Text style={styles.body}>Areas: {step.planned.heatPrescription.zones.map(zone =>
            `${zone.region.replaceAll('_', ' ')} · ${zone.segment.replaceAll('_', ' ')}`).join(', ')}</Text>
          <Text style={styles.subtitle}>{HEAT_PROTOCOL_BOUNDARY}</Text>
        </>}
        {step.planned.reasons.map(entry => <Text key={entry} style={styles.subtitle}>{entry}</Text>)}
        {!terminal && step.state === 'pending' && !actionsHidden && (
          <View style={{ gap: 8 }}>
            <Button
              title={markDoneLabel(step.position)}
              accessibilityLabel={markDoneLabel(step.position)}
              secondary
              disabled={busy}
              onPress={() => onArmStep({ flow: 'complete', stepId: step.stepId })}
            />
            <Button
              title={skipLabel(step.position)}
              accessibilityLabel={skipLabel(step.position)}
              secondary
              disabled={busy}
              onPress={() => onArmStep({ flow: 'skip', stepId: step.stepId })}
            />
            <Button
              title={substituteLabel(step.position)}
              accessibilityLabel={substituteLabel(step.position)}
              secondary
              disabled={busy}
              onPress={() => onArmStep({ flow: 'substitute', stepId: step.stepId })}
            />
            <Button
              title={modifyLabel(step.position)}
              accessibilityLabel={modifyLabel(step.position)}
              secondary
              disabled={busy}
              onPress={() => onArmStep({ flow: 'modify', stepId: step.stepId })}
            />
          </View>
        )}
      </View>
    ))}

    {stepFormSlot}

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
  </>;
}
