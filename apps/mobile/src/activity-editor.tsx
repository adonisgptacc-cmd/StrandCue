import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  CorrectActivityCommandSchema,
  CreateActivityCommandSchema,
  VoidActivityCommandSchema,
  type ActivityKind,
} from '../../../packages/domain/src/index';
import { secureStorage } from './client';
import { correctActivity, getActivity, recordActivity, voidActivity, type ActivityDetail } from './activity-api';
import {
  removeActivityDraft,
  submitActivityDraft,
  type ActivityDraft,
} from './activity-drafts';
import { activityEditorCopy, type ActivityEditorMode } from './activity-history';
import { Button, Choice, Field, styles } from './ui';

const regions = ['whole_head', 'front', 'crown', 'nape', 'other', 'unknown'] as const;
const segments = ['entire_strand', 'roots', 'mid_lengths', 'ends', 'other', 'unknown'] as const;
const words = (value: string) => value.replaceAll('_', ' ');

const todayInput = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function sendDraft(draft: ActivityDraft) {
  if (draft.mode === 'add') return recordActivity(draft.command);
  if (draft.mode === 'correction') return correctActivity(draft.command);
  return voidActivity(draft.command);
}

export async function loadActivityConflict(
  activityId: string,
  loader: (id: string) => Promise<ActivityDetail | null>,
): Promise<{ latest: ActivityDetail | null; message: string }> {
  try {
    const latest = await loader(activityId);
    return latest
      ? { latest, message: '' }
      : { latest: null, message: 'This activity could not be found. Your draft is retained.' };
  } catch {
    return { latest: null, message: 'The latest entry could not be loaded. Your submitted facts are still here.' };
  }
}

