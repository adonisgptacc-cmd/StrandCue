import { Text, View } from 'react-native';

import type { CueCheckReceipt } from './cue-check-api';
import { routineLabel } from './cue-check-copy';
import { entryOptions, type EntryAction } from './cue-check-entry';
import { formatDay } from './cue-check-records';
import type { RoutineSummary } from './cue-check-routines';
import type { TerminalExecutionContext } from './cue-check-state';
import { Button, styles } from './ui';

export interface CueCheckRoutinesProps {
  readonly routines: readonly RoutineSummary[];
  /** The check-ins already loaded, used to open rather than duplicate. */
  readonly items: readonly CueCheckReceipt[];
  readonly onStart: (execution: TerminalExecutionContext, timing: 'immediate' | 'delayed') => void;
  readonly onOpen: (recordId: string) => void;
}

function RoutineActions({ routine, name, items, onStart, onOpen }: {
  routine: RoutineSummary; name: string; items: readonly CueCheckReceipt[];
  onStart: CueCheckRoutinesProps['onStart']; onOpen: CueCheckRoutinesProps['onOpen'];
}) {
  const execution = { executionId: routine.executionId, status: routine.status };
  const options = entryOptions(execution, items);
  const button = (action: EntryAction | null, timing: 'immediate' | 'delayed') => {
    if (action === null) return null;
    const startTitle = timing === 'immediate' ? 'Tell us how your hair felt' : 'Add a later check-in';
    const openTitle = timing === 'immediate' ? 'Open your check-in' : 'Open your later check-in';
    const title = action.kind === 'open' ? openTitle : startTitle;
    return <Button
      title={title}
      accessibilityLabel={`${title}: ${name}`}
      secondary={timing === 'delayed'}
      onPress={() => (action.kind === 'open' ? onOpen(action.recordId) : onStart(execution, timing))}
    />;
  };
  return <>{button(options.immediate, 'immediate')}{button(options.delayed, 'delayed')}</>;
}

/**
 * The owner's finished routines, each with the check-ins it can take. A check
 * that already exists is opened, never duplicated. Nothing here records
 * anything: starting only opens the form.
 */
export function CueCheckRoutines({ routines, items, onStart, onOpen }: CueCheckRoutinesProps) {
  if (routines.length === 0) {
    return <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Routines you can check in on</Text>
      <Text style={styles.body}>Finish or stop a routine and it will appear here.</Text>
    </View>;
  }
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={styles.heading}>Routines you can check in on</Text>
    {routines.map((routine, index) => {
      const day = routine.finishedAt === null ? `routine ${index + 1}` : formatDay(routine.finishedAt);
      const name = `${routineLabel(routine.status)}, ${day}`;
      return <View key={routine.executionId} style={styles.card}>
        <Text style={styles.heading}>{routineLabel(routine.status)}</Text>
        <Text style={styles.subtitle}>{routine.finishedAt === null ? 'Date not recorded' : day}</Text>
        <RoutineActions routine={routine} name={name} items={items} onStart={onStart} onOpen={onOpen} />
      </View>;
    })}
  </View>;
}
