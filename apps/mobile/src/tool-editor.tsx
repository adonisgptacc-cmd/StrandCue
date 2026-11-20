import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  ArchiveUserToolCommandSchema,
  ChangeUserToolCommandSchema,
  CorrectUserToolCommandSchema,
  CreateUserToolCommandSchema,
  toolCorrectionTargetRevision,
  TOOL_CORRECTION_IDENTITY_RULE,
} from '../../../packages/domain/src/index';
import { secureStorage } from './client';
import { archiveUserTool, changeUserTool, correctUserTool, recordUserTool, todayEffectiveDate, type ToolDetail } from './tool-api';
import {
  attachmentOptions, conditionChoices, conditionOptions, heatMethodChoices, heatMethodOptions, recordedToolIdentityWording, toolSaveFailure, toolTypeChoices, toolTypeOptions,
} from './tool-copy';
import { removeToolDraft, submitToolDraft, type ToolFormDraft } from './tool-drafts';
import {
  emptyToolForm, factsFromForm, factsPatch, formFromDetail, formProblems, identityPatch, toggleAttachmentKind, toggleHeatMethod, type ToolForm, type ToolFormProblems,
} from './tool-form';
import { focusOn } from './focus';
import { toolEditorCopy, type ToolFormMode } from './tool-history';
import { Button, Choice, Field, MultiChoice, styles } from './ui';

type Props = {
  owner: string;
  mode: ToolFormMode;
  userToolId?: string;
  detail?: ToolDetail;
  resume?: ToolFormDraft;
  onSaved: () => void;
  onCancel: () => void;
  /** Show the latest stored entry after a stale save. */
  onStale: () => void;
};

/** Spoken once by the screen reader; a status that merely mounts with its text is not reliably announced. */
const announce = (text: string): void => { AccessibilityInfo.announceForAccessibility(text); };

const answerLabels = { '': 'Not answered', unknown: 'Not sure' } as const;
const withBlank = (options: readonly string[], labels: Readonly<Record<string, string>>) => ({ options: ['', ...options], labels: { '': 'Not answered', ...labels } });
const typeChoice = withBlank(toolTypeChoices, toolTypeOptions);
const conditionChoice = withBlank(conditionChoices, conditionOptions);
const stateLabels = (listing: string): Record<string, string> => ({ ...answerLabels, recorded: listing });
const attachmentStateLabels: Record<string, string> = { ...answerLabels, none: 'None', recorded: 'I will list them' };
const availabilityLabels: Record<string, string> = { available: 'Available', out_of_stock: 'Not available right now' };
const adjustableLabels: Record<string, string> = { ...answerLabels, yes: 'Yes', no: 'No' };
const unitLabels: Record<string, string> = { C: 'Celsius', F: 'Fahrenheit' };
const attachmentKindChoices = ['diffuser', 'concentrator', 'comb', 'brush', 'other'];

const noChange = 'Nothing has changed, so there is nothing to save.';
const noopRule = 'The correction has to change the brand, the model or the tool type. These words are the same as before.';

function FieldProblem({ text }: { text: string | undefined }) {
  return text ? <Text style={styles.error}>{text}</Text> : null;
}

/**
 * The form for adding, editing and correcting an owner's tool, and for archiving it.
 *
 * Every answer starts as "not answered": nothing is filled in from a model name, a wattage, a tool type or a heat
 * method, and a temperature exists only when the owner types one, with the unit they chose. A save is a command with
 * one operation id: it is written to the device before it is sent, a failed save locks the form so the retry sends the
 * same command, a stale entry is never retried, and a refusal says which rule it broke. The primary action keeps its
 * place from the first tap to the retry.
 */
