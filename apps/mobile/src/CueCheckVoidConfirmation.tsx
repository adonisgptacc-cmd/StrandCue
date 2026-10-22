import { useEffect, useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { CueCheckTiming } from '../../../packages/domain/src/index';
import { timingLabel } from './cue-check-copy';
import type { CueCheckFailure } from './cue-check-errors';
import { REASON_LIMIT } from './cue-check-form-model';
import { focusOn } from './focus';
import { Button, colors, styles } from './ui';

export interface CueCheckVoidConfirmationProps {
  readonly timing: CueCheckTiming;
  /** The check-in's own date and time, so the dialog names what is affected. */
  readonly whenLabel: string;
  readonly reason: string;
  readonly saving: boolean;
  readonly failure: CueCheckFailure | null;
  readonly reloadRequired?: boolean;
  readonly onReason: (reason: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onReload?: () => void;
}

/**
 * Confirmation before a check-in leaves active history. It says what stays,
 * what changes and what is untouched, and requires a reason. The word
 * "delete" is deliberately absent: the original answers remain private.
 */
export function CueCheckVoidConfirmation(props: CueCheckVoidConfirmationProps) {
  const { timing, whenLabel, reason, saving, failure, onReason, onConfirm, onCancel } = props;
  const errorRef = useRef<unknown>(null);
  const headingRef = useRef<unknown>(null);
  const reloadRequired = props.reloadRequired === true;
  useEffect(() => {
    focusOn(headingRef);
  }, []);
  useEffect(() => {
    if (failure !== null) focusOn(errorRef);
  }, [failure]);
  const ready = !reloadRequired && reason.trim().length > 0 && reason.trim().length <= REASON_LIMIT;
  const hint = reloadRequired ? 'Reload this check-in before removing it.' : 'Add a reason to remove this check-in.';
  const label = saving ? 'Removing…' : 'Remove from active history';
  return <View
    role="alertdialog"
    accessibilityLabel={`Remove this check-in from active history: ${timingLabel(timing)}, ${whenLabel}`}
    style={styles.card}
  >
    <Text ref={headingRef as never} accessibilityRole="header" style={styles.heading}>Remove this check-in from active history?</Text>
    <Text style={styles.body}>{`${timingLabel(timing)}, ${whenLabel}`}</Text>
    <Text style={styles.body}>This check-in will no longer count as an active check-in.</Text>
    <Text style={styles.body}>Your original answers stay in your private history.</Text>
    <Text style={styles.body}>This does not change the product catalogue or anyone else’s records.</Text>
    <View>
      <Text style={styles.label}>Why are you removing this check-in?</Text>
      <TextInput
        accessibilityLabel="Why are you removing this check-in?"
        editable={!saving}
        maxLength={REASON_LIMIT}
        placeholderTextColor={colors.quiet}
        style={styles.input}
        value={reason}
        onChangeText={onReason}
      />
      <Text style={styles.subtitle}>{`${reason.length} of ${REASON_LIMIT} characters used`}</Text>
    </View>
    {(failure !== null || reloadRequired) && <View style={styles.notice}>
      {failure !== null && <Text ref={errorRef as never} accessibilityRole="alert" style={styles.error}>{failure.message}</Text>}
      {reloadRequired && props.onReload !== undefined && <Button title="Reload this check-in" onPress={props.onReload} />}
    </View>}
    {!ready && <Text style={styles.subtitle}>{hint}</Text>}
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={ready ? undefined : hint}
        accessibilityState={{ disabled: !ready && !saving, busy: saving }}
        onPress={() => { if (ready && !saving) onConfirm(); }}
        style={[styles.button, !ready && !saving && { opacity: 0.5 }]}
      >
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
      <Button title="Keep this check-in" secondary disabled={saving} onPress={onCancel} />
    </View>
  </View>;
}
