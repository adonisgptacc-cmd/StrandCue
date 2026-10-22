import { useState } from 'react';
import { Text, View } from 'react-native';

import { isTerminalStatus } from './cue-check-entry';
import type { TerminalExecutionContext } from './cue-check-state';
import { Button, styles } from './ui';

export interface CueCheckEntryPointProps {
  readonly execution: TerminalExecutionContext;
  /** Hands the routine to the Cue Check form. Opening records nothing. */
  readonly onOpen: (execution: TerminalExecutionContext) => void;
}

/**
 * The invitation shown once a routine is confirmed completed or stopped. It
 * explains that the check-in is about the steps the owner confirmed, never
 * submits anything itself, and can be put off: the routine stays available
 * from Journey.
 */
export function CueCheckEntryPoint({ execution, onOpen }: CueCheckEntryPointProps) {
  const [later, setLater] = useState(false);
  if (!isTerminalStatus(execution.status)) return null;
  if (later) {
    return <View style={styles.notice}>
      <Text style={styles.body}>You can add this any time from Journey.</Text>
    </View>;
  }
  const stopped = execution.status === 'abandoned';
  return <View style={styles.notice}>
    <Text accessibilityRole="header" style={styles.heading}>How did it go?</Text>
    {stopped && <Text style={styles.body}>You stopped this routine early.</Text>}
    <Text style={styles.body}>
      {`You can record how your hair felt after the steps you confirmed${stopped ? ', even if that was only some of them' : ''}. Nothing is saved unless you choose to.`}
    </Text>
    <Button title="Tell us how your hair felt" onPress={() => onOpen({ executionId: execution.executionId, status: execution.status })} />
    <Button title="Do this later" secondary onPress={() => setLater(true)} />
  </View>;
}
