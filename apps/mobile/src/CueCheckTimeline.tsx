import { Text, View } from 'react-native';

import type { CueCheckDetail } from './cue-check-api';
import { CueCheckAnswers } from './CueCheckAnswers';
import { formatWhen } from './cue-check-records';
import { styles } from './ui';

type Revision = CueCheckDetail['revisions'][number];

/**
 * The check-in's history of changes in plain words: first recorded, corrected
 * (with its reason) and removed from active history (with its reason). Only the
 * latest answers are ever called current; replaced answers are labelled so.
 */
export function CueCheckTimeline({ revisions, removed }: { revisions: readonly Revision[]; removed: boolean }) {
  let lastWithAnswers = -1;
  revisions.forEach((revision, index) => {
    if (revision.kind !== 'void') lastWithAnswers = index;
  });
  return <View style={{ gap: 12 }}>
    {revisions.map((revision, index) => {
      const heading = revision.kind === 'create' ? 'First recorded' : revision.kind === 'correct' ? 'Corrected' : 'Removed from active history';
      const reason = revision.kind === 'correct' ? revision.correctionReason : revision.kind === 'void' ? revision.voidReason : null;
      return <View key={revision.revisionId} style={styles.notice}>
        <Text accessibilityRole="header" style={styles.label}>{heading}</Text>
        <Text style={styles.subtitle}>{formatWhen(revision.receivedAt)}</Text>
        {reason !== null && <Text style={styles.body}>{`Reason: ${reason}`}</Text>}
        {revision.kind !== 'void' && (index === lastWithAnswers
          ? <Text style={styles.subtitle}>{removed ? 'These are the answers shown above.' : 'These are your current answers, shown above.'}</Text>
          : <CueCheckAnswers heading="Earlier answers (replaced)" observation={revision.observation} />)}
      </View>;
    })}
  </View>;
}
