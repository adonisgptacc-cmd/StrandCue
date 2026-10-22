import { Pressable, Text, View } from 'react-native';

import { CUE_CHECK_OBSERVATION_FIELDS } from '../../../packages/domain/src/index';
import type { CueCheckReceipt } from './cue-check-api';
import { answerLabel, goalLabel, questionFor, routineLabel, timingLabel } from './cue-check-copy';
import type { CueCheckFailure } from './cue-check-errors';
import { formatWhen } from './cue-check-records';
import { Button, styles } from './ui';

export interface CueCheckHistoryProps {
  /** Newest first, as the server returns them. */
  readonly items: readonly CueCheckReceipt[];
  readonly status: 'loading' | 'ready' | 'failed';
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly failure: CueCheckFailure | null;
  readonly onOpen: (recordId: string) => void;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
}

const PREVIEW_COUNT = 3;

/** A short selection of the owner's own answers, in plain words, uninterpreted. */
function answerPreview(item: CueCheckReceipt): { readonly shown: string; readonly more: number } {
  const answered = CUE_CHECK_OBSERVATION_FIELDS.filter(field => item.observation[field] !== undefined);
  const shown = answered
    .slice(0, PREVIEW_COUNT)
    .map(field => `${questionFor(field).label}: ${answerLabel(field, item.observation[field])}`)
    .join(' · ');
  return { shown, more: Math.max(0, answered.length - PREVIEW_COUNT) };
}

function CheckRow({ item, index, onOpen }: {
  item: CueCheckReceipt; index: number; onOpen: (recordId: string) => void;
}) {
  const removed = item.lifecycle === 'voided';
  const when = formatWhen(item.observedAt);
  const preview = answerPreview(item);
  // The label stands in for the row's visible text, so it carries the same facts.
  const spoken = preview.shown.replaceAll(' · ', ', ');
  const label = `Open check-in ${index + 1}: ${timingLabel(item.timing)}, ${goalLabel(item.goal)}, ${when}, ${routineLabel(item.executionStatus)}${removed ? ', removed from active history' : ''}${spoken === '' ? '' : `, ${spoken}`}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => onOpen(item.recordId)} style={[styles.pill, { gap: 4, alignItems: 'flex-start' }]}>
    <Text style={styles.heading}>{`${timingLabel(item.timing)} · ${goalLabel(item.goal)}`}</Text>
    <Text style={styles.body}>{when}</Text>
    <Text style={styles.subtitle}>{routineLabel(item.executionStatus)}</Text>
    {removed && <Text style={styles.label}>Removed from active history</Text>}
    {preview.shown !== '' && <Text style={styles.body}>{preview.shown}</Text>}
    {preview.more > 0 && <Text style={styles.subtitle}>{`and ${preview.more} more ${preview.more === 1 ? 'answer' : 'answers'}`}</Text>}
  </Pressable>;
}

/** The owner's check-in list: loading, empty, error, retry, paging and end states. */
export function CueCheckHistory({ items, status, hasMore, loadingMore, failure, onOpen, onLoadMore, onRetry }: CueCheckHistoryProps) {
  return <View style={{ gap: 12 }}>
    {status === 'loading' && items.length === 0 && <Text accessibilityLiveRegion="polite" style={styles.body}>Loading your check-ins…</Text>}
    {failure !== null && <View style={styles.notice}>
      <Text style={styles.error}>{failure.message}</Text>
      <Button title="Try again" onPress={onRetry} />
    </View>}
    {status === 'ready' && items.length === 0 && <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>No check-ins yet.</Text>
      <Text style={styles.body}>After a routine, you can record how your hair felt. Nothing is recorded unless you choose to.</Text>
    </View>}
    {items.map((item, index) => <CheckRow key={item.recordId} item={item} index={index} onOpen={onOpen} />)}
    {(loadingMore || (hasMore && failure === null)) && <Button
      title={loadingMore ? 'Loading more check-ins…' : 'Load more check-ins'}
      secondary
      disabled={loadingMore}
      onPress={onLoadMore}
    />}
    {status === 'ready' && !hasMore && items.length > 0 && <Text style={styles.subtitle}>That is everything you have recorded.</Text>}
  </View>;
}
