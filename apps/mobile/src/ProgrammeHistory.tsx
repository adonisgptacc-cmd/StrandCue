import { Text, View } from 'react-native';
import type { ProgrammeHistoryEntry } from './programme-api.ts';
import { formatProgrammeDate, programmeHistoryLabel } from './programme-copy.ts';
import { styles } from './ui.tsx';

export function ProgrammeHistory({ history }: { readonly history: readonly unknown[] }) {
  const entries = history as readonly ProgrammeHistoryEntry[];
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Recorded changes</Text>
    {entries.length === 0 && <Text style={styles.body}>No recorded changes yet</Text>}
    {entries.map(entry => { const label = programmeHistoryLabel(entry); return <View key={entry.sequence} accessibilityLabel={`${label}, ${formatProgrammeDate(entry.recordedAt)}`}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.body}>{formatProgrammeDate(entry.recordedAt)}</Text>
    </View>; })}
  </View>;
}
