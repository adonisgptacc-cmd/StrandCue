import { Text, View } from 'react-native';

import { CUE_CHECK_OBSERVATION_FIELDS } from '../../../packages/domain/src/index';
import { NOTES_LABEL, answerLabel, questionFor } from './cue-check-copy';
import { styles } from './ui';

/**
 * The answers one observation holds, exactly as recorded: only the questions
 * that were answered appear (skipped ones stay absent), "Not sure" is shown as
 * such, and the note is shown verbatim.
 */
export function CueCheckAnswers({ heading, observation }: {
  readonly heading: string;
  readonly observation: Readonly<Record<string, unknown>>;
}) {
  const answered = CUE_CHECK_OBSERVATION_FIELDS.filter(field => observation[field] !== undefined);
  const notes = typeof observation.notes === 'string' && observation.notes.length > 0 ? observation.notes : null;
  return <View style={{ gap: 8 }}>
    <Text accessibilityRole="header" style={styles.heading}>{heading}</Text>
    {answered.length === 0 && notes === null && <Text style={styles.body}>No answers were recorded.</Text>}
    {answered.map(field => <View key={field}>
      <Text style={styles.label}>{questionFor(field).prompt}</Text>
      <Text style={styles.body}>{answerLabel(field, observation[field])}</Text>
    </View>)}
    {notes !== null && <View>
      <Text style={styles.label}>{NOTES_LABEL}</Text>
      <Text style={styles.body}>{notes}</Text>
    </View>}
  </View>;
}
