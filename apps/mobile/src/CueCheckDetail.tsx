import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';

import type { CueCheckDetail as DetailRecord, CueCheckReceipt } from './cue-check-api';
import { CueCheckAnswers } from './CueCheckAnswers';
import { CueCheckTimeline } from './CueCheckTimeline';
import { goalLabel, routineLabel, timingLabel } from './cue-check-copy';
import { formatWhen } from './cue-check-records';
import { focusOn } from './focus';
import { Button, styles } from './ui';

export interface CueCheckDetailProps {
  /** A receipt alone is shown while its full history is still loading. */
  readonly detail: CueCheckReceipt | DetailRecord;
  readonly canAddLater: boolean;
  /** The history refresh failed, so only the receipt is shown. */
  readonly historyUnavailable?: boolean;
  readonly onReloadHistory?: () => void;
  readonly onCorrect: () => void;
  readonly onRemove: () => void;
  readonly onBack: () => void;
  readonly onAddLater: () => void;
}

/**
 * One check-in exactly as recorded: the current answers, the routine steps the
 * owner confirmed, and the history of changes. Planned-but-unconfirmed steps
 * never appear, product identity is never shown, and nothing is interpreted.
 */
export function CueCheckDetail({ detail, canAddLater, historyUnavailable = false, onReloadHistory, onCorrect, onRemove, onBack, onAddLater }: CueCheckDetailProps) {
  const headingRef = useRef<unknown>(null);
  // Focus the heading when the record opens, so the screen reader does not
  // stay on the list row that was just replaced.
  useEffect(() => {
    focusOn(headingRef);
  }, []);
  const removed = detail.lifecycle === 'voided';
  const revisions = 'revisions' in detail ? detail.revisions : null;
  return <View style={{ gap: 20 }}>
    <View style={styles.card}>
      <Text ref={headingRef as never} accessibilityRole="header" style={styles.heading}>{timingLabel(detail.timing)}</Text>
      {removed && <Text style={styles.label}>Removed from active history</Text>}
      <Text style={styles.body}>{`${goalLabel(detail.goal)} · ${routineLabel(detail.executionStatus)}`}</Text>
      <Text style={styles.body}>{`Noticed on ${formatWhen(detail.observedAt)}`}</Text>
      <Text style={styles.subtitle}>{`Saved to your record ${formatWhen(detail.receivedAt)}`}</Text>
    </View>
    <View style={styles.card}>
      <CueCheckAnswers heading={removed ? 'Answers when it was removed' : 'Current answers'} observation={detail.observation} />
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Steps you confirmed</Text>
      {detail.confirmedSteps.length === 0
        ? <Text style={styles.body}>No completed step was recorded for this routine.</Text>
        : detail.confirmedSteps.map(step => <Text key={step.stepId} style={styles.body}>{`${step.position}. ${step.action}`}</Text>)}
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>History of this check-in</Text>
      {revisions === null && !historyUnavailable && <Text accessibilityLiveRegion="polite" style={styles.body}>Loading the full history…</Text>}
      {revisions === null && historyUnavailable && <>
        <Text style={styles.body}>The full history could not be loaded.</Text>
        {onReloadHistory !== undefined && <Button title="Try loading the history again" onPress={onReloadHistory} />}
      </>}
      {revisions !== null && <CueCheckTimeline revisions={revisions} removed={removed} />}
    </View>
    <View style={styles.card}>
      <Text style={styles.subtitle}>This is your own recorded observation. It stays private to you.</Text>
      {!removed && <Button title="Correct this check-in" onPress={onCorrect} />}
      {!removed && <Button title="Remove from active history" secondary onPress={onRemove} />}
      {canAddLater && <Button title="Add a later check-in for this routine" secondary onPress={onAddLater} />}
      <Button title="Back to check-ins" secondary onPress={onBack} />
    </View>
  </View>;
}
