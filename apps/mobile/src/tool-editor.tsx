import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  ArchiveUserToolCommandSchema,
  CreateUserToolCommandSchema,
  MatchUserToolCommandSchema,
} from '../../../packages/domain/src/index';
import { secureStorage } from './client';
import { archiveUserTool, getUserTool, matchUserTool, recordUserTool, type ToolDetail } from './tool-api';
import {
  removeToolDraft,
  submitToolDraft,
  type ToolDraft,
} from './tool-drafts';
import { toolEditorCopy, type ToolEditorMode } from './tool-history';
import { Button, Choice, Field, styles } from './ui';

const toolTypes = ['dryer', 'heated-air-brush', 'air-styler', 'hood-dryer', 'flat-iron', 'hot-comb', 'curling-iron', 'steam-straightener', 'heated-rollers', 'diffuser', 'other'] as const;

async function sendDraft(draft: ToolDraft) {
  if (draft.mode === 'add') return recordUserTool(draft.command);
  if (draft.mode === 'match') return matchUserTool(draft.command);
  return archiveUserTool(draft.command);
}

export async function loadToolConflict(
  userToolId: string,
  loader: (id: string) => Promise<ToolDetail | null>,
): Promise<{ latest: ToolDetail | null; message: string }> {
  try {
    const latest = await loader(userToolId);
    return latest
      ? { latest, message: '' }
      : { latest: null, message: 'This tool could not be found. Your draft is retained.' };
  } catch {
    return { latest: null, message: 'The latest entry could not be loaded. Your submitted facts are still here.' };
  }
}

export function ToolEditor({ owner, mode, userToolId, detail, resume, onSaved, onCancel }: {
  owner: string; mode: ToolEditorMode; userToolId?: string; detail?: ToolDetail; resume?: ToolDraft;
  onSaved: () => void; onCancel: () => void;
}) {
  const [identity, setIdentity] = useState(() => ({
    operationId: resume?.command.operationId ?? Crypto.randomUUID(),
    userToolId: resume?.command.userToolId ?? userToolId ?? detail?.id ?? Crypto.randomUUID(),
  }));
  const [manualBrand, setManualBrand] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [toolType, setToolType] = useState<string>('dryer');
  const [availability, setAvailability] = useState('available');
  const [notes, setNotes] = useState('');
  const [versionId, setVersionId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<ToolDraft | null>(resume ?? null);
  const [latest, setLatest] = useState<ToolDetail | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, [owner]);
  const locked = pending !== null || busy;
  const copy = toolEditorCopy(mode);
  const expectedRevision = detail?.revision ?? 1;

  const submit = async () => {
    if (inFlight.current) return;
    let draft = pending;
    try {
      if (!draft) {
        if (mode === 'add') {
          draft = {
            mode,
            command: CreateUserToolCommandSchema.parse({
              operationId: identity.operationId,
              userToolId: identity.userToolId,
              versionId: null,
              manualBrand: manualBrand.trim() ? manualBrand : null,
              manualModel: manualModel.trim() ? manualModel : null,
              toolType,
              availability,
              notes: notes.trim() ? notes : null,
            }),
          };
        } else if (mode === 'match') {
          if (!confirmed) throw new Error('Confirmation required');
          draft = {
            mode,
            command: MatchUserToolCommandSchema.parse({
              operationId: identity.operationId,
              userToolId: identity.userToolId,
              expectedRevision,
              versionId,
              confirmed: true,
            }),
          };
        } else {
          draft = {
            mode,
            command: ArchiveUserToolCommandSchema.parse({
              operationId: identity.operationId,
              userToolId: identity.userToolId,
              expectedRevision,
            }),
          };
        }
      }
    } catch { setMessage('Check the brand, model, type and notes. Matching needs a catalogue version and explicit confirmation.'); return; }
    inFlight.current = true; setBusy(true); setMessage(''); setPending(draft);
    try {
      await submitToolDraft(secureStorage, owner, draft, sendDraft, () => alive.current);
      if (alive.current) onSaved();
    } catch (error) {
      if (!alive.current) return;
      const isConflict = String((error as { message?: string })?.message).includes('revision-conflict');
      setConflict(isConflict);
      if (isConflict) {
        setMessage('This tool changed elsewhere. Your submitted facts are retained while the current entry loads.');
        const result = await loadToolConflict(identity.userToolId, id => getUserTool(id, true));
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
      await removeToolDraft(secureStorage, owner, identity.userToolId);
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
    <Text style={styles.body}>{mode === 'add'
      ? 'Add a tool you own. Unknown temperatures and wattages stay unknown — they are never inferred.'
      : mode === 'match'
        ? 'Link this entry to a catalogue version. Your original manual details are preserved and matching needs explicit confirmation.'
        : 'Archiving removes this tool from the active list. Prior records that used it are preserved.'}</Text>
    {pending && <Text style={styles.body}>A save is awaiting confirmation. The fields are locked so retrying sends the same command.</Text>}
    {mode === 'add' && <>
      <Field label="Brand (as printed)" value={manualBrand} editable={!locked} maxLength={200} onChangeText={setManualBrand} />
      <Field label="Model" value={manualModel} editable={!locked} maxLength={200} onChangeText={setManualModel} />
      <Choice label="Tool type" value={toolType} options={[...toolTypes]} disabled={locked} onChange={setToolType} />
      <Choice label="Availability" value={availability} options={['available', 'out_of_stock', 'archived']} disabled={locked} onChange={setAvailability} />
      <Field label="Short notes (optional, avoid identifying details)" value={notes} editable={!locked} multiline maxLength={2000} onChangeText={setNotes} />
    </>}
    {mode === 'match' && <>
      <Text style={styles.body}>Matching links this entry without rewriting what you originally recorded.</Text>
      <Field label="Catalogue version ID" value={versionId} editable={!locked} onChangeText={setVersionId} />
      <Choice label="I confirm this is the same tool" value={confirmed ? 'yes' : 'no'} options={['no', 'yes']} disabled={locked}
        onChange={value => setConfirmed(value === 'yes')} />
    </>}
    {mode === 'archive' && <Text style={styles.body}>Archived tools leave the active list. Their history remains.</Text>}
    {latest && <View style={styles.notice}>
      <Text style={styles.heading}>Current saved entry</Text>
      <Text style={styles.body}>Revision {latest.revision} · {latest.availability}. Your submitted facts remain in the locked form above.</Text>
      <Button title="Discard failed attempt and review" disabled={busy} onPress={() => void discard()} />
    </View>}
    {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Button title={busy ? 'Saving…' : pending ? 'Retry identical save' : copy.submit} disabled={busy || conflict} onPress={() => void submit()} />
    {pending && !latest && <Button title="Discard device draft" secondary disabled={busy} onPress={() => void discard()} />}
    <Button title={pending ? 'Back to tools (keep draft)' : 'Cancel'} secondary disabled={busy} onPress={onCancel} />
  </View>;
}
