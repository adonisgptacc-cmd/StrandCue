import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { MINIMUM_COMPARABLE_SAMPLE } from '../../../packages/domain/src/index';
import type { CueCheckReceipt } from './cue-check-api';
import { SUMMARY_TIMING_HEADINGS, goalLabel } from './cue-check-copy';
import { summarizeReceipts, type SummaryRow } from './cue-check-records';
import { styles } from './ui';

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function Row({ row, showGoal }: { row: SummaryRow; showGoal: boolean }) {
  const insufficient = row.evidence === 'insufficient';
  return <View style={{ gap: 4 }}>
    {showGoal && <Text style={styles.subtitle}>{goalLabel(row.goal)}</Text>}
    {row.entries.map(entry => <View key={entry.wording}>
      <Text style={styles.body}>{entry.wording}</Text>
      {!insufficient && <Text style={styles.subtitle}>{`${entry.numerator} of ${entry.denominator} comparable answers`}</Text>}
    </View>)}
    {insufficient && <Text style={styles.subtitle}>{`${plural(row.denominator, 'comparable answer')} so far. At least ${MINIMUM_COMPARABLE_SAMPLE} are needed.`}</Text>}
    {row.unknownCount > 0 && <Text style={styles.subtitle}>{`Not sure answers: ${row.unknownCount}`}</Text>}
  </View>;
}

/**
 * What the owner reported across comparable check-ins. All counts and wording
 * come from the Task 4.1 domain summary, rendered as given. It adds no score,
 * percentage, ranking, advice or claim about causes, and is not evidence about
 * any product.
 */
export function CueCheckSummary({ items, hasMore }: { items: readonly CueCheckReceipt[]; hasMore: boolean }) {
  const result = useMemo(() => summarizeReceipts(items), [items]);
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>What you recorded</Text>
    <Text style={styles.body}>This is based on your own recorded observations.</Text>
    <Text style={styles.subtitle}>It is not medical advice or product evidence.</Text>
    {!result.ok && <Text accessibilityRole="alert" style={styles.error}>This summary could not be built safely.</Text>}
    {result.ok && result.groups.length === 0 && <Text style={styles.body}>Summaries appear once you have recorded a few comparable check-ins.</Text>}
    {result.ok && result.groups.map(group => <View key={group.timing} style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={styles.label}>{SUMMARY_TIMING_HEADINGS[group.timing]}</Text>
      {group.rows.map(row => <Row key={row.key} row={row} showGoal={result.goals.length > 1} />)}
    </View>)}
    {result.ok && result.groups.length > 0 && <Text style={styles.subtitle}>Answers marked “Not sure” are not included in the comparison count.</Text>}
    {hasMore && <Text style={styles.subtitle}>This summary covers the check-ins loaded so far. Load more to include older ones.</Text>}
  </View>;
}
