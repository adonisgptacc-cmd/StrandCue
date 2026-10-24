import { Text, View } from 'react-native';
import type { ProgrammeDetail } from './programme-api.ts';
import { PAUSE_REASON_CODES, PAUSE_REASON_LABELS } from './programme-copy.ts';
import type { ProgrammeFailure } from './programme-errors.ts';
import type { ProgrammeController } from './programme-state.ts';
import { useProgrammeController } from './programme-controller-view.ts';
import { Button, styles } from './ui.tsx';

export function ProgrammeActions({ detail, saving, failure, reloadRequired, controller, blocked = false }: {
  readonly detail: ProgrammeDetail | null; readonly saving: boolean; readonly failure: ProgrammeFailure | null;
  readonly reloadRequired: boolean; readonly controller: ProgrammeController;
  readonly blocked?: boolean;
}) {
  const state = useProgrammeController(controller);
  detail = state.selected !== null && state.selected.history !== undefined
    ? state.selected as ProgrammeDetail
    : detail;
  if (detail === null) return null;
  if (reloadRequired) return <View style={styles.notice}><Text style={styles.body}>{failure?.message}</Text><Button title="Show the latest programme" onPress={() => { void controller.retry(); }} /></View>;
  if (state.phase === 'offline-pending') return <View style={styles.notice}><Text style={styles.body}>{failure?.message}</Text><Button title="Try saving again" onPress={() => { void controller.retry(); }} /></View>;
  if (detail.status !== 'active') return null;
  if (blocked) {
    if (state.confirmation === 'abandon') return <View style={styles.card}><Text style={styles.body}>Your past history stays in Journey. This cannot be undone.</Text><Button title="Confirm: stop this programme" onPress={() => { void controller.confirm(); }} /><Button secondary title="Keep this programme" onPress={controller.cancelConfirmation} /></View>;
    return <Button secondary title="Stop this programme" disabled={saving} onPress={controller.startAbandon} />;
  }
  if (state.confirmation === 'pause') return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Pause this programme?</Text>
    {PAUSE_REASON_CODES.map(code => <Button key={code} secondary title={`Reason: ${PAUSE_REASON_LABELS[code]}`} onPress={() => { controller.setPauseReason(code); void controller.confirm(); }} />)}
    <Button secondary title="Keep it active" onPress={controller.cancelConfirmation} />
  </View>;
  if (state.confirmation === 'abandon') return <View style={styles.card}><Text style={styles.body}>Your past history stays in Journey. This cannot be undone.</Text><Button title="Confirm: stop this programme" onPress={() => { void controller.confirm(); }} /><Button secondary title="Keep this programme" onPress={controller.cancelConfirmation} /></View>;
  if (state.confirmation === 'complete') return <View style={styles.card}><Text style={styles.body}>Completion closes this recorded programme. It does not assess a product result.</Text><Button title="Confirm: complete this programme" onPress={() => { void controller.confirm(); }} /><Button secondary title="Keep this programme open" onPress={controller.cancelConfirmation} /></View>;
  if (detail.paused !== null) return <View style={styles.card}>
    <Text style={styles.body}>This programme needs an approved resumption before it can continue.</Text>
    <Button secondary title="Stop this programme" disabled={saving} onPress={controller.startAbandon} />
  </View>;
  return <View style={styles.row}>
    <Button title={saving ? 'Saving pause' : 'Pause this programme'} disabled={saving} onPress={controller.startPause} />
    <Button secondary title="Complete this programme" disabled={saving} onPress={controller.startComplete} />
    <Button secondary title="Stop this programme" disabled={saving} onPress={controller.startAbandon} />
  </View>;
}
