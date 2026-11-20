import { Pressable, Text, TextInput, View } from 'react-native';
import type { Ref } from 'react';
import { PROGRAMME_DUE_LABELS, PROGRAMME_STATE_LABELS, PROGRAMME_UNIT_LABELS, BLOCKED_CONTENT_COPY, formatProgrammeDate, ownerSafeProductLabel } from './programme-copy.ts';
import type { ProgrammeController, ProgrammeOfferBinding, ProgrammeState } from './programme-state.ts';
import { useProgrammeController } from './programme-controller-view.ts';
import { Button, styles } from './ui.tsx';

export function ProgrammeList({ state, controller, offer, headingRef }: { readonly state: ProgrammeState; readonly controller: ProgrammeController; readonly offer: ProgrammeOfferBinding | null; readonly headingRef?: Ref<unknown> }) {
  state = useProgrammeController(controller);
  const blocked = state.phase === 'blocked-content';
  return <View style={{ gap: 12 }}>
    <Text ref={headingRef as never} accessibilityRole="header" style={styles.heading}>Treatment programmes</Text>
    {(state.phase === 'idle' || state.phase === 'loading-list') && !state.listLoaded && <Text accessibilityLiveRegion="polite" style={styles.body}>Loading your treatment programmes</Text>}
    {state.failure?.source === 'list' && <View style={styles.notice}><Text style={styles.body}>{state.failure.message}</Text><Button title="Retry loading programmes" onPress={() => { void controller.retry(); }} /></View>}
    {blocked && <Text style={styles.body}>{BLOCKED_CONTENT_COPY.pending}</Text>}
    {state.listLoaded && state.items.length === 0 && !blocked && <View style={styles.card}><Text style={styles.body}>No treatment programmes yet</Text><Text style={styles.body}>A programme appears here only after reviewed product instructions are available.</Text></View>}
    {offer !== null && state.items.length === 0 && !blocked && <Enrol offer={offer} controller={controller} />}
    {state.items.map((item, index) => {
      const evaluation = item.evaluation;
      const stateLabel = evaluation === null ? 'Stopped' : PROGRAMME_STATE_LABELS[evaluation.state];
      const due = evaluation === null ? '' : PROGRAMME_DUE_LABELS[evaluation.dueStatus];
      const unit = evaluation === null ? '' : PROGRAMME_UNIT_LABELS[evaluation.unit];
      const productLabel = ownerSafeProductLabel(item.productLabel);
      const label = [`Open treatment programme ${index + 1}: ${productLabel}`, stateLabel, due, unit, `changed ${formatProgrammeDate(item.updatedAt)}`].filter(Boolean).join(', ');
      return <Pressable key={item.enrolmentId} accessibilityRole="button" accessibilityLabel={label} onPress={() => { void controller.openDetail(item.enrolmentId); }} style={styles.pill}>
        <Text style={styles.heading}>{productLabel}</Text><Text style={styles.body}>{`Open treatment programme ${index + 1}`}</Text><Text style={styles.body}>{stateLabel}</Text>{due !== '' && <Text style={styles.body}>{due}</Text>}{unit !== '' && <Text style={styles.body}>{unit}</Text>}<Text style={styles.subtitle}>Last changed {formatProgrammeDate(item.updatedAt)}</Text>
      </Pressable>;
    })}
    {state.hasMore && <Button secondary title="Load more treatment programmes" onPress={() => { void controller.loadMore(); }} />}
    {state.listLoaded && <Button secondary title="Reload treatment programmes" onPress={() => { void controller.loadList(); }} />}
  </View>;
}

function Enrol({ offer, controller }: { offer: ProgrammeOfferBinding; controller: ProgrammeController }) {
  return <View style={styles.card}><Text style={styles.label}>Programme start date</Text><Text style={styles.subtitle}>Use YYYY-MM-DD, for example 2026-10-24.</Text><TextInput accessibilityLabel="Programme start date (YYYY-MM-DD)" style={styles.input} onChangeText={value => { if (controller.getState().enrolDraft === null) controller.startEnrol(offer); controller.setEnrolStartDate({ precision: 'day', value }); }} /><Button title="Start this treatment programme" onPress={() => { const draft = controller.getState().enrolDraft; if (draft !== null) void controller.enrol(offer, draft.startDate); }} /></View>;
}
