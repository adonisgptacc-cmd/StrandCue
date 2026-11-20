import { Pressable, Text, View } from 'react-native';

import { NOT_SURE_LABEL, type CueQuestion } from './cue-check-copy';
import { colors, styles } from './ui';

export interface CueCheckQuestionProps {
  readonly question: CueQuestion;
  /** The stored answer, or undefined when the question was skipped. */
  readonly value: string | undefined;
  readonly disabled?: boolean;
  /** `undefined` clears the answer; "Not sure" is the stored value `unknown`. */
  readonly onChange: (value: string | undefined) => void;
}

/**
 * One optional question. Every option's accessible name carries the question,
 * "Not sure" is always offered and is distinct from skipping, and an answered
 * question can be cleared back to skipped. Selection is shown with a mark as
 * well as colour.
 */
export function CueCheckQuestion({ question, value, disabled = false, onChange }: CueCheckQuestionProps) {
  const options = [...question.options, { value: 'unknown', label: NOT_SURE_LABEL }];
  return <View accessibilityRole="radiogroup" accessibilityLabel={question.prompt} style={{ gap: 8 }}>
    <Text style={styles.label}>{question.prompt}</Text>
    <View style={styles.row}>
      {options.map(option => {
        const selected = value === option.value;
        return <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityLabel={`${question.prompt}: ${option.label}`}
          accessibilityState={{ selected, disabled }}
          disabled={disabled}
          onPress={() => onChange(option.value)}
          style={[styles.pill, selected && styles.selected]}
        >
          <Text style={[styles.body, selected && { color: colors.white }]}>{selected ? `✓ ${option.label}` : option.label}</Text>
        </Pressable>;
      })}
      {value !== undefined && <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Clear answer to: ${question.prompt}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onChange(undefined)}
        style={[styles.pill, styles.secondary]}
      >
        <Text style={styles.body}>Clear answer</Text>
      </Pressable>}
    </View>
  </View>;
}
