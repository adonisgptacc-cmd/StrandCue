import { useEffect, useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { CueCheckObservationField, CueCheckTiming } from '../../../packages/domain/src/index';
import { CueCheckQuestion } from './CueCheckQuestion';
import { NOTES_PROMPT, questionsFor } from './cue-check-copy';
import type { CueCheckFailure } from './cue-check-errors';
import {
  NOTES_LIMIT,
  REASON_LIMIT,
  canSaveCorrection,
  canSaveNew,
  changeSentence,
  describeChanges,
} from './cue-check-form-model';
import type { CueCheckDraft } from './cue-check-state';
import { focusOn } from './focus';
import { Button, colors, styles } from './ui';

export interface CueCheckFormProps {
  readonly mode: 'new' | 'correction';
  readonly timing: CueCheckTiming;
  readonly draft: CueCheckDraft;
  readonly reason: string;
  /** The answers being corrected; required for a correction. */
  readonly original?: CueCheckDraft;
  readonly saving: boolean;
  readonly failure: CueCheckFailure | null;
  /** True after a conflict: the owner must reload before saving again. */
  readonly reloadRequired?: boolean;
  readonly onAnswer: (field: CueCheckObservationField, value: string | undefined) => void;
  readonly onNotes: (notes: string) => void;
  readonly onReason: (reason: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly onReload?: () => void;
}

const INTRO: Readonly<Record<'new-immediate' | 'new-delayed' | 'correction', string>> = {
  'new-immediate':
    'These questions are about how your hair felt after the steps you confirmed. Skip any you like. Choosing “Not sure” is fine too.',
  'new-delayed':
    'These questions cover what you noticed later. Skip any you like. Choosing “Not sure” is fine too.',
  correction: 'Your earlier entry stays in your history. Change what you need to, then say why.',
};

const REACTION_NOTE =
  'StrandCue cannot assess reactions. If you are worried about how your skin or scalp feels, a health professional can help.';
const WRITE_SOURCES: ReadonlySet<string> = new Set(['create', 'correct', 'void']);

/** A running count, with the remaining room spelled out near the limit. Never a live region: it would re-read on every key. */
function Count({ used, limit }: { used: number; limit: number }) {
  const left = limit - used;
  return <>
    <Text style={styles.subtitle}>{`${used} of ${limit} characters used`}</Text>
    {left <= 100 && <Text style={styles.subtitle}>{`${left} characters left`}</Text>}
  </>;
}

/**
 * The Cue Check form: new check-in or correction. It is presentational: the
 * parent owns the draft, saving state and failure. A skipped question stays
 * absent from the draft; the save control stays mounted while saving so
 * focus is not lost.
 */
export function CueCheckForm(props: CueCheckFormProps) {
  const { mode, timing, draft, reason, original, saving, failure, onAnswer, onNotes, onReason, onSave, onCancel } = props;
  const errorRef = useRef<unknown>(null);
  const headingRef = useRef<unknown>(null);
  const reloadRequired = props.reloadRequired === true;
  // Focus the form's own heading when it opens, so the screen reader does not
  // stay on a control that just disappeared; a failure takes focus instead.
  useEffect(() => {
    focusOn(headingRef);
  }, []);
  useEffect(() => {
    if (failure !== null) focusOn(errorRef);
  }, [failure]);

  const correcting = mode === 'correction';
  const changes = correcting ? describeChanges(original ?? {}, draft) : [];
  const savable = !reloadRequired && (correcting ? canSaveCorrection({ draft, original: original ?? {}, reason }) : canSaveNew(draft));
  const notes = typeof draft.notes === 'string' ? draft.notes : '';
  const saveLabel = correcting ? (saving ? 'Saving correction…' : 'Save correction') : saving ? 'Saving check-in…' : 'Save check-in';
  const hint = reloadRequired
    ? 'Reload this check-in before saving.'
    : correcting
    ? changes.length === 0
      ? 'Change an answer or your note to save a correction.'
      : reason.trim() === ''
        ? 'Add a reason for the correction to save.'
        : ''
    : savable
      ? ''
      : 'Add at least one answer or a note to save.';

  return <View style={{ gap: 20 }}>
    <View style={styles.card}>
      <Text ref={headingRef as never} accessibilityRole="header" style={styles.heading}>{correcting ? 'Correct an earlier entry' : timing === 'delayed' ? 'What did you notice later?' : 'How did your hair feel?'}</Text>
      <Text style={styles.body}>{correcting ? INTRO.correction : timing === 'delayed' ? INTRO['new-delayed'] : INTRO['new-immediate']}</Text>
    </View>
    <View style={styles.card}>
      {questionsFor(timing).map(question => {
        const stored = draft[question.field];
        return <View key={question.field} style={{ gap: 8 }}>
          <CueCheckQuestion
            question={question}
            value={typeof stored === 'string' ? stored : undefined}
            disabled={saving}
            onChange={value => onAnswer(question.field, value)}
          />
          {question.field === 'immediateReaction' && stored === 'some-noticed' && <Text accessibilityLiveRegion="polite" style={styles.subtitle}>{REACTION_NOTE}</Text>}
        </View>;
      })}
      <View>
        <Text style={styles.label}>{NOTES_PROMPT}</Text>
        <TextInput
          accessibilityLabel={NOTES_PROMPT}
          editable={!saving}
          multiline
          maxLength={NOTES_LIMIT}
          placeholderTextColor={colors.quiet}
          style={[styles.input, { minHeight: 96 }]}
          value={notes}
          onChangeText={onNotes}
        />
        <Count used={notes.length} limit={NOTES_LIMIT} />
        <Text style={styles.subtitle}>Your note is saved exactly as you write it. StrandCue does not read meaning into it.</Text>
      </View>
    </View>
    {correcting && <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>What will change</Text>
      {changes.length === 0
        ? <Text style={styles.body}>Nothing has changed yet.</Text>
        : changes.map(line => <Text key={line.label} style={styles.body}>{changeSentence(line)}</Text>)}
      <View>
        <Text style={styles.label}>Why are you correcting this entry?</Text>
        <TextInput
          accessibilityLabel="Why are you correcting this entry?"
          editable={!saving}
          maxLength={REASON_LIMIT}
          placeholderTextColor={colors.quiet}
          style={styles.input}
          value={reason}
          onChangeText={onReason}
        />
        <Count used={reason.length} limit={REASON_LIMIT} />
      </View>
    </View>}
    {(failure !== null || reloadRequired) && <View style={styles.notice}>
      {failure !== null && <Text ref={errorRef as never} accessibilityRole="alert" style={styles.error}>{failure.message}</Text>}
      {reloadRequired && props.onReload !== undefined && <Button title="Reload this check-in" onPress={props.onReload} />}
      {failure !== null && failure.retryable && !reloadRequired && WRITE_SOURCES.has(failure.source) && <Button title="Try saving again" onPress={() => { if (!saving) onSave(); }} />}
    </View>}
    {hint !== '' && <Text style={styles.subtitle}>{hint}</Text>}
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={saveLabel}
        accessibilityHint={hint === '' ? undefined : hint}
        accessibilityState={{ disabled: !savable && !saving, busy: saving }}
        onPress={() => { if (savable && !saving) onSave(); }}
        style={[styles.button, !savable && !saving && { opacity: 0.5 }]}
      >
        <Text style={styles.buttonText}>{saveLabel}</Text>
      </Pressable>
      <Button title="Cancel" secondary disabled={saving} onPress={onCancel} />
    </View>
  </View>;
}
