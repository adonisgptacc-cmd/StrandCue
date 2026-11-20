import { Text, TextInput, View } from 'react-native';
import type { Ref } from 'react';
import type { ProgrammeDetail as ProgrammeDetailData } from './programme-api.ts';
import { BLOCKED_CONTENT_COPY, PROGRAMME_DUE_LABELS, PROGRAMME_STATE_LABELS, PROGRAMME_UNIT_LABELS, formatProgrammeDate, missingFactSentence, ownerSafeProductLabel, programmeEventLabel, programmeRangeSentence } from './programme-copy.ts';
import type { ProgrammeFailure } from './programme-errors.ts';
import type { ProgrammeBlockedReason, ProgrammeController, ProgrammeOfferBinding } from './programme-state.ts';
import { useProgrammeController } from './programme-controller-view.ts';
import { ProgrammeActions } from './ProgrammeActions.tsx';
import { ProgrammeHistory } from './ProgrammeHistory.tsx';
import { Button, styles } from './ui.tsx';

export function ProgrammeDetail({ detail, blockedReason, saving, failure, controller, offer, headingRef, onNavigate }: {
  readonly detail: ProgrammeDetailData | null; readonly blockedReason: ProgrammeBlockedReason | null; readonly saving: boolean;
  readonly failure: ProgrammeFailure | null; readonly controller: ProgrammeController; readonly offer?: ProgrammeOfferBinding;
  readonly headingRef?: Ref<unknown>;
  readonly onNavigate?: (destination: 'my_shelf' | 'journey_activities' | 'journey_routines') => void;
}) {
  const state = useProgrammeController(controller);
  detail = state.selected !== null && state.selected.history !== undefined
    ? state.selected as ProgrammeDetailData
    : detail;
  blockedReason = state.blockedReason ?? blockedReason;
  saving = state.phase === 'saving' || saving;
  failure = state.failure ?? failure;
  if (detail === null) return offer === undefined ? <Text accessibilityLiveRegion="polite">Loading this programme</Text> : <View style={styles.card}><Text style={styles.label}>Programme start date</Text><Text style={styles.subtitle}>Use YYYY-MM-DD, for example 2026-10-24.</Text><TextInput accessibilityLabel="Programme start date (YYYY-MM-DD)" style={styles.input} onChangeText={value => { if (controller.getState().enrolDraft === null) controller.startEnrol(offer); controller.setEnrolStartDate({ precision: 'day', value }); }} /><Button title="Start this treatment programme" onPress={() => { const draft = controller.getState().enrolDraft; if (draft !== null) void controller.enrol(offer, draft.startDate); }} /></View>;
  const evaluation = detail.evaluation;
  const blockedCopy = blockedReason === 'reviewed-content-withdrawn' ? BLOCKED_CONTENT_COPY.withdrawn : blockedReason === 'reviewed-content-mismatch' ? BLOCKED_CONTENT_COPY.mismatch : blockedReason === 'product-mismatch' ? BLOCKED_CONTENT_COPY.product : blockedReason === 'reviewed-content-pending' ? BLOCKED_CONTENT_COPY.pending : null;
  return <View style={{ gap: 12 }}>
    <Text ref={headingRef as never} accessibilityRole="header" style={styles.heading}>{ownerSafeProductLabel(detail.productLabel)}</Text>
    <Button secondary title="Back to treatment programmes" onPress={controller.closeDetail} />
    <Button secondary title="Reload this programme" onPress={() => { void controller.reload(); }} />
    {blockedCopy !== null && <Text style={styles.body}>{blockedCopy}</Text>}
    {blockedReason === 'product-mismatch' && (onNavigate !== undefined
      ? <Button secondary title="Go to My Shelf" onPress={() => onNavigate('my_shelf')} />
      : <Text style={styles.label}>Open My Shelf from the main navigation</Text>)}
    {blockedCopy === null && evaluation !== null && <View style={styles.card}>
      <Text style={styles.heading}>{PROGRAMME_STATE_LABELS[evaluation.state]}</Text>
      <Text style={styles.body}>{PROGRAMME_DUE_LABELS[evaluation.dueStatus]}</Text>
      <Text style={styles.body}>{PROGRAMME_UNIT_LABELS[evaluation.unit]}</Text>
      {evaluation.count !== undefined && <Text style={styles.body}>{`${PROGRAMME_UNIT_LABELS[evaluation.unit]} so far: ${evaluation.count}`}</Text>}
      {evaluation.range !== undefined && <Text style={styles.body}>{programmeRangeSentence(evaluation.range, evaluation.unit)}</Text>}
      <Text style={styles.body}>Read on {formatProgrammeDate(evaluation.asOf)}</Text>
      {evaluation.fromCompletedSnapshot && <Text style={styles.body}>Closed from the record at completion</Text>}
      <Text accessibilityRole="header" style={styles.heading}>Counted from your recorded events</Text>
      {evaluation.eventsUsed.map(event => <Text key={event.eventId} style={styles.body}>{programmeEventLabel(event.kind, event.date.value)}</Text>)}
      {evaluation.application !== null && <Text style={styles.body}>Application used: {programmeEventLabel(evaluation.application.kind, evaluation.application.date.value)}</Text>}
      {evaluation.missing.length > 0 && <View><Text accessibilityRole="header" style={styles.heading}>What is missing</Text>{evaluation.missing.map((fact, index) => { const copy = missingFactSentence(fact.code); const destination = copy.destination === 'my_shelf' ? 'my_shelf' : copy.destination === 'journey_activities' ? 'journey_activities' : copy.destination === 'journey_routines' ? 'journey_routines' : null; return <View key={`${fact.code}-${index}`}><Text style={styles.body}>{copy.explanation}</Text>{destination !== null && onNavigate !== undefined ? <Button secondary title={copy.action} onPress={() => onNavigate(destination)} /> : <Text style={styles.label}>{destination === null ? copy.action : `${copy.action.replace(/^Go to /, 'Open ')} from the main navigation`}</Text>}</View>; })}</View>}
    </View>}
    <ProgrammeHistory history={detail.history} />
    <ProgrammeActions detail={detail} saving={saving} failure={failure} reloadRequired={controller.getState().reloadRequired} controller={controller} blocked={blockedCopy !== null} />
  </View>;
}
