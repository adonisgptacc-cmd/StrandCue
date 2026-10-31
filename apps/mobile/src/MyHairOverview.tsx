import { Text, View } from 'react-native';
import { Button, styles, fieldLabel, display } from './ui';
import type { PassportRecord } from './passport-api';
import { describeLength, goalGaps, legacyLength, legacyLengthNotice } from './passport-completeness';

/** My Hair overview: one screen, two clearly separated layers.
 *
 * 1. "Your hair now" — the current projection, one human line per fact. The
 *    length never appears as two independent rows: a record carrying both
 *    the readable legacy centimetre entry and a newer structured measurement
 *    shows the measurement as current and tells the earlier entry as history.
 * 2. "What changed, when" — the dated entries, read newest first, hiding
 *    entries a correction has superseded (the Journey history view is where
 *    the full correction audit lives).
 *
 * The screen is read-only: it opens the Passport editor through a callback
 * and never writes a fact itself, and the Today check-in keeps its own
 * no-save promise (session-only, nothing here or behind it touches the
 * Passport). Completeness is per chosen goal, never a universal score. */

export function MyHairOverview({record, onRecordChange}: {
  record: PassportRecord;
  onRecordChange: () => void;
}) {
  const values = record.projection.values;
  const length = describeLength(values);
  // A legacy length the projection cannot place in time is still a length
  // the record holds, so the overview says so instead of showing nothing.
  const legacy = legacyLength({values, ambiguousFields: record.projection.ambiguousFields});
  const legacyNotice = legacyLengthNotice(legacy, 'read');
  const gaps = goalGaps({values, ambiguousFields: record.projection.ambiguousFields});
  const superseded = record.projection.supersededRevisionIds;
  const dated = record.revisions.filter(entry => !superseded.includes(entry.id)).slice().reverse();
  const hasAnyGoal = Array.isArray(values.goals) && values.goals.some(goal => goal !== 'none' && goal !== 'unknown');
  return <>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.kicker}>YOUR HAIR NOW</Text>
      <Text accessibilityRole="header" style={styles.heading}>Recorded as of {record.projection.asOf}</Text>
      {length.current !== null && <View accessibilityLabel="Your length"><Text style={styles.label}>{length.legacyNote === null ? 'Length' : 'Latest length'}</Text><Text style={styles.body}>{length.current}</Text></View>}
      {length.legacyNote !== null && <Text accessibilityLabel="Earlier length entry" style={styles.body}>{length.legacyNote}</Text>}
      {length.current === null && legacyNotice !== null && <Text accessibilityLabel="Earlier length entry" style={styles.body}>{legacyNotice}</Text>}
      {Object.entries(values).filter(([key]) => key !== 'lengthCm' && key !== 'lengthMeasurement').map(([key, value]) => <View key={key} accessibilityLabel={fieldLabel(key)}><Text style={styles.label}>{fieldLabel(key)}</Text><Text style={styles.body}>{display(value)}</Text></View>)}
      {Object.keys(record.projection.ambiguousFields).map(key => <View key={key} style={styles.notice}><Text style={styles.label}>{key === 'lengthCm' ? 'Length' : fieldLabel(key)}</Text><Text style={styles.body}>Dates overlap or are unknown. Review these entries in History to clarify which is current.</Text></View>)}
      <Button title="Record a change" onPress={onRecordChange}/>
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.kicker}>FOR THE GOALS YOU CHOSE</Text>
      {!hasAnyGoal
        ? <Text style={styles.body}>Nothing to complete yet. Choose a goal in your Passport to see which recorded facts its plan leans on — not sure is always a valid answer too.</Text>
        : gaps.map(gap => <View key={gap.goal}>
          <Text style={styles.heading}>For {gap.label.toLowerCase()}</Text>
          {gap.missing.length === 0
            ? <Text style={styles.body}>The facts this goal leans on are all recorded. You can review or change any of them at any time.</Text>
            : gap.missing.map(question => <Text key={question} style={styles.body}>· {question.charAt(0).toUpperCase() + question.slice(1)}</Text>)}
        </View>)}
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.kicker}>WHAT CHANGED, WHEN</Text>
      {dated.length === 0 && <Text style={styles.body}>Your history begins with your first Passport entry.</Text>}
      {dated.map(entry => <View key={entry.id} style={styles.row}>
        <Text style={styles.body}>{entry.kind === 'correction' ? 'CORRECTION' : entry.kind === 'baseline' ? 'FIRST RECORD' : 'CHANGE'} · {entry.effectiveDate.value ?? 'DATE UNKNOWN'}</Text>
        <Text style={styles.body}>{Object.entries(entry.patch).map(([key, value]) => `${fieldLabel(key)}: ${display(value)}`).join(' · ')}</Text>
        {'correctionReason' in entry && <Text style={styles.body}>Reason: {entry.correctionReason}</Text>}
      </View>)}
    </View>
    <Text style={styles.subtitle}>A real change creates a new entry. To fix an earlier mistake, use History → Correct this entry.</Text>
  </>;
}