export function ToolEditor({ owner, mode, userToolId, detail, resume, onSaved, onCancel, onStale }: Props) {
  const [identity, setIdentity] = useState(() => ({
    operationId: resume?.command.operationId ?? Crypto.randomUUID(),
    userToolId: resume?.command.userToolId ?? userToolId ?? detail?.id ?? Crypto.randomUUID(),
  }));
  const start = useMemo(() => (mode === 'add' ? emptyToolForm() : formFromDetail(detail)), [mode, detail]);
  const [form, setForm] = useState<ToolForm>(start);
  const [pending, setPending] = useState<ToolFormDraft | null>(resume ?? null);
  const [blocked, setBlocked] = useState<'conflict' | 'refused' | null>(null);
  const [, setProblems] = useState<ToolFormProblems>({});
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState('');
  // Every message, even one worded like the last, takes the focus again: it is said once, at the message, never also announced.
  const [saidAt, setSaidAt] = useState(0);
  const say = (text: string) => { setMessage(text); setSaidAt(count => count + 1); };
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const reason = useRef('');
  const messageRef = useRef<unknown>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // A refusal can remove the button that was pressed; the reason takes the focus it leaves.
  useEffect(() => { if (saidAt > 0) focusOn(messageRef); }, [saidAt]);

  const locked = pending !== null || busy;
  const copy = toolEditorCopy(mode);
  const set = <K extends keyof ToolForm>(key: K, value: ToolForm[K]) => setForm(previous => ({ ...previous, [key]: value }));
  const setRow = (index: number, change: Partial<ToolForm['settings'][number]>) =>
    setForm(previous => ({ ...previous, settings: previous.settings.map((row, at) => (at === index ? { ...row, ...change } : row)) }));
  const live = (scope: 'add' | 'edit') => (attempted ? formProblems(form, scope) : {});

  /** Builds the one command this screen sends, or says why it cannot yet. Nothing is sent from here. */
  const buildDraft = (): ToolFormDraft | null => {
    reason.current = '';
    const refuse = (text: string): null => { reason.current = text; say(text); return null; };
    const scope = mode === 'add' ? 'add' : 'edit';
    if (mode === 'add' || mode === 'edit') {
      const found = formProblems(form, scope);
      if (Object.keys(found).length > 0) { setProblems(found); return null; }
    }
    if (mode === 'add') {
      return { mode, command: CreateUserToolCommandSchema.parse({
        operationId: identity.operationId, userToolId: identity.userToolId, effectiveDate: todayEffectiveDate(), versionId: null,
        manualBrand: form.brand.trim() || null, manualModel: form.model.trim() || null, toolType: form.toolType || null,
        availability: form.availability, ...factsFromForm(form),
      }) };
    }
    if (!detail) return refuse('This tool could not be found. Open it from your tools and try again.');
    if (mode === 'edit') {
      const patch = factsPatch(start, form);
      const availability = form.availability !== start.availability ? form.availability : undefined;
      if (Object.keys(patch).length === 0 && availability === undefined) return refuse(noChange);
      return { mode, command: ChangeUserToolCommandSchema.parse({
        operationId: identity.operationId, userToolId: identity.userToolId, expectedRevision: detail.revision, effectiveDate: todayEffectiveDate(),
        ...(availability === undefined ? {} : { availability }), ...patch,
      }) };
    }
    if (mode === 'correct') {
      const target = toolCorrectionTargetRevision(detail.revisions);
      if (!target) return refuse('There is no entry to correct yet. Open the tool and try again.');
      const patch = identityPatch(start, form);
      if (Object.keys(patch).length === 0) return refuse(noopRule);
      if (form.reason.trim() === '') { setProblems({}); return refuse('Say why you are correcting this tool.'); }
      return { mode, command: CorrectUserToolCommandSchema.parse({
        operationId: identity.operationId, userToolId: identity.userToolId, expectedRevision: detail.revision, correctsId: target.id,
        reason: form.reason.trim(), effectiveDate: todayEffectiveDate(), ...patch,
      }) };
    }
    if (!confirmed) return refuse('Confirm that you want to archive this tool. Its history stays in your record.');
    return { mode, command: ArchiveUserToolCommandSchema.parse({ operationId: identity.operationId, userToolId: identity.userToolId, expectedRevision: detail.revision }) };
  };

  const send = async (draft: ToolFormDraft) => {
    inFlight.current = true; setBusy(true); setMessage(''); setPending(draft);
    announce('Saving the tool.');
    let saved = false;
    try {
      await submitToolDraft(secureStorage, owner, draft, value => {
        const saving = value as ToolFormDraft;
        if (saving.mode === 'add') return recordUserTool(saving.command);
        if (saving.mode === 'edit') return changeUserTool(saving.command);
        if (saving.mode === 'correct') return correctUserTool(saving.command);
        return archiveUserTool(saving.command);
      }, () => alive.current);
      saved = true;
      if (alive.current) { announce('Tool saved.'); onSaved(); }
    } catch (error) {
      if (!alive.current) return;
      const failure = toolSaveFailure(error);
      say(failure.message);
      if (failure.kind !== 'retry') {
        // A stale entry or a refusal is final for this command: the saved copy is dropped.
        try { await removeToolDraft(secureStorage, owner, identity.userToolId); } catch { /* the owner can still discard it */ }
        if (!alive.current) return;
        setPending(null); setBlocked(failure.kind); setIdentity(previous => ({ ...previous, operationId: Crypto.randomUUID() }));
      }
    } finally {
      inFlight.current = false;
      if (alive.current && !saved) setBusy(false);
    }
  };

  const submit = () => {
    if (inFlight.current) return;
    if (pending) { void send(pending); return; }
    setAttempted(true); setMessage(''); setProblems({});
    let draft: ToolFormDraft | null = null;
    try { draft = buildDraft(); } catch {
      const text = 'Check the details you entered and try again.';
      say(text); return;
    }
    if (draft) { void send(draft); return; }
    // The reason is shown at its field or in the message; one summary is spoken.
    // A reason is said at its message, which takes the focus; the field summary has no message to carry it, so it is announced.
    if (reason.current !== '') return;
    if (mode === 'add' || mode === 'edit') announce(summary(formProblems(form, mode)));
    else announce('This tool was not saved. Check the message above and try again.');
  };

  const discard = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      await removeToolDraft(secureStorage, owner, identity.userToolId);
      if (!alive.current) return;
      setPending(null); setBlocked(null); setIdentity(previous => ({ ...previous, operationId: Crypto.randomUUID() }));
      const text = 'The failed attempt was discarded. Nothing was saved.';
      say(text);
    } catch { if (alive.current) say('The device draft could not be removed. Please try again.'); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };

  const shown = live(mode === 'add' ? 'add' : 'edit');
  const target = mode === 'correct' && detail ? toolCorrectionTargetRevision(detail.revisions) : null;
  const factsForm = mode === 'add' || mode === 'edit';
  const messageNode = !!message && <Text ref={messageRef as never} style={styles.error}>{message}</Text>;

  const primary = pending
    ? { title: busy ? 'Saving…' : 'Try saving again', label: busy ? 'Saving the tool' : 'Try saving the tool again' }
    : { title: busy ? 'Saving…' : copy.submit, label: busy ? 'Saving the tool' : copy.submit };

  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>{copy.title}</Text>
    <Text style={styles.body}>{{
      add: 'Add a tool you own. Everything except the model is optional, and not knowing is a valid answer. Nothing is guessed: a temperature exists only if you type one.',
      edit: 'Record what changed about this tool. The brand, model and type are kept as they are; a wrong one is corrected from the tool, and the original stays readable in your history.',
      correct: `Correct what you recorded about this tool. The correction is added to your history, and the entry it replaces stays readable. ${TOOL_CORRECTION_IDENTITY_RULE}`,
      archive: 'Archiving removes this tool from the active list. Its history stays in your record.',
    }[mode]}</Text>
    {pending && <Text style={styles.body}>A save is waiting. The fields are locked so a retry sends the same command.</Text>}
    {target && <Text style={styles.body}>{`You are correcting the entry that recorded ${recordedToolIdentityWording(target.patch)}.`}</Text>}
    {!resume && (mode === 'add' || mode === 'correct') && <>
      <Field label="Brand (as printed)" value={form.brand} editable={!locked} maxLength={200} onChangeText={value => set('brand', value)} />
      <FieldProblem text={shown.brand} />
      <Field label="Model" value={form.model} editable={!locked} maxLength={200} onChangeText={value => set('model', value)} />
      <FieldProblem text={shown.model} />
      <Choice label="Tool type" value={form.toolType} options={typeChoice.options} labels={typeChoice.labels} disabled={locked} onChange={value => set('toolType', value)} />
    </>}
    {!resume && mode === 'correct' && <Field label="Reason for this correction (required)" value={form.reason} editable={!locked} maxLength={500}
      accessibilityHint="Required. Say why you are correcting this tool. The reason is kept with the correction." onChangeText={value => set('reason', value)} />}
    {!resume && factsForm && <>
      <Choice label="Availability" value={form.availability} options={['available', 'out_of_stock']} labels={availabilityLabels} disabled={locked}
        onChange={value => set('availability', value as ToolForm['availability'])} />
      <Field label="Power in watts (optional, only if you know it)" value={form.wattage} editable={!locked} keyboardType="number-pad" maxLength={5} onChangeText={value => set('wattage', value)} />
      <FieldProblem text={shown.wattage} />
      <Choice label="Adjustable temperature" value={form.adjustable} options={['', 'yes', 'no', 'unknown']} labels={adjustableLabels} disabled={locked}
        onChange={value => set('adjustable', value as ToolForm['adjustable'])} />
      <Choice label="Settings" value={form.settingsState} options={['', 'unknown', 'recorded']} labels={stateLabels('I will list them')} disabled={locked}
        onChange={value => set('settingsState', value as ToolForm['settingsState'])} />
      {form.settingsState === 'recorded' && <>
        {form.settings.map((row, index) => <View key={index} style={styles.notice}>
          <Field label={`Setting ${index + 1} name`} value={row.label} editable={!locked} maxLength={60} onChangeText={value => setRow(index, { label: value })} />
          <Choice label={`Setting ${index + 1} unit`} value={row.unit} options={['C', 'F']} labels={unitLabels} disabled={locked} onChange={value => setRow(index, { unit: value as 'C' | 'F' })} />
          <Field label={`Setting ${index + 1} temperature in degrees ${unitLabels[row.unit]} (optional)`} value={row.value} editable={!locked} keyboardType="number-pad" maxLength={3}
            onChangeText={value => setRow(index, { value })} />
          <Button title="Remove" accessibilityLabel={`Remove setting ${index + 1}`} secondary disabled={locked} onPress={() => setForm(previous => ({ ...previous, settings: previous.settings.filter((_, at) => at !== index) }))} />
        </View>)}
        <Button title="Add a setting" secondary disabled={locked || form.settings.length >= 10} onPress={() => setForm(previous => ({ ...previous, settings: [...previous.settings, { label: '', value: '', unit: 'C' }] }))} />
      </>}
      <FieldProblem text={shown.settings} />
      <Choice label="Attachments" value={form.attachmentsState} options={['', 'unknown', 'none', 'recorded']} labels={attachmentStateLabels} disabled={locked}
        onChange={value => set('attachmentsState', value as ToolForm['attachmentsState'])} />
      {form.attachmentsState === 'recorded' && <>
        <MultiChoice label="Attachments you have (these clip on and are not a way the tool heats)" value={form.attachmentKinds} options={attachmentKindChoices} labels={attachmentOptions}
          disabled={locked} toggle={toggleAttachmentKind} onChange={value => set('attachmentKinds', value)} />
        {form.attachmentKinds.includes('other') && <Field label="Other attachment names, one per line" value={form.attachmentOther} editable={!locked} multiline onChangeText={value => set('attachmentOther', value)} />}
      </>}
      <FieldProblem text={shown.attachments} />
      <Choice label="Condition" value={form.condition} options={conditionChoice.options} labels={conditionChoice.labels} disabled={locked}
        onChange={value => set('condition', value as ToolForm['condition'])} />
      <Choice label="How it heats" value={form.heatState} options={['', 'unknown', 'recorded']} labels={stateLabels('I will choose')} disabled={locked}
        onChange={value => set('heatState', value as ToolForm['heatState'])} />
      {form.heatState === 'recorded' && <MultiChoice label="Heat methods" value={form.heatMethods} options={heatMethodChoices} labels={heatMethodOptions}
        disabled={locked} toggle={(value, option) => toggleHeatMethod(value as never, option as never)} onChange={value => set('heatMethods', value as never)} />}
      <FieldProblem text={shown.heat} />
      <Field label="Short notes (optional, avoid identifying details)" value={form.notes} editable={!locked} multiline maxLength={2000} onChangeText={value => set('notes', value)} />
      <FieldProblem text={shown.notes} />
    </>}
    {!resume && mode === 'archive' && <Choice label="I confirm I want to archive this tool" value={confirmed ? 'yes' : 'no'} options={['no', 'yes']}
      labels={{ no: 'No, keep it', yes: 'Yes, archive it' }} disabled={locked} onChange={value => { setConfirmed(value === 'yes'); setMessage(''); }} />}
    {attempted && Object.keys(shown).length > 0 && <Text style={styles.error}>{summary(shown)}</Text>}
    {messageNode}
    {/* One primary button keeps its place from the first tap to the retry, so focus is never lost on the consequential step. */}
    {/* A resumed command has no fields on screen: once it is refused or deleted nothing is offered that would save an empty form. */}
    {blocked !== 'conflict' && !(resume && (blocked === 'refused' || !pending)) && <Button title={primary.title} accessibilityLabel={primary.label} disabled={busy} onPress={submit} />}
    {blocked === 'conflict' && <Button title="Show the latest entry" onPress={onStale} />}
    {pending && !busy && <Button title="Delete the saved attempt" secondary onPress={() => void discard()} />}
    <Button title={pending ? 'Back to tools (keep for later)' : 'Cancel'} accessibilityLabel={pending ? 'Back to tools (keep for later)' : 'Cancel without saving'} secondary disabled={busy} onPress={onCancel} />
  </View>;
}

function summary(shown: ToolFormProblems): string {
  const count = Object.keys(shown).length;
  return count <= 1 ? 'This tool was not saved. Check the field marked above and try again.' : 'This tool was not saved. Check the fields marked above and try again.';
}