export function ActivityEditor({ owner, mode, activityId, detail, resume, onSaved, onCancel }: {
  owner: string; mode: ActivityEditorMode; activityId?: string; detail?: ActivityDetail | null; resume?: ActivityDraft;
  onSaved: () => void; onCancel: () => void;
}) {
  const [identity, setIdentity] = useState(() => ({
    operationId: resume?.command.operationId ?? Crypto.randomUUID(),
    activityId: resume?.command.activityId ?? activityId ?? detail?.id ?? Crypto.randomUUID(),
  }));
  const [kind, setKind] = useState<ActivityKind>('wash');
  const [precision, setPrecision] = useState('exact_day');
  const [occurredDate, setOccurredDate] = useState(todayInput);
  const [region, setRegion] = useState<string>('whole_head');
  const [segment, setSegment] = useState<string>('entire_strand');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState(resume && resume.mode !== 'add' ? resume.command.reason : '');
  const [pending, setPending] = useState<ActivityDraft | null>(resume ?? null);
  const [latest, setLatest] = useState<ActivityDetail | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, [owner]);
  const locked = pending !== null || busy;
  const copy = activityEditorCopy(mode);

  const submit = async () => {
    if (inFlight.current) return;
    let draft = pending;
    try {
      if (!draft) {
        if (mode === 'add') {
          draft = {
            mode,
            command: CreateActivityCommandSchema.parse({
              operationId: identity.operationId,
              activityId: identity.activityId,
              kind,
              // For unknown precision the stored timestamp is a recording artifact;
              // the effective interval is null and the UI never presents it as fact.
              occurredAt: precision === 'unknown' ? new Date().toISOString() : `${occurredDate}T12:00:00.000Z`,
              precision,
              zones: [{ region, segment }],
              notes: notes.trim() ? notes : null,
            }),
          };
        } else if (mode === 'correction') {
          const target = detail?.revisions.find(revision => revision.kind !== 'void') ?? detail?.revisions.at(-1);
          if (!target) throw new Error('Missing correction target');
          const expectedRevision = detail?.revision ?? 1;
          draft = {
            mode,
            command: CorrectActivityCommandSchema.parse({
              operationId: identity.operationId,
              activityId: identity.activityId,
              expectedRevision,
              correctsId: target.id,
              reason,
              notes,
            }),
          };
        } else {
          const expectedRevision = detail?.revision ?? 1;
          draft = {
            mode,
            command: VoidActivityCommandSchema.parse({
              operationId: identity.operationId,
              activityId: identity.activityId,
              expectedRevision,
              reason,
            }),
          };
        }
      }
    } catch { setMessage('Check the activity kind, date, zone and notes. Corrections and voids need a reason. Unknown dates are valid.'); return; }
    inFlight.current = true; setBusy(true); setMessage(''); setPending(draft);
    try {
      await submitActivityDraft(secureStorage, owner, draft, sendDraft, () => alive.current);
      if (alive.current) onSaved();
    } catch (error) {
      if (!alive.current) return;
      const isConflict = String((error as { message?: string })?.message).includes('revision-conflict');
      setConflict(isConflict);
      if (isConflict) {
        setMessage('This activity changed elsewhere. Your submitted facts are retained while the current entry loads.');
        const result = await loadActivityConflict(identity.activityId, id => getActivity(id, true));
        if (!alive.current) return;
        setLatest(result.latest);
        setMessage(result.message || 'The current entry is loaded below. Review it before discarding the failed attempt.');
      } else {
        setMessage('The save was not confirmed. Your command is locked for an identical retry.');
      }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };

  const discard = async () => {
    setBusy(true); setMessage('');
    try {
      await removeActivityDraft(secureStorage, owner, identity.activityId);
      if (!alive.current) return;
      if (latest) {
        setIdentity(current => ({ ...current, operationId: Crypto.randomUUID() }));
        setPending(null); setConflict(false); setLatest(null);
        setMessage('The failed attempt was discarded. Review the current entry before saving again.');
      } else onCancel();
    } catch { if (alive.current) setMessage('The device draft could not be removed. Please try again.'); }
    finally { if (alive.current) setBusy(false); }
  };

  return <View style={styles.card}>
    <Text style={styles.heading}>{copy.title}</Text>
    <Text style={styles.body}>{mode === 'correction'
      ? 'Replace the recorded facts to correct a mistake. The earlier entry remains in the audit.'
      : mode === 'void'
        ? 'Voiding hides this activity from the default history. The audit trail is preserved.'
        : 'Record a factual wash, styling or other session. Approximate and unknown dates are welcome. No recommendations are generated.'}</Text>
    {pending && <Text style={styles.body}>A save is awaiting confirmation. The fields are locked so retrying sends the same command.</Text>}
    {mode === 'add' && <>
      <Choice label="Activity kind" value={kind} options={['wash', 'styling', 'other']} disabled={locked}
        onChange={value => setKind(value as ActivityKind)} />
      <Choice label="Date precision" value={precision} options={['exact_day', 'exact_month', 'exact_year', 'unknown']} disabled={locked}
        onChange={setPrecision} />
      {precision !== 'unknown' && <Field label={`Occurred date (${precision === 'exact_day' ? 'YYYY-MM-DD' : precision === 'exact_month' ? 'YYYY-MM' : 'YYYY'})`}
        value={occurredDate} editable={!locked} onChangeText={setOccurredDate} />}
      <Choice label="Zone region" value={region} options={[...regions]} disabled={locked} onChange={setRegion} />
      <Choice label="Zone segment" value={segment} options={[...segments]} disabled={locked} onChange={setSegment} />
      <Field label="Short notes (optional, avoid identifying details)" value={notes} editable={!locked} multiline maxLength={2000} onChangeText={setNotes} />
    </>}
    {mode === 'correction' && <>
      <Text style={styles.body}>Correcting activity {words(identity.activityId.slice(0, 8))}…</Text>
      <Field label="Corrected notes" value={notes} editable={!locked} multiline maxLength={2000} onChangeText={setNotes} />
      <Field label="Reason for correction" value={reason} editable={!locked} maxLength={500} onChangeText={setReason} />
    </>}
    {mode === 'void' && <>
      <Text style={styles.body}>Voiding hides this activity from the default history. This cannot be undone except by recording a new activity.</Text>
      <Field label="Reason for void" value={reason} editable={!locked} maxLength={500} onChangeText={setReason} />
    </>}
    {latest && <View style={styles.notice}>
      <Text style={styles.heading}>Current saved entry</Text>
      <Text style={styles.body}>Revision {latest.revision}{latest.voided ? ' · voided' : ''}. Your submitted facts remain in the locked form above.</Text>
      <Button title="Discard failed attempt and review" disabled={busy} onPress={() => void discard()} />
    </View>}
    {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Button title={busy ? 'Saving…' : pending ? 'Retry identical save' : copy.submit} disabled={busy || conflict} onPress={() => void submit()} />
    {pending && !latest && <Button title="Discard device draft" secondary disabled={busy} onPress={() => void discard()} />}
    <Button title={pending ? 'Back to activities (keep draft)' : 'Cancel'} secondary disabled={busy} onPress={onCancel} />
  </View>;
}
